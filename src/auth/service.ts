/**
 * AuthService — 认证核心逻辑
 *
 * 功能：注册、登录、Token 刷新、登出
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "./password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_DAYS,
  type JwtPayload,
} from "./jwt.js";
import type { AuthUser, AuthTokenPair, AuthResult } from "../types.js";
import { createLogger } from "../logger.js";

const log = createLogger("auth");

export type { AuthUser, AuthTokenPair, AuthResult };

// ─── 错误类 ──────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ─── 内部工具 ────────────────────────────────────────────────────

function toAuthUser(row: {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
}): AuthUser {
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    subscriptionTier: row.subscriptionTier,
  };
}

async function issueTokenPair(
  user: AuthUser,
  deviceInfo?: string,
): Promise<AuthTokenPair> {
  const payload: JwtPayload = {
    sub: user.userId,
    email: user.email,
    tier: user.subscriptionTier,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await db.insert(schema.refreshTokens).values({
    userId: user.userId,
    tokenHash,
    deviceInfo: deviceInfo ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 3600 * 1000),
  });

  return { accessToken, refreshToken };
}

// ─── 注册 ────────────────────────────────────────────────────────

export async function register(input: {
  email: string;
  password: string;
  name?: string;
  deviceInfo?: string;
}): Promise<AuthResult> {
  const strengthErr = validatePasswordStrength(input.password);
  if (strengthErr) throw new AuthError(strengthErr, 400);

  const emailLower = input.email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    throw new AuthError("邮箱格式不正确", 400);
  }

  const [existing] = await db
    .select({ userId: schema.users.userId })
    .from(schema.users)
    .where(eq(schema.users.email, emailLower))
    .limit(1);
  if (existing) throw new AuthError("该邮箱已注册", 409);

  const passwordHash = await hashPassword(input.password);
  const [newUser] = await db
    .insert(schema.users)
    .values({
      email: emailLower,
      passwordHash,
      name: input.name ?? null,
      subscriptionTier: "free",
      status: "active",
      lastLoginAt: new Date(),
    })
    .returning({
      userId: schema.users.userId,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      subscriptionTier: schema.users.subscriptionTier,
    });

  const user = toAuthUser(newUser);
  const tokens = await issueTokenPair(user, input.deviceInfo);

  return { user, tokens };
}

// ─── 登录 ────────────────────────────────────────────────────────

export async function login(input: {
  email: string;
  password: string;
  deviceInfo?: string;
}): Promise<AuthResult> {
  const emailLower = input.email.toLowerCase().trim();

  const [row] = await db
    .select({
      userId: schema.users.userId,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      subscriptionTier: schema.users.subscriptionTier,
      passwordHash: schema.users.passwordHash,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.email, emailLower))
    .limit(1);

  if (!row) throw new AuthError("邮箱或密码错误");

  if (row.status !== "active") {
    throw new AuthError("账号已被暂停或已注销", 403);
  }

  const valid = await verifyPassword(input.password, row.passwordHash);
  if (!valid) throw new AuthError("邮箱或密码错误");

  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.users.userId, row.userId));

  const user = toAuthUser(row);
  const tokens = await issueTokenPair(user, input.deviceInfo);

  return { user, tokens };
}

// ─── Token 刷新 ──────────────────────────────────────────────────

export async function refresh(input: {
  refreshToken: string;
  deviceInfo?: string;
}): Promise<AuthTokenPair> {
  const tokenHash = hashRefreshToken(input.refreshToken);

  const [tokenRow] = await db
    .select({
      id: schema.refreshTokens.id,
      userId: schema.refreshTokens.userId,
      revoked: schema.refreshTokens.revoked,
      expiresAt: schema.refreshTokens.expiresAt,
    })
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) throw new AuthError("无效的刷新令牌");

  if (tokenRow.revoked) {
    await db
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(eq(schema.refreshTokens.userId, tokenRow.userId));
    throw new AuthError("检测到令牌重用，已强制登出所有设备");
  }

  if (tokenRow.expiresAt < new Date()) {
    throw new AuthError("刷新令牌已过期，请重新登录");
  }

  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.id, tokenRow.id));

  const [userRow] = await db
    .select({
      userId: schema.users.userId,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      subscriptionTier: schema.users.subscriptionTier,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.userId, tokenRow.userId))
    .limit(1);

  if (!userRow || userRow.status !== "active") {
    throw new AuthError("账号已被暂停或已注销", 403);
  }

  const user = toAuthUser(userRow);
  return issueTokenPair(user, input.deviceInfo);
}

// ─── 登出 ────────────────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.tokenHash, tokenHash));
}

export async function logoutAll(userId: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.userId, userId));
}
