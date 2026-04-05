/**
 * Morning Briefing — fires at 8 AM daily.
 *
 * Sends Jesse a Telegram summary of:
 * - Active project status
 * - Memory updates from overnight consolidation
 * - Security events from the last 24 hours
 * - Open action items needing a decision
 */

import TelegramBot from "node-telegram-bot-api";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { getTodaySummary } from "../memory/daily-notes.js";
import { getActiveSessions } from "./sessions.js";
import { logSecurity } from "../security/audit-log.js";
import { env } from "../config/env.js";

export async function sendMorningBriefing(bot: TelegramBot): Promise<void> {
  logSecurity("COMMAND_EXECUTED", "Morning briefing firing");

  const chatId = parseInt(env.TELEGRAM_OWNER_CHAT_ID);
  if (isNaN(chatId)) return;

  const sections: string[] = ["Good morning. ElderBot daily briefing:", "---"];

  // 1. Today's daily note summary
  try {
    const summary = await getTodaySummary();
    sections.push(summary);
  } catch {
    sections.push("Daily note: unable to read");
  }

  // 2. Active sessions
  try {
    const sessions = await getActiveSessions();
    if (sessions.length > 0) {
      sections.push(`\nActive sessions (${sessions.length}):`);
      for (const s of sessions) {
        const hoursAgo = ((Date.now() - new Date(s.startedAt).getTime()) / (1000 * 60 * 60)).toFixed(1);
        sections.push(`• ${s.name} — running ${hoursAgo}h`);
      }
    } else {
      sections.push("\nNo active sessions.");
    }
  } catch {
    sections.push("\nSessions: unable to read");
  }

  // 3. Security events from last 24 hours
  try {
    const securityLog = await readFile(
      resolve(env.ELDERBOT_HOME, "logs", "security.log"),
      "utf8"
    );
    const lines = securityLog.split("\n").filter(Boolean);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentWarnings = lines.filter((l) => {
      const match = l.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
      if (!match) return false;
      const lineDate = new Date(match[1]);
      return lineDate > yesterday && l.includes("[WARN]");
    });

    if (recentWarnings.length > 0) {
      sections.push(`\nSecurity events (last 24h): ${recentWarnings.length} warning(s)`);
      recentWarnings.slice(-3).forEach((l) => sections.push(`  ${l.substring(0, 100)}`));
    } else {
      sections.push("\nSecurity: no warnings in last 24h");
    }
  } catch {
    sections.push("\nSecurity log: unable to read");
  }

  // 4. Commands reminder
  sections.push("\n/today /recall /status /memory");

  await bot.sendMessage(chatId, sections.join("\n")).catch((err) => {
    logSecurity("COMMAND_EXECUTED", `Morning briefing send failed: ${err.message}`);
  });
}
