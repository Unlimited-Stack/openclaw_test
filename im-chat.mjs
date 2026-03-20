#!/usr/bin/env node
/**
 * 模拟 IM 终端客户端 — 代替前端界面，直接在终端跟 OpenClaw 聊天
 *
 * 功能：
 *   - 输入消息 → 发到 Cosoul API（senderMode: human）
 *   - 每 2 秒轮询新消息
 *   - 显示 OpenClaw 的回复
 */

import readline from "readline";
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

const COSOUL_SERVER = env.COSOUL_SERVER || process.env.COSOUL_SERVER || "http://localhost:3030";
const EMAIL = process.argv[2] || "admin@cosoul.ai";
const PASSWORD = process.argv[3] || "Admin123456";

let accessToken = null;
let conversationId = null;
let lastSeenAt = null;  // 用于过滤已显示的消息

async function login() {
  const res = await fetch(`${COSOUL_SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed: ${res.status}`);
  accessToken = data.tokens.accessToken;
  console.log(`✅ 登录成功: ${data.user.name || EMAIL}`);
}

async function getConversation() {
  const res = await fetch(`${COSOUL_SERVER}/api/openclaw/conversation`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get conversation");
  conversationId = data.conversationId;
  console.log(`📋 OpenClaw 对话: ${conversationId}`);
}

async function sendMessage(content) {
  const res = await fetch(`${COSOUL_SERVER}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`❌ 发送失败: ${data.error || res.status}`);
    return;
  }
  lastSeenAt = data.createdAt;
  console.log(`\x1b[36m  你: ${content}\x1b[0m`);
}

async function pollMessages() {
  try {
    const res = await fetch(`${COSOUL_SERVER}/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const messages = await res.json();

    // 按时间正序
    const sorted = messages.reverse();

    for (const msg of sorted) {
      // 只显示比 lastSeenAt 更新的消息
      if (lastSeenAt && msg.createdAt <= lastSeenAt) continue;

      if (msg.senderMode === "openclaw") {
        console.log(`\x1b[32m  🦞 OpenClaw: ${msg.content}\x1b[0m`);
        lastSeenAt = msg.createdAt;
      } else if (msg.senderMode === "human" && !lastSeenAt) {
        // 首次加载时显示历史消息
        console.log(`\x1b[36m  你: ${msg.content}\x1b[0m`);
        lastSeenAt = msg.createdAt;
      }
    }
  } catch {
    // 静默忽略轮询错误
  }
}

async function main() {
  console.log(`\n💬 Cosoul.AI IM 终端（模拟前端）`);
  console.log(`   服务器: ${COSOUL_SERVER}\n`);

  await login();
  await getConversation();

  // 加载历史消息
  console.log(`\n--- 历史消息 ---`);
  await pollMessages();
  console.log(`--- 开始聊天（输入消息后回车发送，Ctrl+C 退出）---\n`);

  // 轮询新消息
  const pollTimer = setInterval(pollMessages, 2000);

  // 交互式输入
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("");

  rl.on("line", async (line) => {
    const content = line.trim();
    if (!content) return;
    await sendMessage(content);
  });

  rl.on("close", () => {
    clearInterval(pollTimer);
    console.log("\n👋 退出");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("致命错误:", err.message);
  process.exit(1);
});
