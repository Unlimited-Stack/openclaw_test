/**
 * 聊天测试 — 模拟 OpenClaw 接收用户消息并回复
 *
 * 测试流程：
 *   1. 连接并认证
 *   2. 等待 message_inbound（用户在 IM 界面发的消息）
 *   3. 收到消息后自动回复 "Hello from OpenClaw!"
 *   4. 同时保持心跳
 *
 * 使用方法：
 *   1. 运行此脚本：npm run test:chat
 *   2. 在 Cosoul.AI IM 界面找到"我的 OpenClaw"对话
 *   3. 发送一条消息
 *   4. 观察此脚本是否收到并自动回复
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
let conversationId = null;
let heartbeatTimer = null;
let messageCount = 0;

ws.on("open", () => {
  console.log("✅ WebSocket 连接成功");
  ws.send(JSON.stringify({ type: "auth", apiKey: API_KEY }));
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === "auth_result") {
    if (msg.success) {
      conversationId = msg.conversationId;
      console.log(`🎉 认证成功！conversationId: ${conversationId}`);
      console.log(`\n⏳ 等待用户消息... (在 Cosoul.AI IM 中发送消息到 OpenClaw 对话)\n`);
      console.log(`   提示: 你也可以用 curl 测试:\n`);
      console.log(`   curl -X POST http://localhost:3000/api/conversations/${conversationId}/messages \\`);
      console.log(`     -H "Authorization: Bearer YOUR_JWT" \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"content":"你好 OpenClaw！"}'\n`);

      // 开始心跳
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);
    } else {
      console.error(`❌ 认证失败: ${msg.error}`);
      ws.close();
    }
    return;
  }

  if (msg.type === "pong") {
    // 心跳响应，不打印
    return;
  }

  if (msg.type === "message_inbound") {
    messageCount++;
    console.log(`📨 [消息 #${messageCount}] 收到用户消息:`);
    console.log(`   内容: "${msg.content}"`);
    console.log(`   发送者: ${msg.senderId}`);
    console.log(`   时间: ${msg.createdAt}`);

    // 自动回复
    const reply = `你好！我是 OpenClaw 🦞 你说了: "${msg.content}" (消息 #${messageCount})`;
    ws.send(JSON.stringify({
      type: "message_reply",
      conversationId: msg.conversationId,
      content: reply,
    }));
    console.log(`   📤 已回复: "${reply}"\n`);
    return;
  }

  if (msg.type === "error") {
    console.error(`❌ 错误: ${msg.message}`);
    return;
  }

  console.log("📥 未知消息:", JSON.stringify(msg));
});

ws.on("close", (code, reason) => {
  clearInterval(heartbeatTimer);
  console.log(`\n🔌 连接关闭 (code=${code})`);
  console.log(`   共处理了 ${messageCount} 条消息`);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error(`❌ 连接错误: ${err.message}`);
  process.exit(1);
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n\n👋 正在断开...");
  ws.close();
});
