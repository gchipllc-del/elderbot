/**
 * Heartbeat — fires every 30 minutes.
 *
 * Checks:
 * 1. Active sessions — are any stalled or overdue?
 * 2. Daily note — any open action items needing attention?
 * 3. Reports anything notable back to Jesse via Telegram.
 *
 * Heartbeat can only READ and REPORT.
 * It cannot make financial transactions, deploy code, or send external
 * communications without explicit approval. (CLAUDE.md constraint)
 */

import TelegramBot from "node-telegram-bot-api";
import { getActiveSessions, checkStaleSessions, formatSessions } from "./sessions.js";
import { readTodayNote } from "../memory/daily-notes.js";
import { logSecurity } from "../security/audit-log.js";
import { env } from "../config/env.js";

let heartbeatCount = 0;

export async function runHeartbeat(bot: TelegramBot): Promise<void> {
  heartbeatCount++;
  logSecurity("COMMAND_EXECUTED", `Heartbeat #${heartbeatCount} firing`);

  const issues: string[] = [];

  // 1. Check for stalled sessions
  const staleSessions = await checkStaleSessions();
  if (staleSessions.length > 0) {
    for (const s of staleSessions) {
      issues.push(`Session stalled (>8h): "${s.name}" — needs your attention`);
    }
  }

  // 2. Check active sessions count
  const activeSessions = await getActiveSessions();
  if (activeSessions.length > 0) {
    logSecurity("COMMAND_EXECUTED", `Heartbeat: ${activeSessions.length} active session(s)`, {
      sessions: activeSessions.map((s) => s.name),
    });
  }

  // 3. Check for overdue action items in today's note
  try {
    const todayNote = await readTodayNote();
    const overduePattern = /^- \[ \] .*(urgent|overdue|today|asap)/im;
    if (overduePattern.test(todayNote)) {
      issues.push("Urgent action items found in today's note — check /today");
    }
  } catch {
    // daily note read failed — non-critical
  }

  // Only message Jesse if there's something worth reporting
  if (issues.length > 0) {
    const message = [
      `Heartbeat #${heartbeatCount} — issue(s) found:`,
      ...issues.map((i) => `• ${i}`),
    ].join("\n");

    const chatId = parseInt(env.TELEGRAM_OWNER_CHAT_ID);
    if (!isNaN(chatId)) {
      await bot.sendMessage(chatId, message).catch((err) => {
        logSecurity("COMMAND_EXECUTED", `Heartbeat send failed: ${err.message}`);
      });
    }
  }
  // Silent if nothing to report — don't spam Jesse with "all good" messages
}

export function getHeartbeatCount(): number {
  return heartbeatCount;
}
