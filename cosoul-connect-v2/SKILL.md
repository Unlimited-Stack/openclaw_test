# Cosoul Connect Skill

将 OpenClaw 连接到 Cosoul.AI IM 系统的技能包。

## 功能

- ✅ WebSocket 连接到 Cosoul Bridge
- ✅ 自动认证和心跳保活
- ✅ 收发消息
- ✅ 自动重连

## 安装

```bash
openclaw skill install /path/to/cosoul-connect-v2
```

或使用远程 URL：

```bash
openclaw skill install https://github.com/your-org/cosoul-connect-skill
```

## 配置

安装后，编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "cosoul": {
      "enabled": true,
      "bridgeUrl": "ws://YOUR_BRIDGE_HOST:4060",
      "apiKey": "YOUR_API_KEY_HERE"
    }
  },
  "plugins": {
    "entries": {
      "cosoul": {
        "enabled": true
      }
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `enabled` | boolean | 是 | 启用/禁用此通道 |
| `bridgeUrl` | string | 是 | Cosoul Bridge WebSocket URL |
| `apiKey` | string | 是 | API Key（从 Cosoul 管理后台获取） |

### 示例配置

```json
{
  "channels": {
    "cosoul": {
      "enabled": true,
      "bridgeUrl": "ws://43.162.91.124:4060",
      "apiKey": "ef67601b5a0d6e534b17f2ed3f5fdeb4..."
    }
  }
}
```

## 使用

1. **配置 Bridge URL 和 API Key**
2. **重启 OpenClaw**：`openclaw gateway restart`
3. **检查状态**：`openclaw status`

## 获取 API Key

1. 登录 Cosoul.AI 管理后台
2. 进入「集成」→「OpenClaw」
3. 点击「生成 API Key」
4. 复制并保存到配置文件

## 故障排除

### 连接失败
- 检查 `bridgeUrl` 是否正确
- 确认 Bridge 服务已启动
- 查看防火墙设置

### 认证失败
- 确认 `apiKey` 有效
- 检查 API Key 是否过期

### 查看日志
```bash
openclaw logs --follow | grep cosoul
```

## 协议说明

此技能使用 Cosoul Bridge WebSocket 协议：

1. **连接**: WebSocket 连接到 `bridgeUrl`
2. **认证**: 发送 `{ type: "auth", apiKey: "..." }`
3. **心跳**: 每 10 秒发送 `{ type: "ping" }`
4. **收消息**: 接收 `{ type: "message_inbound", ... }`
5. **发消息**: 发送 `{ type: "message_reply", conversationId, content }`

## License

MIT
