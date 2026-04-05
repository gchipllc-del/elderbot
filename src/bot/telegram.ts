import TelegramBot from "node-telegram-bot-api";
import { env } from "../config/env.js";
import {
  authenticateMessage,
  detectPromptInjection,
} from "../security/channel-auth.js";
import {
  logSecurity,
  logSecurityWarning,
} from "../security/audit-log.js";

export function createBot(): TelegramBot {
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ?? "";
    const username = msg.from?.username ?? "unknown";

    // Authenticate the message source
    const auth = authenticateMessage(chatId, "telegram");

    // Check for prompt injection regardless of source
    if (detectPromptInjection(text)) {
      logSecurityWarning("PROMPT_INJECTION_ATTEMPT", "Prompt injection detected", {
        chatId: String(chatId),
        username,
        text: text.substring(0, 200), // truncate for log safety
      });

      if (!auth.authorized) {
        // Silently ignore injection from unauthorized users
        return;
      }
      // If owner sent it, warn them but still process
      await bot.sendMessage(
        chatId,
        "Warning: That message matched a prompt injection pattern. Processing since you're the owner, but flagging it."
      );
    }

    // Reject unauthorized messages
    if (!auth.authorized) {
      // If chat ID isn't configured yet, help with setup
      if (
        !env.TELEGRAM_OWNER_CHAT_ID ||
        env.TELEGRAM_OWNER_CHAT_ID === "your_chat_id_here"
      ) {
        await bot.sendMessage(
          chatId,
          `ElderBot setup: Your chat ID is ${chatId}\n\nAdd this to ~/.elderbot-secrets/.env:\nTELEGRAM_OWNER_CHAT_ID=${chatId}\n\nThen restart the bot.`
        );
        logSecurity("AUTH_FAILURE", "Chat ID discovery — setup mode", {
          chatId: String(chatId),
          username,
        });
        return;
      }

      logSecurityWarning("UNAUTHORIZED_CHANNEL", "Message from unauthorized source ignored", {
        chatId: String(chatId),
        username,
      });
      return;
    }

    // --- Authenticated command processing ---
    logSecurity("COMMAND_EXECUTED", `Processing command from owner`, {
      chatId: String(chatId),
      text: text.substring(0, 100),
    });

    // Handle commands
    if (text === "/start") {
      await bot.sendMessage(chatId, "ElderBot online. Security-first. Ready for commands.");
      return;
    }

    if (text === "/status") {
      await bot.sendMessage(chatId, formatStatus());
      return;
    }

    if (text === "/security") {
      await bot.sendMessage(chatId, formatSecurityStatus());
      return;
    }

    // Default: echo back for now (will be replaced with actual agent logic)
    await bot.sendMessage(
      chatId,
      `Received: "${text}"\n\nElderBot is in Week 1 setup mode. Agent logic coming in later sprints.`
    );
  });

  bot.on("polling_error", (error) => {
    logSecurityWarning("BOT_SHUTDOWN", `Polling error: ${error.message}`);
  });

  return bot;
}

function formatStatus(): string {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return [
    "ElderBot Status",
    "---",
    `Uptime: ${hours}h ${minutes}m`,
    `Environment: ${env.NODE_ENV}`,
    `Owner chat ID: ${env.TELEGRAM_OWNER_CHAT_ID ? "configured" : "NOT SET"}`,
    "",
    "Week 1: Foundation & Security Core",
    "Status: Active",
  ].join("\n");
}

function formatSecurityStatus(): string {
  return [
    "Security Status",
    "---",
    `Authenticated channel: Telegram (owner ID ${env.TELEGRAM_OWNER_CHAT_ID ? "set" : "NOT SET"})`,
    "Information channels: email, X, web (read-only, never execute)",
    "Audit log: ~/elderbot/logs/security.log",
    "Prompt injection detection: active",
    "",
    "Core rules:",
    "- Only Telegram from owner = commands",
    "- All other input = information only",
    "- All security events logged",
    "- Bot cannot modify past log entries",
  ].join("\n");
}
