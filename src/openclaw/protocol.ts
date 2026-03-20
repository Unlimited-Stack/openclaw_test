/**
 * OpenClaw WebSocket 协议消息定义（zod）
 *
 * 方向约定：
 *   C→S = OpenClaw Client → Bridge Server
 *   S→C = Bridge Server → OpenClaw Client
 */

import { z } from "zod";

// ─── C→S 消息 ────────────────────────────────────────────────────

/** 认证请求 */
export const AuthMessage = z.object({
  type: z.literal("auth"),
  apiKey: z.string().min(1),
});

/** 心跳 ping */
export const PingMessage = z.object({
  type: z.literal("ping"),
});

/** OpenClaw 回复用户消息 */
export const MessageReply = z.object({
  type: z.literal("message_reply"),
  conversationId: z.string().uuid(),
  content: z.string().min(1),
});

/** 所有 C→S 消息的联合类型 */
export const ClientMessage = z.discriminatedUnion("type", [
  AuthMessage,
  PingMessage,
  MessageReply,
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ─── S→C 消息 ────────────────────────────────────────────────────

/** 认证结果 */
export const AuthResultMsg = z.object({
  type: z.literal("auth_result"),
  success: z.boolean(),
  conversationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  error: z.string().optional(),
});
export type AuthResultMsg = z.infer<typeof AuthResultMsg>;

/** 心跳 pong */
export const PongMessage = z.object({
  type: z.literal("pong"),
});

/** 转发用户消息给 OpenClaw */
export const MessageInbound = z.object({
  type: z.literal("message_inbound"),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  content: z.string(),
  senderId: z.string().uuid(),
  createdAt: z.string(),
});
export type MessageInbound = z.infer<typeof MessageInbound>;

/** 错误通知 */
export const ErrorMessage = z.object({
  type: z.literal("error"),
  message: z.string(),
});

/** 所有 S→C 消息的联合类型 */
export const ServerMessage = z.discriminatedUnion("type", [
  AuthResultMsg,
  PongMessage,
  MessageInbound,
  ErrorMessage,
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
