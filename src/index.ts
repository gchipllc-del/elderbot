import { env, validateEnv } from "./config/env.js";
import { logSecurity } from "./security/audit-log.js";
import { createBot } from "./bot/telegram.js";
import { startAllCrons, stopAllCrons } from "./cron/scheduler.js";

// Validate environment before starting
try {
  validateEnv();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

// Log startup
logSecurity("BOT_STARTUP", "ElderBot starting up", {
  nodeEnv: env.NODE_ENV,
  ownerConfigured:
    !!env.TELEGRAM_OWNER_CHAT_ID &&
    env.TELEGRAM_OWNER_CHAT_ID !== "your_chat_id_here",
  home: env.ELDERBOT_HOME,
});

console.log("ElderBot starting...");
console.log(`  Environment: ${env.NODE_ENV}`);
console.log(`  Home: ${env.ELDERBOT_HOME}`);
console.log(
  `  Owner chat ID: ${env.TELEGRAM_OWNER_CHAT_ID ? "configured" : "NOT SET — send any message to get your ID"}`
);

// Create and start the bot
const bot = createBot();

// Start all cron jobs
startAllCrons(bot);

console.log("ElderBot online. Heartbeat active. Listening for Telegram messages...");

// Graceful shutdown
const shutdown = () => {
  logSecurity("BOT_SHUTDOWN", "ElderBot shutting down gracefully");
  stopAllCrons();
  bot.stopPolling();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
