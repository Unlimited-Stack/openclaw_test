/**
 * OpenClaw Bridge 独立服务器 — HTTP REST API + WebSocket Bridge 合一
 *
 * 单进程 (port 4060):
 *   ├── HTTP REST API (/api/*)     ← 替代 Next.js 路由
 *   ├── WebSocket Bridge (ws://)   ← OpenClaw 连接
 *   └── Internal API (/internal/*) ← 仅 localhost
 */

import "dotenv/config";

import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { createLogger } from "./logger.js";
import { handleRequest } from "./router.js";
import { clients } from "./clients.js";
import {
  validateApiKey,
  recordConnection,
  removeConnection,
  updateHeartbeat,
  getOrCreateOpenClawConversation,
} from "./openclaw/service.js";
import { sendMessage } from "./conversation/service.js";
import { ClientMessage, type AuthResultMsg, type MessageInbound } from "./openclaw/protocol.js";
import { closeDatabase } from "./db/client.js";

const log = createLogger("server");
const PORT = parseInt(process.env.BRIDGE_PORT ?? "4060", 10);

// ─── HTTP 服务器 ────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  await handleRequest(req, res);
});

// ─── WebSocket 服务器 ───────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let authenticated = false;
  let clientUserId: string | null = null;

  log.info("New WebSocket connection from client");

  // 认证超时：10 秒内必须完成 auth
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      ws.close(4001, "Auth timeout");
    }
  }, 10_000);

  // 响应 WebSocket 协议级 ping
  ws.on("ping", () => {
    log.info({ userId: clientUserId }, "WS-level ping received");
    if (clientUserId) {
      const client = clients.get(clientUserId);
      if (client && client.ws === ws) {
        client.lastPing = Date.now();
      }
    }
  });

  ws.on("message", async (raw) => {
    try {
      const rawStr = raw.toString();
      const data = JSON.parse(rawStr);
      const parsed = ClientMessage.safeParse(data);
      if (!parsed.success) {
        log.warn({ rawStr: rawStr.slice(0, 200), errors: parsed.error.issues }, "Invalid message format");
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
        return;
      }

      const msg = parsed.data;

      // ─── auth ─────────────────────────────────────
      if (msg.type === "auth") {
        clearTimeout(authTimeout);

        const result = await validateApiKey(msg.apiKey);
        if (!result) {
          const authResult: AuthResultMsg = {
            type: "auth_result",
            success: false,
            error: "Invalid or expired API key",
          };
          ws.send(JSON.stringify(authResult));
          ws.close(4003, "Auth failed");
          return;
        }

        // 静默替换旧连接（不发 4004，避免客户端重连循环）
        const oldClient = clients.get(result.userId);
        if (oldClient && oldClient.ws !== ws) {
          log.info({ userId: result.userId }, "Replacing old connection silently");
          oldClient.ws.terminate(); // 直接断开，不发 close frame
          clients.delete(result.userId);
        }

        // 获取或创建 OpenClaw 专属对话
        const { conversationId } = await getOrCreateOpenClawConversation(result.userId);

        // 记录连接
        authenticated = true;
        clientUserId = result.userId;
        clients.set(result.userId, {
          ws,
          userId: result.userId,
          keyId: result.keyId,
          conversationId,
          lastPing: Date.now(),
        });

        await recordConnection(result.userId, result.keyId);

        const authResult: AuthResultMsg = {
          type: "auth_result",
          success: true,
          conversationId,
          userId: result.userId,
        };
        ws.send(JSON.stringify(authResult));
        log.info({ userId: result.userId, conversationId }, "Client authenticated");
        return;
      }

      // 未认证的消息一律拒绝
      if (!authenticated || !clientUserId) {
        ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
        return;
      }

      // ─── ping ─────────────────────────────────────
      if (msg.type === "ping") {
        const client = clients.get(clientUserId);
        if (client && client.ws === ws) {
          client.lastPing = Date.now();
        }
        updateHeartbeat(clientUserId).catch(() => {});
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      // ─── message_reply ────────────────────────────
      if (msg.type === "message_reply") {
        await sendMessage(
          msg.conversationId,
          clientUserId,
          "openclaw",
          msg.content,
        );
        log.info({ userId: clientUserId, conversationId: msg.conversationId }, "OpenClaw reply saved");
      }
    } catch (err) {
      log.error({ err }, "WS message handler error");
    }
  });

  ws.on("close", async (code, reason) => {
    clearTimeout(authTimeout);
    log.info({ userId: clientUserId, code, reason: reason?.toString() }, "WS close event");
    if (clientUserId) {
      const current = clients.get(clientUserId);
      if (current && current.ws === ws) {
        clients.delete(clientUserId);
        await removeConnection(clientUserId).catch(() => {});
        log.info({ userId: clientUserId }, "Client removed from map");
      } else {
        log.info({ userId: clientUserId }, "Old connection closed, new connection preserved");
      }
    }
  });

  ws.on("error", (err) => {
    log.error({ err, userId: clientUserId }, "WS error");
  });
});

// ─── 心跳超时检测（每 30s 检查一次，90s 无心跳断开）──────────

setInterval(() => {
  const now = Date.now();
  for (const [userId, client] of clients) {
    if (now - client.lastPing > 90_000) {
      log.warn({ userId }, "Heartbeat timeout, closing");
      client.ws.close(4005, "Heartbeat timeout");
      clients.delete(userId);
      removeConnection(userId).catch(() => {});
    }
  }
}, 30_000);

// ─── 优雅退出 ───────────────────────────────────────────────────

async function shutdown() {
  log.info("Shutting down...");
  wss.close();
  server.close();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── 启动 ───────────────────────────────────────────────────────

server.listen(PORT, () => {
  log.info({ port: PORT }, "OpenClaw Bridge Server started (HTTP + WS)");
});
