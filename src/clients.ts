/**
 * WebSocket 连接 Map — 独立模块，避免 server.ts ↔ router.ts 循环依赖
 */

import { WebSocket } from "ws";
import type { MessageInbound } from "./openclaw/protocol.js";
import { createLogger } from "./logger.js";

const log = createLogger("clients");

export interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  keyId: string;
  conversationId: string;
  lastPing: number;
}

/** userId → ConnectedClient */
export const clients = new Map<string, ConnectedClient>();

/**
 * 进程内转发消息给 OpenClaw 客户端
 * @returns true 如果转发成功，false 如果 OpenClaw 不在线
 */
export function forwardToOpenClaw(
  userId: string,
  conversationId: string,
  message: { messageId: string; content: string; senderId: string; createdAt: string },
): boolean {
  const client = clients.get(userId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  const inbound: MessageInbound = {
    type: "message_inbound",
    conversationId,
    messageId: message.messageId,
    content: message.content,
    senderId: message.senderId,
    createdAt: message.createdAt,
  };

  const payload = JSON.stringify(inbound);
  log.info({ userId, conversationId }, "forwarding message to OpenClaw");
  client.ws.send(payload, (err) => {
    if (err) log.error({ err, userId }, "ws.send failed");
  });

  return true;
}
