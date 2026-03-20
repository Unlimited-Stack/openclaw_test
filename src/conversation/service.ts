/**
 * ConversationService — 对话 + 消息 CRUD
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { eq, or, and, desc, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// ─── 类型定义 ────────────────────────────────────────────────────

export interface ConversationRow {
  conversationId: string;
  sourceTaskId: string | null;
  participantA: string;
  participantB: string;
  status: string;
  type: string;
  createdAt: Date;
}

export interface MessageRow {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderMode: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
}

export interface CreateConversationInput {
  sourceTaskId?: string;
  participantA: string;
  participantB: string;
}

// ─── 创建对话 ────────────────────────────────────────────────────

export async function createConversation(
  input: CreateConversationInput,
): Promise<ConversationRow> {
  const [row] = await db
    .insert(schema.conversations)
    .values({
      conversationId: randomUUID(),
      sourceTaskId: input.sourceTaskId ?? null,
      participantA: input.participantA,
      participantB: input.participantB,
      status: "active",
    })
    .returning();

  return toConversationRow(row);
}

// ─── 获取对话详情 ────────────────────────────────────────────────

export async function getConversationById(
  conversationId: string,
): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.conversationId, conversationId))
    .limit(1);

  return row ? toConversationRow(row) : null;
}

// ─── 权限检查 ────────────────────────────────────────────────────

export async function isParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const conv = await getConversationById(conversationId);
  if (!conv) return false;
  return conv.participantA === userId || conv.participantB === userId;
}

// ─── 发送消息 ────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderMode: string,
  content: string,
): Promise<MessageRow> {
  const [row] = await db
    .insert(schema.conversationMessages)
    .values({
      messageId: randomUUID(),
      conversationId,
      senderId,
      senderMode,
      content,
      metadata: {},
    })
    .returning();

  return toMessageRow(row);
}

// ─── 消息列表（游标分页）────────────────────────────────────────

export async function listMessages(
  conversationId: string,
  cursor?: string,
  limit: number = 50,
): Promise<MessageRow[]> {
  const query = db
    .select()
    .from(schema.conversationMessages)
    .where(
      cursor
        ? and(
            eq(schema.conversationMessages.conversationId, conversationId),
            lt(schema.conversationMessages.createdAt, new Date(cursor)),
          )
        : eq(schema.conversationMessages.conversationId, conversationId),
    )
    .orderBy(desc(schema.conversationMessages.createdAt))
    .limit(limit);

  const rows = await query;
  return rows.map(toMessageRow);
}

// ─── 获取对方 userId ─────────────────────────────────────────────

export async function getPartnerId(
  conversationId: string,
  myUserId: string,
): Promise<string | null> {
  const conv = await getConversationById(conversationId);
  if (!conv) return null;
  return conv.participantA === myUserId ? conv.participantB : conv.participantA;
}

// ─── 内部辅助 ────────────────────────────────────────────────────

function toConversationRow(row: typeof schema.conversations.$inferSelect): ConversationRow {
  return {
    conversationId: row.conversationId,
    sourceTaskId: row.sourceTaskId,
    participantA: row.participantA,
    participantB: row.participantB,
    status: row.status,
    type: row.type,
    createdAt: row.createdAt,
  };
}

function toMessageRow(row: typeof schema.conversationMessages.$inferSelect): MessageRow {
  return {
    messageId: row.messageId,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderMode: row.senderMode,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}
