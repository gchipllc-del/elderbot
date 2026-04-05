import winston from "winston";
import { resolve } from "path";
import { env } from "../config/env.js";

const logDir = resolve(env.ELDERBOT_HOME, "logs");

// Append-only security log — bot cannot delete or modify past entries
const securityLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: resolve(logDir, "security.log"),
      // append-only: no max size rotation that would delete entries
      options: { flags: "a" },
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export type SecurityEvent =
  | "BOT_STARTUP"
  | "BOT_SHUTDOWN"
  | "AUTH_SUCCESS"
  | "AUTH_FAILURE"
  | "PROMPT_INJECTION_ATTEMPT"
  | "COMMAND_EXECUTED"
  | "API_KEY_USED"
  | "DEPLOYMENT"
  | "FINANCIAL_TRANSACTION"
  | "UNAUTHORIZED_CHANNEL"
  | "CONFIG_CHANGE";

export function logSecurity(
  event: SecurityEvent,
  message: string,
  meta?: Record<string, unknown>
): void {
  securityLogger.info(`[${event}] ${message}`, meta);
}

export function logSecurityWarning(
  event: SecurityEvent,
  message: string,
  meta?: Record<string, unknown>
): void {
  securityLogger.warn(`[${event}] ${message}`, meta);
}
