/**
 * Bot command handlers — all authenticated commands routed here.
 */

import TelegramBot from "node-telegram-bot-api";
import { search, formatSearchResults } from "../memory/search.js";
import {
  addNote,
  getTodaySummary,
  listRecentNotes,
} from "../memory/daily-notes.js";
import { addLesson, addPreference } from "../memory/tacit.js";
import { consolidate, formatReport } from "../memory/consolidate.js";
import { logSecurity } from "../security/audit-log.js";
import { env } from "../config/env.js";
import { getCronStatus } from "../cron/scheduler.js";
import {
  startSession,
  completeSession,
  getActiveSessions,
  formatSessions,
} from "../cron/sessions.js";
import { runHeartbeat } from "../cron/heartbeat.js";
import { sendMorningBriefing } from "../cron/briefing.js";

export async function handleCommand(
  bot: TelegramBot,
  chatId: number,
  text: string
): Promise<void> {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const arg = args.join(" ");

  switch (cmd) {
    case "/start":
    case "/help":
      await bot.sendMessage(chatId, [
        "ElderBot Commands",
        "---",
        "Memory:",
        "/today — today's daily note summary",
        "/note <text> — add a note",
        "/recall <query> — search all memory",
        "/memory — memory system status",
        "/lesson <text> — log a lesson learned",
        "/pref <text> — log a preference",
        "/consolidate — run nightly consolidation now",
        "",
        "Sessions & Crons:",
        "/sessions — list active sessions",
        "/session start <name> — start a tracked session",
        "/session done <id> — mark session complete",
        "/crons — show all cron jobs and status",
        "/heartbeat — run heartbeat check now",
        "/briefing — send morning briefing now",
        "",
        "System:",
        "/status — system status",
        "/security — security channel status",
      ].join("\n"));
      break;

    case "/status":
      await bot.sendMessage(chatId, formatStatus());
      break;

    case "/security":
      await bot.sendMessage(chatId, formatSecurityStatus());
      break;

    case "/today": {
      const summary = await getTodaySummary();
      await bot.sendMessage(chatId, summary);
      break;
    }

    case "/note": {
      if (!arg) {
        await bot.sendMessage(chatId, "Usage: /note <text to remember>");
        return;
      }
      await addNote(arg);
      logSecurity("COMMAND_EXECUTED", "Note added to daily log", { note: arg.substring(0, 80) });
      await bot.sendMessage(chatId, `Note saved to today's log.`);
      break;
    }

    case "/recall": {
      if (!arg) {
        await bot.sendMessage(chatId, "Usage: /recall <search query>");
        return;
      }
      const results = await search(arg);
      await bot.sendMessage(chatId, formatSearchResults(arg, results));
      break;
    }

    case "/memory": {
      const { getIndex } = await import("../memory/search.js");
      const index = await getIndex();
      const notes = await listRecentNotes(7);
      await bot.sendMessage(chatId, [
        "Memory System Status",
        "---",
        `Indexed files: ${index.length}`,
        `Daily notes (last 7 days): ${notes.join(", ") || "none"}`,
        "",
        "Layers:",
        "Layer 1 — Knowledge (PARA): life/knowledge/",
        "Layer 2 — Daily Notes: life/daily-notes/",
        "Layer 3 — Tacit: life/tacit/",
      ].join("\n"));
      break;
    }

    case "/lesson": {
      if (!arg) {
        await bot.sendMessage(chatId, "Usage: /lesson <what you learned>");
        return;
      }
      await addLesson(arg);
      await bot.sendMessage(chatId, "Lesson logged to tacit knowledge.");
      break;
    }

    case "/pref": {
      if (!arg) {
        await bot.sendMessage(chatId, "Usage: /pref <preference or pattern>");
        return;
      }
      await addPreference(arg);
      await bot.sendMessage(chatId, "Preference saved.");
      break;
    }

    case "/consolidate": {
      await bot.sendMessage(chatId, "Running memory consolidation...");
      try {
        const report = await consolidate();
        await bot.sendMessage(chatId, formatReport(report));
      } catch (err) {
        await bot.sendMessage(chatId, `Consolidation error: ${(err as Error).message}`);
      }
      break;
    }

    case "/crons":
      await bot.sendMessage(chatId, getCronStatus());
      break;

    case "/sessions": {
      const sessions = await getActiveSessions();
      await bot.sendMessage(chatId, `Active Sessions:\n---\n${formatSessions(sessions)}`);
      break;
    }

    case "/session": {
      const [subCmd, ...rest] = args;
      const sessionArg = rest.join(" ");

      if (subCmd === "start") {
        if (!sessionArg) {
          await bot.sendMessage(chatId, "Usage: /session start <name>");
          return;
        }
        const session = await startSession(sessionArg, `Started via Telegram`);
        await bot.sendMessage(chatId, `Session started: "${session.name}"\nID: ${session.id}\nWorkspace: ~/elderbot/${session.workspace}`);
      } else if (subCmd === "done") {
        if (!sessionArg) {
          await bot.sendMessage(chatId, "Usage: /session done <session-id>");
          return;
        }
        await completeSession(sessionArg);
        await bot.sendMessage(chatId, `Session marked complete: ${sessionArg}`);
      } else {
        await bot.sendMessage(chatId, "Usage:\n/session start <name>\n/session done <id>");
      }
      break;
    }

    case "/heartbeat": {
      await bot.sendMessage(chatId, "Running heartbeat check...");
      await runHeartbeat(bot);
      const sessions = await getActiveSessions();
      if (sessions.length === 0) {
        await bot.sendMessage(chatId, "Heartbeat complete. No issues found. No active sessions.");
      }
      break;
    }

    case "/briefing":
      await sendMorningBriefing(bot);
      break;

    default:
      // Not a slash command — treat as a note
      await bot.sendMessage(
        chatId,
        `Not a recognized command. Use /help to see commands.\n\nTo save a note: /note ${text}`
      );
  }
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
    "Week 2: 3-Layer Memory System — Active",
    "Memory search: online",
    "Daily notes: auto-generating",
    "Nightly consolidation: ready",
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
