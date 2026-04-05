/**
 * Utility: Run this to discover your Telegram chat ID.
 * Send any message to the bot and it will print your chat ID.
 *
 * Usage: bun run chat-id
 */
import { env, validateEnv } from "../config/env.js";
import TelegramBot from "node-telegram-bot-api";

validateEnv();

const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Waiting for a message... Send anything to your bot in Telegram.");

bot.on("message", (msg) => {
  console.log(`\nYour chat ID: ${msg.chat.id}`);
  console.log(`Username: ${msg.from?.username ?? "unknown"}`);
  console.log(`\nAdd this to ~/.elderbot-secrets/.env:`);
  console.log(`TELEGRAM_OWNER_CHAT_ID=${msg.chat.id}`);
  bot.stopPolling();
  process.exit(0);
});
