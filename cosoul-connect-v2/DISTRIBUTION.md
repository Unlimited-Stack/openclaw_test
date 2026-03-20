# Cosoul Connect Skill - 分发说明

## 文件结构

```
cosoul-connect-v2/
├── SKILL.md              # 技能说明文档
├── README.md             # 使用指南
├── package.json          # NPM 包配置
├── openclaw.plugin.json  # OpenClaw 插件配置
├── install.mjs           # 安装脚本
├── index.ts              # 插件入口
├── .env.example          # 配置示例
├── .gitignore
└── src/
    └── channel.ts        # 核心插件代码
```

## 安装方法

### 方法 1: 本地安装

```bash
# 复制 skill 到 workspace
cp -r cosoul-connect-v2 /Users/YOUR_NAME/.openclaw/workspace/

# 安装 skill
openclaw skill install /Users/YOUR_NAME/.openclaw/workspace/cosoul-connect-v2
```

### 方法 2: 使用 zip 包

```bash
# 解压 zip 包
unzip cosoul-connect-v2.zip -d ~/.openclaw/workspace/

# 安装 skill
openclaw skill install ~/.openclaw/workspace/cosoul-connect-v2
```

### 方法 3: 远程安装（需要托管）

```bash
openclaw skill install https://your-server.com/cosoul-connect-v2.zip
```

## 配置步骤

### 1. 获取 Bridge 信息

从 Cosoul.AI 管理员获取：
- **Bridge URL**: `ws://YOUR_BRIDGE_HOST:4060`
- **API Key**: `your_api_key_here`

### 2. 编辑 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json`：

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

### 3. 重启 OpenClaw

```bash
openclaw gateway restart
```

### 4. 验证连接

```bash
# 检查状态
openclaw status

# 查看日志
openclaw logs --follow | grep cosoul
```

## 配置示例

### 示例 1: 本地 Bridge

```json
{
  "channels": {
    "cosoul": {
      "enabled": true,
      "bridgeUrl": "ws://127.0.0.1:4060",
      "apiKey": "local_dev_key_12345"
    }
  }
}
```

### 示例 2: 远程 Bridge

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

## 常见问题

### Q: 连接失败 (ECONNREFUSED)
**A**: 检查 Bridge 服务是否运行，防火墙是否开放 4060 端口。

### Q: 认证失败
**A**: 确认 API Key 正确且未过期。

### Q: 消息收不到
**A**: 检查 conversationId 是否正确，Bridge 日志是否有转发记录。

### Q: 频繁断开
**A**: 检查网络连接，Bridge 服务端日志，心跳是否正常。

## 技术支持

- 文档：见 SKILL.md
- 日志：`openclaw logs --follow | grep cosoul`
- 状态：`openclaw status --deep`

## 版本历史

- **v2.0.0**: 修复连接稳定性问题，添加调试日志
- **v1.0.0**: 初始版本

## License

MIT
