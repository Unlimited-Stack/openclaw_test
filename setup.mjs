#!/usr/bin/env node
/**
 * 一键配置脚本 — 登录 Cosoul.AI → 生成 API Key → 写入 .env
 *
 * 用法：
 *   node setup.mjs <cosoul服务器地址>
 *   node setup.mjs https://cosoul.ai
 *   node setup.mjs http://123.45.67.89:3000
 */

import { writeFileSync, existsSync, readFileSync } from "fs";
import readline from "readline";

const SERVER = process.argv[2];
if (!SERVER) {
  console.error("用法: node setup.mjs <cosoul服务器地址>");
  console.error("例如: node setup.mjs http://123.45.67.89:3000");
  process.exit(1);
}

// 去掉尾部斜杠
const BASE = SERVER.replace(/\/+$/, "");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log(`\n🔧 Cosoul.AI OpenClaw 配置向导`);
  console.log(`   服务器: ${BASE}\n`);

  // ── Step 1: 健康检查 ──
  console.log("1️⃣  检查服务器连接...");
  try {
    const healthRes = await fetch(`${BASE}/api/health`);
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    console.log("   ✅ 服务器可达\n");
  } catch (err) {
    console.error(`   ❌ 无法连接到 ${BASE}/api/health`);
    console.error(`   错误: ${err.message}`);
    console.error(`   请确认服务器地址正确且 cosoul-web 正在运行`);
    process.exit(1);
  }

  // ── Step 2: 登录获取 JWT ──
  console.log("2️⃣  登录 Cosoul.AI 账号");
  const email = await ask("   邮箱: ");
  const password = await ask("   密码: ");

  let accessToken;
  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      throw new Error(loginData.error || `HTTP ${loginRes.status}`);
    }
    accessToken = loginData.tokens?.accessToken || loginData.accessToken;
    if (!accessToken) throw new Error("未获取到 accessToken");
    console.log(`   ✅ 登录成功 (${loginData.user?.name || email})\n`);
  } catch (err) {
    console.error(`   ❌ 登录失败: ${err.message}`);
    process.exit(1);
  }

  // ── Step 3: 检查 bridge 是否运行 ──
  console.log("3️⃣  检查 Bridge 服务...");
  // 从服务器地址推导 bridge 地址
  const url = new URL(BASE);
  const bridgeHttpUrl = `${url.protocol}//${url.hostname}:4060`;
  const bridgeWsUrl = `${url.protocol === "https:" ? "wss" : "ws"}://${url.hostname}:4060`;
  try {
    const bridgeRes = await fetch(`${bridgeHttpUrl}/health`);
    const bridgeData = await bridgeRes.json();
    console.log(`   ✅ Bridge 运行中 (连接数: ${bridgeData.connections})\n`);
  } catch (err) {
    console.error(`   ⚠️  Bridge 不可达 (${bridgeHttpUrl}/health)`);
    console.error(`   请确认 cosoul-bridge 已启动且 4060 端口已暴露`);
    console.error(`   继续生成 API Key，你可以稍后启动 bridge...\n`);
  }

  // ── Step 4: 生成 API Key ──
  console.log("4️⃣  生成 OpenClaw API Key...");
  let apiKey;
  try {
    const keyRes = await fetch(`${BASE}/api/openclaw/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ label: "openclaw-test" }),
    });
    const keyData = await keyRes.json();
    if (!keyRes.ok) {
      throw new Error(keyData.error || `HTTP ${keyRes.status}`);
    }
    apiKey = keyData.rawKey;
    console.log(`   ✅ API Key 已生成`);
    console.log(`   ⚠️  请保存此 Key，不会再次显示！`);
    console.log(`   Key ID: ${keyData.id}`);
    console.log(`   过期时间: ${keyData.expiresAt}\n`);
  } catch (err) {
    console.error(`   ❌ 生成 API Key 失败: ${err.message}`);
    process.exit(1);
  }

  // ── Step 5: 获取/创建 OpenClaw 对话 ──
  console.log("5️⃣  获取 OpenClaw 专属对话...");
  try {
    const convRes = await fetch(`${BASE}/api/openclaw/conversation`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const convData = await convRes.json();
    console.log(`   ✅ conversationId: ${convData.conversationId}`);
    console.log(`   新建: ${convData.created ? "是" : "否（已有）"}\n`);
  } catch (err) {
    console.log(`   ⚠️  获取对话失败（bridge 启动后会自动创建）\n`);
  }

  // ── Step 6: 写入 .env ──
  const envContent = [
    `# 自动生成 — ${new Date().toISOString()}`,
    `BRIDGE_URL=${bridgeWsUrl}`,
    `API_KEY=${apiKey}`,
    ``,
    `# Cosoul 服务器地址（setup 脚本用）`,
    `COSOUL_SERVER=${BASE}`,
  ].join("\n");

  const envPath = new URL(".env", import.meta.url).pathname;
  writeFileSync(envPath, envContent);
  console.log("6️⃣  配置已写入 .env 文件");

  // ── 完成 ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ 配置完成！接下来：`);
  console.log(`\n   测试连接:`);
  console.log(`   npm run test:connect`);
  console.log(`\n   测试聊天:`);
  console.log(`   npm run test:chat`);
  console.log(`\n   Bridge 地址: ${bridgeWsUrl}`);
  console.log(`${"═".repeat(50)}\n`);

  rl.close();
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exit(1);
});
