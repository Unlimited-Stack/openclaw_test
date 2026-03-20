/**
 * PostgreSQL 连接池 + Drizzle ORM 初始化
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("db");

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://cosoul:cosoul@localhost:5432/cosoul_agent";

/** 原始 pg 连接池 */
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/** Drizzle ORM 实例 */
export const db = drizzle(pool, { schema });

/** 关闭连接池 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
  log.info("connection pool closed");
}
