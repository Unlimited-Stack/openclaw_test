/**
 * REST API 路由处理 — 纯 Node.js HTTP，无框架
 *
 * 路由表：
 *   POST   /api/auth/login           登录
 *   POST   /api/auth/register        注册
 *   POST   /api/auth/refresh         刷新 token
 *   POST   /api/openclaw/keys        创建 API Key（需 auth）
 *   GET    /api/openclaw/keys        列出 API Key（需 auth）
 *   DELETE /api/openclaw/keys/:id    撤销 API Key（需 auth）
 *   GET    /api/openclaw/status      连接状态（需 auth）
 *   GET    /api/openclaw/conversation 获取/创建 OpenClaw 对话（需 auth）
 *   POST   /api/conversations/:id/messages  发消息（需 auth）
 *   GET    /api/conversations/:id/messages  消息列表（需 auth）
 *   GET    /health                   健康检查
 */

import http from "node:http";
import { requireAuth, AuthHttpError } from "./auth/middleware.js";
import * as authService from "./auth/service.js";
import * as openclawService from "./openclaw/service.js";
import * as conversationService from "./conversation/service.js";
import { clients, forwardToOpenClaw } from "./clients.js";
import { createLogger } from "./logger.js";

const log = createLogger("router");

// ─── 工具函数 ────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseUrl(url: string): { pathname: string; query: URLSearchParams } {
  const idx = url.indexOf("?");
  if (idx === -1) return { pathname: url, query: new URLSearchParams() };
  return { pathname: url.slice(0, idx), query: new URLSearchParams(url.slice(idx + 1)) };
}

// ─── 路由处理 ────────────────────────────────────────────────────

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  const { pathname, query } = parseUrl(req.url ?? "/");

  try {
    // ── Health ──
    if (pathname === "/health" && method === "GET") {
      json(res, 200, { status: "ok", connections: clients.size });
      return;
    }

    // ── Auth Routes (no auth required) ──
    if (pathname === "/api/auth/login" && method === "POST") {
      const body = JSON.parse(await readBody(req));
      const result = await authService.login({
        email: body.email,
        password: body.password,
        deviceInfo: body.deviceInfo,
      });
      json(res, 200, result);
      return;
    }

    if (pathname === "/api/auth/register" && method === "POST") {
      const body = JSON.parse(await readBody(req));
      const result = await authService.register({
        email: body.email,
        password: body.password,
        name: body.name,
        deviceInfo: body.deviceInfo,
      });
      json(res, 201, result);
      return;
    }

    if (pathname === "/api/auth/refresh" && method === "POST") {
      const body = JSON.parse(await readBody(req));
      const tokens = await authService.refresh({
        refreshToken: body.refreshToken,
        deviceInfo: body.deviceInfo,
      });
      json(res, 200, tokens);
      return;
    }

    // ── OpenClaw API Key Routes (auth required) ──
    if (pathname === "/api/openclaw/keys" && method === "POST") {
      const auth = requireAuth(req);
      const body = JSON.parse(await readBody(req));
      const result = await openclawService.createApiKey(
        auth.userId,
        body.label,
        body.expiresInDays,
      );
      json(res, 201, {
        id: result.id,
        rawKey: result.rawKey,
        label: result.label,
        expiresAt: result.expiresAt.toISOString(),
      });
      return;
    }

    if (pathname === "/api/openclaw/keys" && method === "GET") {
      const auth = requireAuth(req);
      const keys = await openclawService.listApiKeys(auth.userId);
      json(res, 200, keys);
      return;
    }

    // DELETE /api/openclaw/keys/:id
    const deleteKeyMatch = pathname.match(/^\/api\/openclaw\/keys\/([0-9a-f-]+)$/);
    if (deleteKeyMatch && method === "DELETE") {
      const auth = requireAuth(req);
      const keyId = deleteKeyMatch[1];
      const ok = await openclawService.revokeApiKey(keyId, auth.userId);
      if (!ok) {
        json(res, 404, { error: "API Key 不存在或无权操作" });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    // ── OpenClaw Status ──
    if (pathname === "/api/openclaw/status" && method === "GET") {
      const auth = requireAuth(req);
      const status = await openclawService.getConnectionStatus(auth.userId);
      json(res, 200, status);
      return;
    }

    // ── OpenClaw Conversation ──
    if (pathname === "/api/openclaw/conversation" && method === "GET") {
      const auth = requireAuth(req);
      const result = await openclawService.getOrCreateOpenClawConversation(auth.userId);
      json(res, 200, result);
      return;
    }

    // ── Conversation Messages ──
    // POST /api/conversations/:id/messages
    const postMsgMatch = pathname.match(/^\/api\/conversations\/([0-9a-f-]+)\/messages$/);
    if (postMsgMatch && method === "POST") {
      const auth = requireAuth(req);
      const conversationId = postMsgMatch[1];

      // 权限检查
      const allowed = await conversationService.isParticipant(conversationId, auth.userId);
      if (!allowed) {
        json(res, 403, { error: "无权访问此对话" });
        return;
      }

      const body = JSON.parse(await readBody(req));
      const msg = await conversationService.sendMessage(
        conversationId,
        auth.userId,
        body.senderMode ?? "human",
        body.content,
      );

      // 进程内转发给 OpenClaw
      const partnerId = await conversationService.getPartnerId(conversationId, auth.userId);
      if (partnerId) {
        forwardToOpenClaw(partnerId, conversationId, {
          messageId: msg.messageId,
          content: msg.content,
          senderId: msg.senderId,
          senderName: auth.email,
          createdAt: msg.createdAt.toISOString(),
        });
      }
      // 也尝试转发给自己（仅当 partnerId 不同时，避免重复）
      if (partnerId !== auth.userId) {
        forwardToOpenClaw(auth.userId, conversationId, {
          messageId: msg.messageId,
          content: msg.content,
          senderId: msg.senderId,
          senderName: auth.email,
          createdAt: msg.createdAt.toISOString(),
        });
      }

      json(res, 201, {
        messageId: msg.messageId,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        senderMode: msg.senderMode,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      });
      return;
    }

    // GET /api/conversations/:id/messages
    const getMsgMatch = pathname.match(/^\/api\/conversations\/([0-9a-f-]+)\/messages$/);
    if (getMsgMatch && method === "GET") {
      const auth = requireAuth(req);
      const conversationId = getMsgMatch[1];

      const allowed = await conversationService.isParticipant(conversationId, auth.userId);
      if (!allowed) {
        json(res, 403, { error: "无权访问此对话" });
        return;
      }

      const cursor = query.get("cursor") ?? undefined;
      const limit = Math.min(parseInt(query.get("limit") ?? "50", 10), 100);
      const messages = await conversationService.listMessages(conversationId, cursor, limit);

      json(res, 200, messages.map((m) => ({
        messageId: m.messageId,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderMode: m.senderMode,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt.toISOString(),
      })));
      return;
    }

    // ── Internal API (localhost only) ──
    const remoteAddr = req.socket.remoteAddress;
    const isLocal = remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1";

    if (pathname === "/internal/forward" && method === "POST") {
      if (!isLocal) {
        json(res, 403, { error: "Forbidden" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const { userId, conversationId, message } = body;
      const ok = forwardToOpenClaw(userId, conversationId, message);
      if (!ok) {
        json(res, 404, { error: "OpenClaw not connected" });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    const statusMatch = pathname.match(/^\/internal\/status\/(.+)$/);
    if (statusMatch && method === "GET") {
      if (!isLocal) {
        json(res, 403, { error: "Forbidden" });
        return;
      }
      const userId = statusMatch[1];
      const client = clients.get(userId);
      const connected = !!client && client.ws.readyState === 1; // WebSocket.OPEN
      json(res, 200, { connected, conversationId: client?.conversationId });
      return;
    }

    // ── 404 ──
    json(res, 404, { error: "Not Found" });
  } catch (err) {
    if (err instanceof AuthHttpError) {
      json(res, err.statusCode, { error: err.message });
      return;
    }
    if (err instanceof authService.AuthError) {
      json(res, err.statusCode, { error: err.message });
      return;
    }
    log.error({ err, url: req.url, method }, "Unhandled error");
    json(res, 500, { error: "Internal Server Error" });
  }
}
