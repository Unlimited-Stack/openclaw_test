# OpenClaw ↔ Cosoul.AI 连接测试

## 前置条件

1. Cosoul.AI 数据库已迁移（含 openclaw_api_keys、openclaw_connections 新表 + conversations.type 字段）
2. cosoul-bridge 服务已启动（端口 4060）
3. 已通过 API 生成一个 API Key

## 使用步骤

### 1. 安装依赖
```bash
npm install
```

### 2. 生成 API Key
通过 Cosoul.AI API 创建：
```bash
curl -X POST http://YOUR_SERVER:3000/api/openclaw/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "test-key"}'
```

记下返回的 `rawKey`。

### 3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 填入 BRIDGE_URL 和 API_KEY
```

### 4. 运行连接测试
```bash
npm run test:connect
```

### 5. 运行聊天测试
```bash
npm run test:chat
```
