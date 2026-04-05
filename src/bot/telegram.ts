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
import { handleCommand } from "./commands.js";
import { ensureTodayNote } from "../memory/daily-notes.js";

export function createBot(): TelegramBot {
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

  // Ensure today's daily note exists on startup
  ensureTodayNote().catch(console.error);

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
        text: text.substring(0, 200),
      });

      if (!auth.authorized) {
        return; // Silently ignore from unauthorized users
      }
      await bot.sendMessage(
        chatId,
        "Warning: That message matched a prompt injection pattern. Flagging it."
      );
    }

    // Reject unauthorized messages
    if (!auth.authorized) {
      if (
        !env.TELEGRAM_OWNER_CHAT_ID ||
        env.TELEGRAM_OWNER_CHAT_ID === "your_chat_id_here"
      ) {
        await bot.sendMessage(
          chatId,
          `ElderBot setup: Your chat ID is ${chatId}\n\nAdd to ~/.elderbot-secrets/.env:\nTELEGRAM_OWNER_CHAT_ID=${chatId}\n\nThen restart the bot.`
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
    logSecurity("COMMAND_EXECUTED", "Processing command from owner", {
      chatId: String(chatId),
      text: text.substring(0, 100),
    });

    try {
      await handleCommand(bot, chatId, text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logSecurityWarning("COMMAND_EXECUTED", `Command error: ${message}`);
      await bot.sendMessage(chatId, `Error: ${message}`);
    }
  });

  bot.on("polling_error", (error) => {
    logSecurityWarning("BOT_SHUTDOWN", `Polling error: ${error.message}`);
  });

  return bot;
}
