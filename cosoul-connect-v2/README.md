# Cosoul Connect

Connect OpenClaw to Cosoul.AI IM system.

## Quick Start

1. **Install the skill**:
   ```bash
   openclaw skill install ./cosoul-connect-v2
   ```

2. **Configure** `~/.openclaw/openclaw.json`:
   ```json
   {
     "channels": {
       "cosoul": {
         "enabled": true,
         "bridgeUrl": "ws://YOUR_BRIDGE_HOST:4060",
         "apiKey": "YOUR_API_KEY"
       }
     },
     "plugins": {
       "entries": {
         "cosoul": { "enabled": true }
       }
     }
   }
   ```

3. **Restart OpenClaw**:
   ```bash
   openclaw gateway restart
   ```

4. **Check status**:
   ```bash
   openclaw status
   ```

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| `bridgeUrl` | string | WebSocket URL of Cosoul Bridge server |
| `apiKey` | string | API key from Cosoul.AI admin panel |

## Getting API Key

1. Login to Cosoul.AI admin panel
2. Go to "Integrations" → "OpenClaw"
3. Click "Generate API Key"
4. Copy and save the key

## Troubleshooting

```bash
# Check connection status
openclaw status

# View logs
openclaw logs --follow | grep cosoul

# Restart gateway
openclaw gateway restart
```

## License

MIT
