/**
 * Logger 模块 — 基于 pino 的结构化日志
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

/** 创建带 module 标签的子 logger */
export function createLogger(module: string) {
  return rootLogger.child({ module });
}

/** 创建带请求上下文的 logger */
export function createRequestLogger(
  module: string,
  traceId: string,
  userId?: string,
) {
  return rootLogger.child({
    module,
    traceId,
    ...(userId ? { userId } : {}),
  });
}

export { rootLogger };
