/**
 * 精简 Drizzle ORM Schema — 仅保留 OpenClaw Bridge 需要的 6 张表
 *
 *  1. users              — 用户账号
 *  2. refresh_tokens     — Refresh Token 管理
 *  3. conversations      — 对话（含 OpenClaw 专属对话）
 *  4. conversation_messages — 对话消息
 *  5. openclaw_api_keys  — OpenClaw API Key 管理
 *  6. openclaw_connections — OpenClaw 在线连接状态
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  jsonb,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ─── 1. users ─────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 20 }).unique(),
    name: varchar("name", { length: 100 }),
    avatarUrl: text("avatar_url"),
    gender: varchar("gender", { length: 10 }),
    birthday: date("birthday"),
    bio: text("bio"),
    interests: jsonb("interests").default([]),
    school: varchar("school", { length: 100 }),
    location: varchar("location", { length: 100 }),
    subscriptionTier: varchar("subscription_tier", { length: 20 }).notNull().default("free"),
    subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_users_phone").on(table.phone),
    index("idx_users_status").on(table.status),
    index("idx_users_subscription").on(table.subscriptionTier),
  ]
);

// ─── 2. refresh_tokens ───────────────────────────────────────────
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    deviceInfo: varchar("device_info", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_refresh_tokens_user").on(table.userId),
  ]
);

// ─── 3. conversations ────────────────────────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    conversationId: uuid("conversation_id").primaryKey().defaultRandom(),
    sourceTaskId: uuid("source_task_id"),  // 不加 FK（tasks 表不存在）
    participantA: uuid("participant_a")
      .notNull()
      .references(() => users.userId),
    participantB: uuid("participant_b")
      .notNull()
      .references(() => users.userId),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    type: varchar("type", { length: 20 }).notNull().default("social"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_participants").on(table.participantA, table.participantB),
    index("idx_conversations_type").on(table.type),
  ]
);

// ─── 4. conversation_messages ────────────────────────────────────
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    messageId: uuid("message_id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.conversationId, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.userId),
    senderMode: varchar("sender_mode", { length: 20 }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_conv_messages_conversation").on(table.conversationId, table.createdAt),
  ]
);

// ─── 5. openclaw_api_keys ────────────────────────────────────────
export const openclawApiKeys = pgTable(
  "openclaw_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    label: varchar("label", { length: 100 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_openclaw_api_keys_user").on(table.userId),
  ]
);

// ─── 6. openclaw_connections ─────────────────────────────────────
export const openclawConnections = pgTable("openclaw_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }).unique(),
  apiKeyId: uuid("api_key_id").notNull().references(() => openclawApiKeys.id),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).notNull().defaultNow(),
  clientInfo: jsonb("client_info").default({}),
  status: varchar("status", { length: 20 }).notNull().default("connected"),
});
