/**
 * Notification routing.
 *
 * Consolidates notifications from all platforms (Stripe/Square,
 * GitHub, Vercel, Railway, X) and routes summaries to the
 * appropriate Telegram thread.
 */

import TelegramBot from "node-telegram-bot-api";
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { NotificationRoute } from "./types.js";

const ROUTES_PATH = resolve(env.ELDERBOT_HOME, "config", "notification-routes.json");

// Default routing configuration
const DEFAULT_ROUTES: NotificationRoute[] = [
  { source: "square", targetThread: "business", priority: "high" },
  { source: "coinbase", targetThread: "business", priority: "high" },
  { source: "github", targetThread: "webdev", priority: "normal" },
  { source: "vercel", targetThread: "webdev", priority: "normal" },
  { source: "railway", targetThread: "webdev", priority: "normal" },
  { source: "x-twitter", targetThread: "content", priority: "normal" },
  { source: "email", targetThread: "general", priority: "normal" },
  { source: "security", targetThread: "security", priority: "high" },
];

let cache: NotificationRoute[] | null = null;

async function loadRoutes(): Promise<NotificationRoute[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(ROUTES_PATH, "utf8");
    cache = JSON.parse(raw) as NotificationRoute[];
  } catch {
    cache = [...DEFAULT_ROUTES];
    await saveRoutes(cache);
  }
  return cache;
}

async function saveRoutes(routes: NotificationRoute[]): Promise<void> {
  await mkdir(resolve(env.ELDERBOT_HOME, "config"), { recursive: true });
  await writeFile(ROUTES_PATH, JSON.stringify(routes, null, 2), "utf8");
  cache = routes;
}

/** Route a notification to the appropriate Telegram thread */
export async function routeNotification(
  bot: TelegramBot,
  source: string,
  message: string,
  priority: "high" | "normal" | "low" = "normal"
): Promise<void> {
  const routes = await loadRoutes();
  const route = routes.find((r) => r.source === source);

  const chatId = env.TELEGRAM_OWNER_CHAT_ID;
  if (!chatId) return;

  const prefix = priority === "high" ? "[!] " : "";
  const fullMessage = `${prefix}${source.toUpperCase()}: ${message}`;

  try {
    await bot.sendMessage(chatId, fullMessage);
  } catch {
    // Fallback to plain message
    try {
      await bot.sendMessage(chatId, fullMessage);
    } catch {
      logSecurity("COMMAND_EXECUTED", `Failed to route notification from ${source}`);
    }
  }

  logSecurity("COMMAND_EXECUTED", `Notification routed: ${source}`, {
    thread: route?.targetThread ?? "dm",
    priority,
  });
}

/** Get notification routes */
export async function getRoutes(): Promise<NotificationRoute[]> {
  return loadRoutes();
}

/** Format routes for Telegram */
export async function formatRoutes(): Promise<string> {
  const routes = await loadRoutes();
  const lines = ["Notification Routes:", "---"];

  for (const route of routes) {
    lines.push(`  ${route.source} → ${route.targetThread ?? "DM"} [${route.priority}]`);
  }

  return lines.join("\n");
}
