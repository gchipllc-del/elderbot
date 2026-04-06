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
import {
  createProduct,
  listProducts,
  archiveProduct,
  getProduct,
  formatProductList,
} from "../products/store.js";
import { createSquareCheckout, isSquareConfigured } from "../payments/square.js";
import { createCoinbaseCharge, isCoinbaseConfigured } from "../payments/coinbase.js";
import { checkSpendingLimit } from "../payments/guardrails.js";
import { generateDailyReport, generateRevenueSummary } from "../payments/reporting.js";
import { isXConfigured, postTweet } from "../social/x-client.js";
import {
  approveDraft,
  rejectDraft,
  getPendingDrafts,
  getRecentDrafts,
  formatDraftList,
  markPosted,
} from "../social/drafts.js";
import { checkContentSafety } from "../social/content-safety.js";
import { getMentionStats } from "../social/mentions.js";

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
        "Business:",
        "/product create <name> | <price> | <desc> — create a product",
        "/product list — list all products",
        "/product archive <id> — archive a product",
        "/checkout <product-id> — generate payment links",
        "/sales — today's sales report",
        "/revenue — full revenue dashboard",
        "",
        "Social:",
        "/tweet draft <text> — draft an original tweet",
        "/tweet approve <id> — approve a draft for posting",
        "/tweet reject <id> — reject a draft",
        "/tweet pending — view pending drafts",
        "/tweet recent — view recent drafts",
        "/tweet stats — X mention stats",
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

    // ---- Social Commands ----

    case "/tweet": {
      const [subCmd, ...rest] = args;
      const tweetArg = rest.join(" ");

      if (subCmd === "draft") {
        if (!tweetArg) {
          await reply("Usage: /tweet draft <your tweet text>");
          break;
        }
        if (tweetArg.length > 280) {
          await reply(`Tweet too long (${tweetArg.length}/280). Shorten it.`);
          break;
        }
        const safety = checkContentSafety(tweetArg);
        if (!safety.safe) {
          await reply(`Content blocked:\n${safety.violations.map((v) => `- ${v}`).join("\n")}`);
          break;
        }
        const { createDraft: makeDraft } = await import("../social/drafts.js");
        const draft = await makeDraft(tweetArg, "original", { source: "manual" });
        await reply(`Tweet drafted (pending approval):\n"${tweetArg}"\n\nID: ${draft.id}\nApprove: /tweet approve ${draft.id}`);
      } else if (subCmd === "approve") {
        const draftId = rest[0];
        if (!draftId) {
          await reply("Usage: /tweet approve <draft-id>");
          break;
        }
        const draft = await approveDraft(draftId);
        if (!draft) {
          await reply(`Draft not found or not pending: ${draftId}`);
          break;
        }
        // Post immediately upon approval
        if (isXConfigured()) {
          try {
            const posted = await postTweet(draft.content, draft.inReplyToId);
            if (posted) {
              await markPosted(draft.id, posted.id);
              await reply(`Tweet posted!\n"${draft.content}"\n\nTweet ID: ${posted.id}`);
            } else {
              await reply("Approved but post failed. Will retry on next cron cycle.");
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await reply(`Approved but post error: ${msg}`);
          }
        } else {
          await reply(`Draft approved: "${draft.content}"\n\nX not configured yet — will post when API keys are set.`);
        }
      } else if (subCmd === "reject") {
        const draftId = rest[0];
        if (!draftId) {
          await reply("Usage: /tweet reject <draft-id>");
          break;
        }
        const draft = await rejectDraft(draftId);
        await reply(draft ? `Draft rejected: ${draftId}` : `Draft not found or not pending: ${draftId}`);
      } else if (subCmd === "pending") {
        const pending = await getPendingDrafts();
        await reply(formatDraftList(pending));
      } else if (subCmd === "recent") {
        const recent = await getRecentDrafts(10);
        await reply(formatDraftList(recent));
      } else if (subCmd === "stats") {
        const stats = await getMentionStats();
        await reply(stats);
      } else {
        await reply("Usage: /tweet draft|approve|reject|pending|recent|stats");
      }
      break;
    }

    // ---- Business Commands ----

    case "/product": {
      const [subCmd, ...rest] = args;

      if (subCmd === "create") {
        // Format: /product create Name | Price | Description
        const parts = rest.join(" ").split("|").map((s) => s.trim());
        if (parts.length < 2) {
          await reply("Usage: /product create Name | Price | Description\nExample: /product create Elder Tech Guide | 9.99 | Simple tech guide for seniors");
          break;
        }
        const [name, priceStr, ...descParts] = parts;
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          await reply("Price must be a positive number.");
          break;
        }
        const description = descParts.join(" | ") || `${name} by Elderbot`;
        const product = await createProduct(name, price, description);
        await reply(`Product created!\n\nName: ${product.name}\nPrice: $${product.priceUsd.toFixed(2)}\nID: ${product.id}\n\nGenerate payment links with: /checkout ${product.id}`);
      } else if (subCmd === "list") {
        const products = await listProducts(arg.includes("all"));
        await reply(formatProductList(products));
      } else if (subCmd === "archive") {
        const productId = rest[0];
        if (!productId) {
          await reply("Usage: /product archive <product-id>");
          break;
        }
        const success = await archiveProduct(productId);
        await reply(success ? `Product ${productId} archived.` : `Product not found: ${productId}`);
      } else {
        await reply("Usage: /product create|list|archive");
      }
      break;
    }

    case "/checkout": {
      const productId = args[0];
      const forceProvider = args[1]; // optional: "square" or "crypto"

      if (!productId) {
        await reply("Usage: /checkout <product-id> [square|crypto]");
        break;
      }

      const product = await getProduct(productId);
      if (!product) {
        await reply(`Product not found: ${productId}\nUse /product list to see available products.`);
        break;
      }

      // Guardrail check
      const check = await checkSpendingLimit(product.priceUsd);
      if (!check.allowed) {
        await reply(`BLOCKED by financial guardrails:\n${check.reason}`);
        break;
      }
      if (check.requiresApproval) {
        await reply(`This transaction requires your approval:\n${check.reason}\n\nReply /checkout ${productId} to confirm.`);
        break;
      }

      const links: string[] = [`Payment Links for: ${product.name} ($${product.priceUsd.toFixed(2)})`, "---"];

      // Square checkout (card)
      if ((!forceProvider || forceProvider === "square") && isSquareConfigured()) {
        try {
          const sq = await createSquareCheckout(product);
          links.push(`Card Payment: ${sq.checkoutUrl}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          links.push(`Card: Error — ${msg}`);
        }
      } else if (!forceProvider || forceProvider === "square") {
        links.push("Card: Square not configured (add SQUARE_ACCESS_TOKEN)");
      }

      // Coinbase checkout (crypto)
      if ((!forceProvider || forceProvider === "crypto") && isCoinbaseConfigured()) {
        try {
          const cb = await createCoinbaseCharge(product);
          links.push(`Crypto Payment: ${cb.checkoutUrl}`);
          if (cb.expiresAt) links.push(`  Expires: ${new Date(cb.expiresAt).toLocaleString()}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          links.push(`Crypto: Error — ${msg}`);
        }
      } else if (!forceProvider || forceProvider === "crypto") {
        links.push("Crypto: Coinbase not configured (add COINBASE_COMMERCE_API_KEY)");
      }

      await reply(links.join("\n"));
      break;
    }

    case "/sales": {
      const date = args[0]; // optional YYYY-MM-DD
      const report = await generateDailyReport(date);
      await reply(report);
      break;
    }

    case "/revenue": {
      const summary = await generateRevenueSummary();
      await reply(summary);
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
    `Square: ${isSquareConfigured() ? "Connected" : "Not configured"}`,
    `Coinbase: ${isCoinbaseConfigured() ? "Connected" : "Not configured"}`,
    `X/Twitter: ${isXConfigured() ? "Connected" : "Not configured"}`,
    "Memory search: online",
    "Heartbeat: running",
    "Cron jobs: 8 scheduled",
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
