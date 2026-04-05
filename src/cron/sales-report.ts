/**
 * Daily sales report cron handler.
 *
 * Fires at 8 PM daily — gives Jesse a revenue summary before bed.
 * Pattern follows briefing.ts.
 */

import TelegramBot from "node-telegram-bot-api";
import { env } from "../config/env.js";
import { generateDailyReport } from "../payments/reporting.js";
import { appendToSection } from "../memory/daily-notes.js";
import { logSecurity } from "../security/audit-log.js";

export async function sendDailySalesReport(bot: TelegramBot): Promise<void> {
  logSecurity("COMMAND_EXECUTED", "Daily sales report firing");

  try {
    const report = await generateDailyReport();

    // Send to owner
    const chatId = env.TELEGRAM_OWNER_CHAT_ID;
    if (!chatId) return;

    await bot.sendMessage(chatId, report).catch(() => {
      // Try without thread if topic fails
      bot.sendMessage(chatId, report);
    });

    // Append summary line to today's daily note
    const totalLine = report.includes("No sales")
      ? "No sales today."
      : report.split("\n").find((l) => l.startsWith("Total Revenue:")) ?? "Report sent.";

    await appendToSection("Revenue", totalLine).catch(() => {});

    logSecurity("COMMAND_EXECUTED", "Daily sales report sent");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `Sales report error: ${msg}`);
  }
}
