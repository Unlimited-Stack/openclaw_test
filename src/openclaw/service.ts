/**
 * OpenClaw Service — API Key 管理 + 连接管理 + 专属对话创建
 */

import crypto from "crypto";
import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createLogger } from "../logger.js";

const log = createLogger("openclaw");

// ─── 工具函数 ────────────────────────────────────────────────────

function generateApiKey(): string {
  return crypto.randomBytes(64).toString("hex");
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// ─── API Key 管理 ────────────────────────────────────────────────

export async function createApiKey(
  userId: string,
  label?: string,
  expiresInDays: number = 90,
): Promise<{ id: string; rawKey: string; label: string | null; expiresAt: Date }> {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000);

  const [row] = await db
    .insert(schema.openclawApiKeys)
    .values({
      userId,
      keyHash,
      label: label ?? null,
      expiresAt,
    })
    .returning({ id: schema.openclawApiKeys.id });

  log.info({ userId, keyId: row.id }, "API Key created");

  return { id: row.id, rawKey, label: label ?? null, expiresAt };
}

export async function validateApiKey(
  rawKey: string,
): Promise<{ userId: string; keyId: string } | null> {
  const keyHash = hashApiKey(rawKey);

  const [row] = await db
    .select({
      id: schema.openclawApiKeys.id,
      userId: schema.openclawApiKeys.userId,
      expiresAt: schema.openclawApiKeys.expiresAt,
      revoked: schema.openclawApiKeys.revoked,
    })
    .from(schema.openclawApiKeys)
    .where(eq(schema.openclawApiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return null;
  if (row.revoked) return null;
  if (row.expiresAt < new Date()) return null;

  await db
    .update(schema.openclawApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.openclawApiKeys.id, row.id));

  return { userId: row.userId, keyId: row.id };
}

export async function listApiKeys(userId: string) {
  const rows = await db
    .select({
      id: schema.openclawApiKeys.id,
      label: schema.openclawApiKeys.label,
      lastUsedAt: schema.openclawApiKeys.lastUsedAt,
      expiresAt: schema.openclawApiKeys.expiresAt,
      revoked: schema.openclawApiKeys.revoked,
      createdAt: schema.openclawApiKeys.createdAt,
    })
    .from(schema.openclawApiKeys)
    .where(eq(schema.openclawApiKeys.userId, userId))
    .orderBy(schema.openclawApiKeys.createdAt);

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt.toISOString(),
    revoked: r.revoked,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const result = await db
    .update(schema.openclawApiKeys)
    .set({ revoked: true })
    .where(
      and(
        eq(schema.openclawApiKeys.id, keyId),
        eq(schema.openclawApiKeys.userId, userId),
      ),
    );

  return (result.rowCount ?? 0) > 0;
}

// ─── 连接管理 ────────────────────────────────────────────────────

export async function recordConnection(
  userId: string,
  apiKeyId: string,
  clientInfo?: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(schema.openclawConnections)
    .values({
      userId,
      apiKeyId,
      clientInfo: clientInfo ?? {},
      status: "connected",
    })
    .onConflictDoUpdate({
      target: schema.openclawConnections.userId,
      set: {
        apiKeyId,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        clientInfo: clientInfo ?? {},
        status: "connected",
      },
    });

  log.info({ userId }, "OpenClaw connected");
}

export async function updateHeartbeat(userId: string): Promise<void> {
  await db
    .update(schema.openclawConnections)
    .set({ lastHeartbeat: new Date() })
    .where(eq(schema.openclawConnections.userId, userId));
}

export async function removeConnection(userId: string): Promise<void> {
  await db
    .update(schema.openclawConnections)
    .set({ status: "disconnected" })
    .where(eq(schema.openclawConnections.userId, userId));

  log.info({ userId }, "OpenClaw disconnected");
}

export async function getConnectionStatus(
  userId: string,
): Promise<{ connected: boolean; connectedAt?: string; lastHeartbeat?: string; clientInfo?: Record<string, unknown> }> {
  const [row] = await db
    .select()
    .from(schema.openclawConnections)
    .where(eq(schema.openclawConnections.userId, userId))
    .limit(1);

  if (!row || row.status !== "connected") {
    return { connected: false };
  }

  return {
    connected: true,
    connectedAt: row.connectedAt.toISOString(),
    lastHeartbeat: row.lastHeartbeat.toISOString(),
    clientInfo: row.clientInfo as Record<string, unknown>,
  };
}

// ─── OpenClaw 专属对话 ──────────────────────────────────────────

export async function getOrCreateOpenClawConversation(
  userId: string,
): Promise<{ conversationId: string; created: boolean }> {
  const [existing] = await db
    .select({ conversationId: schema.conversations.conversationId })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.participantA, userId),
        eq(schema.conversations.type, "openclaw"),
      ),
    )
    .limit(1);

  if (existing) {
    return { conversationId: existing.conversationId, created: false };
  }

  const conversationId = randomUUID();
  await db
    .insert(schema.conversations)
    .values({
      conversationId,
      participantA: userId,
      participantB: userId,
      status: "active",
      type: "openclaw",
    });

  log.info({ userId, conversationId }, "OpenClaw conversation created");

  return { conversationId, created: true };
}
