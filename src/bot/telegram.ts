import TelegramBot from "node-telegram-bot-api";
import { env } from "../config/env.js";
import {
  authenticateMessage,
  detectPromptInjection,
} from "../security/channel-auth.js";
import { logSecurity, logSecurityWarning } from "../security/audit-log.js";
import { handleCommand } from "./commands.js";
import { ensureTodayNote } from "../memory/daily-notes.js";
import { detectDomain } from "../threads/registry.js";
import { getContext } from "../threads/context.js";

export function createBot(): TelegramBot {
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

  // Ensure today's daily note exists on startup
  ensureTodayNote().catch(console.error);

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ?? "";
    const username = msg.from?.username ?? "unknown";
    const threadId = msg.message_thread_id;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

    // Authenticate — verify sender is owner regardless of group or DM
    const auth = authenticateMessage(msg.from?.id ?? chatId, "telegram");

    // Detect which thread/domain this message belongs to
    const threadConfig = await detectDomain(chatId, threadId, isGroup);

    // Get or create thread context
    const context = getContext(chatId, threadConfig.domain, threadId);

    // Check for prompt injection
    if (detectPromptInjection(text)) {
      logSecurityWarning("PROMPT_INJECTION_ATTEMPT", "Prompt injection detected", {
        chatId: String(chatId),
        username,
        thread: threadConfig.domain,
        text: text.substring(0, 200),
      });

      if (!auth.authorized) return;
      await bot.sendMessage(
        chatId,
        "Warning: That message matched a prompt injection pattern. Flagging it.",
        threadId ? { message_thread_id: threadId } : undefined
      );
    }

    // Reject unauthorized senders
    if (!auth.authorized) {
      if (
        !env.TELEGRAM_OWNER_CHAT_ID ||
        env.TELEGRAM_OWNER_CHAT_ID === "your_chat_id_here"
      ) {
        await bot.sendMessage(
          chatId,
          `ElderBot setup: Your user ID is ${msg.from?.id}\n\nAdd to ~/.elderbot-secrets/.env:\nTELEGRAM_OWNER_CHAT_ID=${msg.from?.id}\n\nThen restart the bot.`,
          threadId ? { message_thread_id: threadId } : undefined
        );
        logSecurity("AUTH_FAILURE", "User ID discovery — setup mode", {
          userId: String(msg.from?.id),
          username,
        });
        return;
      }

      logSecurityWarning("UNAUTHORIZED_CHANNEL", "Message from unauthorized sender ignored", {
        userId: String(msg.from?.id),
        chatId: String(chatId),
        username,
        thread: threadConfig.domain,
      });
      return;
    }

    // SECURITY THREAD — report only, never execute commands
    if (threadConfig.domain === "security" && !threadConfig.executePermissions) {
      logSecurityWarning(
        "UNAUTHORIZED_CHANNEL",
        "Command attempted in security thread — ignored",
        { text: text.substring(0, 100), threadId }
      );
      try {
        await bot.sendMessage(
          chatId,
          "Security thread is report-only. Commands are not executed here.\n\nUse the General thread for commands.",
          { message_thread_id: threadId }
        );
      } catch {
        logSecurityWarning("COMMAND_EXECUTED", "Failed to reply in security thread (topic may be closed)");
      }
      return;
    }

    // Authenticated command processing
    logSecurity("COMMAND_EXECUTED", "Processing command from owner", {
      chatId: String(chatId),
      thread: threadConfig.domain,
      threadId,
      msgCount: context.messageCount,
      text: text.substring(0, 100),
    });

    try {
      await handleCommand(bot, chatId, text, threadId, threadConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logSecurityWarning("COMMAND_EXECUTED", `Command error: ${message}`);
      // If topic is closed or thread invalid, fall back to plain message
      try {
        await bot.sendMessage(
          chatId,
          `Error: ${message}`,
          threadId ? { message_thread_id: threadId } : undefined
        );
      } catch {
        try {
          await bot.sendMessage(chatId, `Error: ${message}`);
        } catch {
          logSecurityWarning("COMMAND_EXECUTED", `Failed to send error reply: ${message}`);
        }
      }
    }
  });

  bot.on("polling_error", (error) => {
    logSecurityWarning("BOT_SHUTDOWN", `Polling error: ${error.message}`);
  });

  return bot;
}
