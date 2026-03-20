import type {
  ChannelPlugin,
  ChannelCapabilities,
  InboundMessage,
  OutboundMessageResult,
  GatewayContext,
  ChannelProbeResult,
  ChannelStatusSnapshot,
} from "openclaw/plugin-sdk";
import WebSocket from "ws";
import { readFileSync } from "fs";

// ── Bridge 消息协议 ──

interface CosoulMessage {
  type: string;
  [key: string]: unknown;
}

interface AuthResultMessage extends CosoulMessage {
  type: "auth_result";
  success: boolean;
  userId?: string;
  conversationId?: string;
  error?: string;
}

interface InboundMessageData extends CosoulMessage {
  type: "message_inbound";
  conversationId: string;
  content: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
}

// ── 运行时状态 ──

interface CosoulRuntime {
  ws: WebSocket | null;
  authenticated: boolean;
  conversationId: string | null;
  userId: string | null;
  heartbeatTimer: NodeJS.Timeout | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastError: string | null;
  stopped: boolean;
}

const runtimeMap = new Map<string, CosoulRuntime>();

function getRuntime(accountId: string): CosoulRuntime {
  if (!runtimeMap.has(accountId)) {
    runtimeMap.set(accountId, {
      ws: null,
      authenticated: false,
      conversationId: null,
      userId: null,
      heartbeatTimer: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastError: null,
      stopped: false,
    });
  }
  return runtimeMap.get(accountId)!;
}

function resolveApiKey(cfg: { apiKey?: string; apiKeyFile?: string }): string | null {
  if (cfg.apiKey) return cfg.apiKey;
  if (cfg.apiKeyFile) {
    try {
      return readFileSync(cfg.apiKeyFile, "utf-8").trim();
    } catch {
      return null;
    }
  }
  return process.env.COSOUL_API_KEY?.trim() || null;
}

// ── 日志接口 ──

interface Log {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// ── 核心：事件驱动的持久连接 ──
// 参照 Feishu WebSocket / IRC socket 的模式：
// - 返回一个 Promise，仅在 abortSignal 时 resolve（永不主动 resolve）
// - 断线时由 ws.on("close") 事件直接触发重连（不用轮询）
// - 确保旧连接完全关闭后再创建新连接

function monitorCosoulConnection(opts: {
  accountId: string;
  bridgeUrl: string;
  apiKey: string;
  onMessage: (msg: InboundMessage) => void;
  abortSignal?: AbortSignal;
  log?: Log;
}): Promise<void> {
  const { accountId, bridgeUrl, apiKey, onMessage, abortSignal, log } = opts;
  const runtime = getRuntime(accountId);
  runtime.stopped = false;

  let reconnectDelay = 3000;
  const MAX_RECONNECT_DELAY = 30000;

  return new Promise<void>((resolve) => {
    // abort 时清理并 resolve
    if (abortSignal?.aborted) {
      resolve();
      return;
    }

    const stop = () => {
      runtime.stopped = true;
      if (runtime.heartbeatTimer) {
        clearInterval(runtime.heartbeatTimer);
        runtime.heartbeatTimer = null;
      }
      if (runtime.ws) {
        // 用 1000 正常关闭，不触发重连
        runtime.ws.close(1000);
        runtime.ws = null;
      }
      runtime.authenticated = false;
      resolve();
    };

    abortSignal?.addEventListener("abort", stop, { once: true });

    // 创建一次连接
    function connect() {
      if (runtime.stopped || abortSignal?.aborted) return;

      // 确保旧连接完全清理
      if (runtime.heartbeatTimer) {
        clearInterval(runtime.heartbeatTimer);
        runtime.heartbeatTimer = null;
      }
      if (runtime.ws) {
        runtime.ws.removeAllListeners();
        runtime.ws.terminate();
        runtime.ws = null;
      }
      runtime.authenticated = false;
      runtime.conversationId = null;

      log?.info(`[${accountId}] connecting to ${bridgeUrl}...`);

      let ws: WebSocket;
      try {
        ws = new WebSocket(bridgeUrl);
      } catch (err) {
        log?.error(`[${accountId}] failed to create WebSocket: ${(err as Error).message}`);
        scheduleReconnect();
        return;
      }
      runtime.ws = ws;

      // 连接超时
      const connectionTimeout = setTimeout(() => {
        log?.error(`[${accountId}] connection timeout`);
        ws.terminate();
        // close 事件会触发重连
      }, 10000);

      ws.on("open", () => {
        clearTimeout(connectionTimeout);
        log?.info(`[${accountId}] WebSocket open, authenticating...`);
        ws.send(JSON.stringify({ type: "auth", apiKey }));
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as CosoulMessage;

          if (msg.type === "auth_result") {
            const authMsg = msg as AuthResultMessage;
            if (authMsg.success) {
              runtime.authenticated = true;
              runtime.conversationId = authMsg.conversationId || null;
              runtime.userId = authMsg.userId || null;
              runtime.lastError = null;
              reconnectDelay = 3000; // 认证成功，重置退避

              // 启动心跳（10 秒）
              runtime.heartbeatTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "ping" }));
                }
              }, 10000);

              log?.info(`[${accountId}] authenticated, conversation: ${runtime.conversationId}`);
            } else {
              runtime.lastError = authMsg.error || "Authentication failed";
              log?.error(`[${accountId}] auth failed: ${runtime.lastError}`);
              // 认证失败也会触发 close → 重连
            }
          }

          if (msg.type === "message_inbound") {
            const inbound = msg as InboundMessageData;
            runtime.lastInboundAt = new Date().toISOString();
            log?.info(`[${accountId}] 📨 收到消息：${inbound.content} (from: ${inbound.senderName})`);
            onMessage({
              id: `${inbound.conversationId}:${Date.now()}`,
              channel: "cosoul",
              accountId,
              senderId: inbound.senderId,
              senderName: inbound.senderName,
              text: inbound.content,
              conversationId: inbound.conversationId,
              createdAt: inbound.createdAt,
            });
          }

          if (msg.type === "error") {
            runtime.lastError = (msg as { message?: string }).message || "Unknown error";
            log?.error(`[${accountId}] bridge error: ${runtime.lastError}`);
          }
        } catch {
          // 忽略 JSON 解析错误
        }
      });

      // 关键：close 事件驱动重连，不用轮询
      ws.on("close", (code: number, reason: Buffer) => {
        clearTimeout(connectionTimeout);
        if (runtime.heartbeatTimer) {
          clearInterval(runtime.heartbeatTimer);
          runtime.heartbeatTimer = null;
        }
        runtime.authenticated = false;
        runtime.conversationId = null;
        runtime.ws = null;

        const reasonStr = reason?.toString() || "";
        log?.info(`[${accountId}] closed (code=${code}${reasonStr ? `, reason=${reasonStr}` : ""})`);

        // 只有非正常关闭且未停止时才重连
        if (code !== 1000 && !runtime.stopped && !abortSignal?.aborted) {
          scheduleReconnect();
        }
      });

      ws.on("error", (err: Error) => {
        clearTimeout(connectionTimeout);
        runtime.lastError = err.message;
        log?.error(`[${accountId}] WebSocket error: ${err.message}`);
        // error 后一定会触发 close，不需要在这里重连
      });
    }

    // 延迟重连（指数退避）
    function scheduleReconnect() {
      if (runtime.stopped || abortSignal?.aborted) return;
      log?.info(`[${accountId}] reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(() => {
        if (runtime.stopped || abortSignal?.aborted) return;
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay);
    }

    // 启动首次连接
    connect();
  });
}

// ── 发送消息 ──

async function sendMessage(
  accountId: string,
  conversationId: string,
  content: string,
): Promise<OutboundMessageResult> {
  const runtime = getRuntime(accountId);

  if (!runtime.ws || runtime.ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }
  if (!runtime.authenticated) {
    throw new Error("Not authenticated");
  }

  runtime.ws.send(JSON.stringify({
    type: "message_reply",
    conversationId,
    content,
  }));

  runtime.lastOutboundAt = new Date().toISOString();

  return {
    channel: "cosoul",
    messageId: `${conversationId}:${Date.now()}`,
  };
}

// ── Channel Plugin ──

export const cosoulPlugin: ChannelPlugin = {
  id: "cosoul",
  meta: {
    id: "cosoul",
    name: "Cosoul.AI",
    description: "Cosoul.AI IM via WebSocket Bridge",
    features: {
      text: true,
      media: false,
      reactions: false,
      threads: false,
      voice: false,
    },
    quickstartAllowFrom: true,
  },

  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  } as ChannelCapabilities,

  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      bridgeUrl: { type: "string", format: "uri" },
      apiKey: { type: "string" },
      apiKeyFile: { type: "string" },
    },
  },

  config: {
    listAccountIds: () => ["default"],
    resolveAccount: (cfg, accountId) => {
      const config = cfg.channels?.cosoul || {};
      const apiKey = resolveApiKey(config);
      return {
        accountId: accountId || "default",
        enabled: config.enabled ?? false,
        configured: Boolean(config.bridgeUrl && apiKey),
        bridgeUrl: config.bridgeUrl,
        apiKey: apiKey || undefined,
      };
    },
    defaultAccountId: () => "default",
    isConfigured: (account) => Boolean(account.configured),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: () => [],
  },

  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: [],
      policyPath: "channels.cosoul.dmPolicy",
      allowFromPath: "channels.cosoul",
    }),
    collectWarnings: () => [],
  },

  messaging: {
    normalizeTarget: (target) => target,
    targetResolver: {
      looksLikeId: () => true,
      hint: "<conversationId>",
    },
  },

  directory: {
    self: async () => {
      const runtime = getRuntime("default");
      if (!runtime.userId) return null;
      return { id: runtime.userId, name: "Cosoul User", channel: "cosoul" as const };
    },
    listPeers: async () => [],
    listGroups: async () => [],
  },

  outbound: {
    deliveryMode: "direct",
    chunker: (text: string) => [text],
    chunkerMode: "text",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      return sendMessage(accountId || "default", to, text);
    },
  },

  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: () => [],
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
    }),
    probeAccount: async ({ account }) => {
      const runtime = getRuntime(account.accountId);
      return {
        ok: runtime.authenticated && runtime.ws?.readyState === WebSocket.OPEN,
        conversationId: runtime.conversationId,
        userId: runtime.userId,
      } as ChannelProbeResult;
    },
    buildAccountSnapshot: ({ runtime }) => {
      const rt = getRuntime(runtime?.accountId || "default");
      return {
        accountId: runtime?.accountId || "default",
        enabled: runtime?.enabled ?? false,
        configured: runtime?.configured ?? false,
        running: rt.authenticated && rt.ws?.readyState === WebSocket.OPEN,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: rt.lastError,
        lastInboundAt: rt.lastInboundAt,
        lastOutboundAt: rt.lastOutboundAt,
      } as ChannelStatusSnapshot;
    },
  },

  gateway: {
    startAccount: async (ctx: GatewayContext) => {
      const { account, cfg, log, onMessage, abortSignal } = ctx;
      const config = cfg.channels?.cosoul || {};
      const bridgeUrl = config.bridgeUrl;
      const apiKey = resolveApiKey(config);

      if (!bridgeUrl || !apiKey) {
        throw new Error("Cosoul bridgeUrl and apiKey required");
      }

      // 参照 Feishu/IRC/Matrix 模式：
      // 返回一个永不 resolve 的 Promise，直到 abortSignal 触发
      // 断线由 close 事件驱动重连，不轮询
      return monitorCosoulConnection({
        accountId: account.accountId,
        bridgeUrl,
        apiKey,
        onMessage: (msg: InboundMessage) => onMessage(msg),
        abortSignal,
        log: log
          ? { info: (...a: unknown[]) => log.info(...a), error: (...a: unknown[]) => log.error(...a) }
          : undefined,
      });
    },
  },
};
