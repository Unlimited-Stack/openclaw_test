-- OpenClaw Bridge 数据库初始化脚本
-- 用法: psql -U cosoul -d cosoul_agent -f init.sql

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL DEFAULT '',
  phone          VARCHAR(20) UNIQUE,
  name           VARCHAR(100),
  avatar_url     TEXT,
  gender         VARCHAR(10),
  birthday       DATE,
  bio            TEXT,
  interests      JSONB DEFAULT '[]',
  school         VARCHAR(100),
  location       VARCHAR(100),
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  status         VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_tier);

-- 2. refresh_tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_info VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- 3. conversations
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id  UUID,
  participant_a   UUID NOT NULL REFERENCES users(user_id),
  participant_b   UUID NOT NULL REFERENCES users(user_id),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  type            VARCHAR(20) NOT NULL DEFAULT 'social',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(participant_a, participant_b);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);

-- 4. conversation_messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(user_id),
  sender_mode     VARCHAR(20) NOT NULL,
  content         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation ON conversation_messages(conversation_id, created_at);

-- 5. openclaw_api_keys
CREATE TABLE IF NOT EXISTS openclaw_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  key_hash     VARCHAR(255) NOT NULL UNIQUE,
  label        VARCHAR(100),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_openclaw_api_keys_user ON openclaw_api_keys(user_id);

-- 6. openclaw_connections
CREATE TABLE IF NOT EXISTS openclaw_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE UNIQUE,
  api_key_id     UUID NOT NULL REFERENCES openclaw_api_keys(id),
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_info    JSONB DEFAULT '{}',
  status         VARCHAR(20) NOT NULL DEFAULT 'connected'
);
