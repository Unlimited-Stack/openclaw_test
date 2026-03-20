/**
 * jwt.ts — JWT 签发 + 验证 + Refresh Token 生成
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "cosoul-dev-jwt-secret-change-in-production";

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is required in production");
  }
  return JWT_SECRET;
}

const ACCESS_TOKEN_EXPIRES = "15m";
export const REFRESH_TOKEN_DAYS = 7;

export interface JwtPayload {
  sub: string;
  email: string;
  tier: string;
}

/** 签发 Access Token（JWT, 15 分钟） */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES, algorithm: "HS256" });
}

/** 验证 Access Token，返回 payload 或抛异常 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as JwtPayload;
}

/** 生成随机 refresh token（64 字节 hex） */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

/** 对 refresh token 做 SHA-256 哈希 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
