/**
 * 连接测试 — 验证 OpenClaw 能否连接到 Cosoul.AI Bridge
 *
 * 测试流程：
 *   1. WebSocket 连接到 bridge
 *   2. 发送 auth 消息
 *   3. 收到 auth_result（含 conversationId）
 *   4. 发送几次 ping，收到 pong
 *   5. 打印结果后断开
 */

import WebSocket from "ws";
import { readFileSync, existsSync } from "fs";

// 加载 .env
const envPath = new URL(".env", import.meta.url).pathname;
const env = {};
if (existsSync(envPath)) {
  readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  });
}

const BRIDGE_URL = env.BRIDGE_URL || process.env.BRIDGE_URL || "ws://localhost:4060";
const API_KEY = env.API_KEY || process.env.API_KEY;

if (!API_KEY || API_KEY === "your_api_key_here") {
  console.error("❌ 请在 .env 文件中设置 API_KEY");
  process.exit(1);
}

console.log(`🔗 连接到 Bridge: ${BRIDGE_URL}`);

const ws = new WebSocket(BRIDGE_URL);
let authenticated = false;
let pingCount = 0;
const MAX_PINGS = 3;

ws.on("open", () => {
  console.log("✅ WebSocket 连接成功");
  console.log("📤 发送认证消息...");
  ws.send(JSON.stringify({ type: "auth", apiKey: API_KEY }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log("📥 收到:", JSON.stringify(msg, null, 2));

  if (msg.type === "auth_result") {
    if (msg.success) {
      console.log(`\n🎉 认证成功！`);
      console.log(`   userId: ${msg.userId}`);
      console.log(`   conversationId: ${msg.conversationId}`);
      authenticated = true;

      // 开始 ping 测试
      console.log(`\n📡 开始心跳测试（${MAX_PINGS} 次 ping）...\n`);
      sendPing();
    } else {
      console.error(`\n❌ 认证失败: ${msg.error}`);
      ws.close();
    }
  }

  if (msg.type === "pong") {
    pingCount++;
    console.log(`   pong ${pingCount}/${MAX_PINGS} ✓`);
    if (pingCount < MAX_PINGS) {
      setTimeout(sendPing, 1000);
    } else {
      console.log(`\n🎉 所有测试通过！Bridge 连接正常。`);
      console.log(`\n可以运行 npm run test:chat 进行聊天测试。`);
      ws.close();
    }
  }

  if (msg.type === "error") {
    console.error(`❌ 错误: ${msg.message}`);
  }
});

ws.on("close", (code, reason) => {
  console.log(`\n🔌 连接关闭 (code=${code}, reason=${reason.toString() || "N/A"})`);
  process.exit(authenticated && pingCount >= MAX_PINGS ? 0 : 1);
});

ws.on("error", (err) => {
  console.error(`❌ 连接错误: ${err.message}`);
  process.exit(1);
});

function sendPing() {
  ws.send(JSON.stringify({ type: "ping" }));
}
