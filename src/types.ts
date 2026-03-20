/**
 * 类型定义 — 内联所有 @repo/types 中需要的接口
 */

// ─── Auth 域 ─────────────────────────────────────────────────────

/** 安全的用户信息（不含密码等敏感字段） */
export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
}

/** JWT Access Token + Refresh Token 对 */
export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

/** 登录/注册的完整返回结果 */
export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokenPair;
}

// ─── OpenClaw 域 ─────────────────────────────────────────────────

/** API Key 元数据（不含原始 key） */
export interface ApiKeyInfo {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

/** API Key 创建结果（rawKey 仅此一次可见） */
export interface ApiKeyCreateResult {
  id: string;
  rawKey: string;
  label: string | null;
  expiresAt: string;
}

/** OpenClaw 连接状态 */
export interface ConnectionStatus {
  connected: boolean;
  connectedAt?: string;
  lastHeartbeat?: string;
  clientInfo?: Record<string, unknown>;
}

/** OpenClaw 专属对话信息 */
export interface OpenClawConversation {
  conversationId: string;
  userId: string;
  status: string;
  createdAt: string;
}
