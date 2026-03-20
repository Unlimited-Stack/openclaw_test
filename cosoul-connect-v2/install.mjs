#!/usr/bin/env node
/**
 * Cosoul Connect Skill Installer
 * 
 * This script runs after the skill is installed.
 * It creates a .env.example file and prints setup instructions.
 */

import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\n🔧 Cosoul Connect Skill Installer\n");

// Create .env.example
const envPath = join(__dirname, ".env.example");
if (!existsSync(envPath)) {
  const envContent = [
    "# Cosoul Bridge Configuration",
    "# Copy this file to .env and fill in your values",
    "",
    "# Bridge WebSocket URL",
    "BRIDGE_URL=ws://YOUR_HOST:4060",
    "",
    "# API Key (from Cosoul.AI admin panel)",
    "API_KEY=your_api_key_here",
    "",
  ].join("\n");
  
  writeFileSync(envPath, envContent);
  console.log("✅ Created .env.example");
}

// Print instructions
console.log("\n📋 Next Steps:");
console.log("");
console.log("1. Edit ~/.openclaw/openclaw.json:");
console.log("");
console.log('   {');
console.log('     "channels": {');
console.log('       "cosoul": {');
console.log('         "enabled": true,');
console.log('         "bridgeUrl": "ws://YOUR_HOST:4060",');
console.log('         "apiKey": "YOUR_API_KEY"');
console.log("       }");
console.log("     },");
console.log('     "plugins": {');
console.log('       "entries": {');
console.log('         "cosoul": { "enabled": true }');
console.log("       }");
console.log("     }");
console.log("   }");
console.log("");
console.log("2. Restart OpenClaw:");
console.log("   openclaw gateway restart");
console.log("");
console.log("3. Check status:");
console.log("   openclaw status");
console.log("");
console.log("📖 For more info, see SKILL.md\n");
