/**
 * Auth 中间件 — 适配 Node.js http.IncomingMessage
 *
 * requireAuth: 从 Authorization header 提取 JWT → 返回 AuthContext
 */

import http from "node:http";
import { verifyAccessToken, type JwtPayload } from "./jwt.js";

// ─── 类型 ────────────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  email: string;
  tier: string;
}

// ─── requireAuth ─────────────────────────────────────────────────

/**
 * 从 Node.js IncomingMessage 的 Authorization: Bearer <token> 中提取并验证 JWT
 */
export function requireAuth(req: http.IncomingMessage): AuthContext {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthHttpError(401, "缺少认证令牌");
  }

  const token = authHeader.slice(7);
  try {
    const payload: JwtPayload = verifyAccessToken(token);
    return {
      userId: payload.sub,
      email: payload.email,
      tier: payload.tier,
    };
  } catch {
    throw new AuthHttpError(401, "令牌无效或已过期");
  }
}

// ─── 错误类 ──────────────────────────────────────────────────────

export class AuthHttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthHttpError";
  }
}
