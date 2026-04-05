/**
 * Bot command handlers — all authenticated commands routed here.
 */

import TelegramBot from "node-telegram-bot-api";
import { search, formatSearchResults } from "../memory/search.js";
import {
  addNote,
  getTodaySummary,
  appendToSection,
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
import {
  formatThreadList,
  registerThread,
  ThreadDomain,
  type ThreadConfig,
} from "../threads/registry.js";
import { formatContextSummary, setActiveProject } from "../threads/context.js";
import { chat, clearHistory, getHistoryLength, getCurrentModel } from "../ai/claude.js";

type SendOptions = { message_thread_id?: number };

export async function handleCommand(
  bot: TelegramBot,
  chatId: number,
  text: string,
  threadId?: number,
  threadConfig?: ThreadConfig
): Promise<void> {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const arg = args.join(" ");
  const opts: SendOptions = threadId ? { message_thread_id: threadId } : {};
  const domain = threadConfig?.domain ?? "dm";

  // Fall back to plain message if topic is closed or thread ID is invalid
  const reply = async (msg: string) => {
    try {
      await bot.sendMessage(chatId, msg, opts);
    } catch (err) {
      const e = err as Error;
      if (e.message?.includes("TOPIC_CLOSED") || e.message?.includes("thread")) {
        await bot.sendMessage(chatId, msg);
      } else {
        throw err;
      }
    }
  };

  switch (cmd) {
    case "/start":
    case "/help":
      await reply([
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
        "Threads:",
        "/threads — show all thread configs",
        "/thread register <domain> — register this thread",
        "/thread context — show active thread contexts",
        "/project <name> — set active project for this thread",
        "",
        "System:",
        "/status — system status",
        "/security — security channel status",
        "/reset — clear AI conversation history for this thread",
        "",
        "Or just send any message to chat with Elderbot AI.",
      ].join("\n"));
      break;

    case "/status":
      await reply(formatStatus(domain));
      break;

    case "/security":
      await reply(formatSecurityStatus());
      break;

    case "/today": {
      const summary = await getTodaySummary();
      await reply(summary);
      break;
    }

    case "/note": {
      if (!arg) {
        await reply("Usage: /note <text to remember>");
        return;
      }
      // Tag notes with thread domain for context
      const taggedNote = domain !== "dm" ? `[${domain}] ${arg}` : arg;
      await addNote(taggedNote);
      logSecurity("COMMAND_EXECUTED", "Note added to daily log", {
        note: arg.substring(0, 80),
        thread: domain,
      });
      await reply("Note saved to today's log.");
      break;
    }

    case "/recall": {
      if (!arg) {
        await reply("Usage: /recall <search query>");
        return;
      }
      const results = await search(arg);
      await reply(formatSearchResults(arg, results));
      break;
    }

    case "/memory": {
      const { getIndex } = await import("../memory/search.js");
      const index = await getIndex();
      const notes = await listRecentNotes(7);
      await reply([
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
        await reply("Usage: /lesson <what you learned>");
        return;
      }
      await addLesson(arg);
      await reply("Lesson logged to tacit knowledge.");
      break;
    }

    case "/pref": {
      if (!arg) {
        await reply("Usage: /pref <preference or pattern>");
        return;
      }
      await addPreference(arg);
      await reply("Preference saved.");
      break;
    }

    case "/consolidate": {
      await reply("Running memory consolidation...");
      try {
        const report = await consolidate();
        await reply(formatReport(report));
      } catch (err) {
        await reply(`Consolidation error: ${(err as Error).message}`);
      }
      break;
    }

    case "/crons":
      await reply(getCronStatus());
      break;

    case "/sessions": {
      const sessions = await getActiveSessions();
      await reply(`Active Sessions:\n---\n${formatSessions(sessions)}`);
      break;
    }

    case "/session": {
      const [subCmd, ...rest] = args;
      const sessionArg = rest.join(" ");

      if (subCmd === "start") {
        if (!sessionArg) {
          await reply("Usage: /session start <name>");
          return;
        }
        const session = await startSession(sessionArg, "Started via Telegram", domain);
        await reply(
          `Session started: "${session.name}"\nID: ${session.id}\nThread: ${domain}\nWorkspace: ~/elderbot/${session.workspace}`
        );
      } else if (subCmd === "done") {
        if (!sessionArg) {
          await reply("Usage: /session done <session-id>");
          return;
        }
        await completeSession(sessionArg);
        await reply(`Session marked complete: ${sessionArg}`);
      } else {
        await reply("Usage:\n/session start <name>\n/session done <id>");
      }
      break;
    }

    case "/heartbeat": {
      await reply("Running heartbeat check...");
      await runHeartbeat(bot);
      const sessions = await getActiveSessions();
      if (sessions.length === 0) {
        await reply("Heartbeat complete. No issues found. No active sessions.");
      }
      break;
    }

    case "/briefing":
      await sendMorningBriefing(bot);
      break;

    case "/threads":
      await reply(await formatThreadList());
      break;

    case "/thread": {
      const [subCmd, domainArg] = args;

      if (subCmd === "register") {
        if (!domainArg) {
          await reply("Usage: /thread register <domain>\nDomains: general, business, webdev, content, security");
          return;
        }
        if (!threadId) {
          await reply("This command must be sent from inside a Telegram topic thread.");
          return;
        }
        const registered = await registerThread(
          domainArg as ThreadDomain,
          threadId,
          chatId
        );
        if (!registered) {
          await reply(`Unknown domain: ${domainArg}\nValid: general, business, webdev, content, security`);
          return;
        }
        await reply(
          `Thread registered!\nDomain: ${registered.domain}\nName: ${registered.name}\nThread ID: ${threadId}\nExecute permissions: ${registered.executePermissions}`
        );
        await appendToSection(
          "Notes",
          `Thread registered: ${registered.name} (${domainArg}) — ID ${threadId}`
        );
        logSecurity("CONFIG_CHANGE", "Thread registered", {
          domain: domainArg,
          threadId,
          chatId,
        });
      } else if (subCmd === "context") {
        await reply(`Thread Contexts:\n---\n${formatContextSummary()}`);
      } else {
        await reply("Usage:\n/thread register <domain>\n/thread context");
      }
      break;
    }

    case "/project": {
      if (!arg) {
        await reply("Usage: /project <project name>");
        return;
      }
      setActiveProject(chatId, threadId, arg);
      await reply(`Active project set for this thread: ${arg}`);
      break;
    }

    case "/reset": {
      clearHistory(chatId, threadId);
      await reply("Conversation history cleared. Starting fresh.");
      break;
    }

    default: {
      // Route all non-command messages (and unrecognized commands) to Claude AI
      const isCommand = text.startsWith("/");
      const thinkingMsg = isCommand
        ? `Unknown command: ${cmd}\nRouting to AI...\n`
        : "";

      if (thinkingMsg) await reply(thinkingMsg).catch(() => {});

      try {
        const histLen = getHistoryLength(chatId, threadId);
        logSecurity("COMMAND_EXECUTED", "Routing to Claude AI", {
          thread: domain,
          historyTurns: String(histLen),
          chars: String(text.length),
        });

        const aiResponse = await chat(text, chatId, threadId, domain);

        // Telegram has a 4096 char limit per message — split if needed
        if (aiResponse.length <= 4096) {
          await reply(aiResponse);
        } else {
          const chunks = splitMessage(aiResponse, 4000);
          for (const chunk of chunks) {
            await reply(chunk);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await reply(`AI error: ${errMsg}\n\nTip: Use /help to see available commands.`);
      }
      break;
    }
  }
}

/** Split a long message into chunks at paragraph/sentence boundaries */
function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at a paragraph break
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen / 2) {
      // Fall back to newline
      splitAt = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitAt < maxLen / 2) {
      // Fall back to space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt < 0) {
      splitAt = maxLen;
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function formatStatus(domain: string): string {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return [
    "ElderBot Status",
    "---",
    `Uptime: ${hours}h ${minutes}m`,
    `Environment: ${env.NODE_ENV}`,
    `Owner ID: ${env.TELEGRAM_OWNER_CHAT_ID ? "configured" : "NOT SET"}`,
    `Current thread: ${domain}`,
    "",
    `AI Model: ${getCurrentModel()}`,
    "Memory search: online",
    "Heartbeat: running",
    "Cron jobs: 4 scheduled",
  ].join("\n");
}

function formatSecurityStatus(): string {
  return [
    "Security Status",
    "---",
    `Authenticated channel: Telegram (owner ID ${env.TELEGRAM_OWNER_CHAT_ID ? "set" : "NOT SET"})`,
    "Information channels: email, X, web (read-only, never execute)",
    "Security thread: report-only (commands blocked)",
    "Audit log: ~/elderbot/logs/security.log",
    "Prompt injection detection: active",
    "",
    "Core rules:",
    "- Only Telegram from owner = commands",
    "- Security thread = reports only, no execution",
    "- All other input = information only",
    "- All security events logged",
  ].join("\n");
}
