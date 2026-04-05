/**
 * Claude AI conversation handler.
 *
 * Handles free-form messages using claude-opus-4-6 with:
 * - CLAUDE.md as the cached system prompt
 * - Per-thread conversation history
 * - Memory context from recent notes + search
 * - Adaptive thinking for complex queries
 * - Streaming responses sent to Telegram
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { search } from "../memory/search.js";
import { getTodaySummary } from "../memory/daily-notes.js";
import { logSecurity } from "../security/audit-log.js";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Conversation history per thread — keyed by "chatId:threadId" or "chatId:dm"
type MessageParam = Anthropic.Messages.MessageParam;
const histories = new Map<string, MessageParam[]>();

// Cache CLAUDE.md in memory after first load
let systemPromptCache: string | null = null;

const MAX_HISTORY = 20; // Keep last 20 turns per thread

function historyKey(chatId: number, threadId?: number): string {
  return threadId ? `${chatId}:${threadId}` : `${chatId}:dm`;
}

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache) return systemPromptCache;

  try {
    const claudeMdPath = resolve(env.ELDERBOT_HOME, "CLAUDE.md");
    systemPromptCache = await readFile(claudeMdPath, "utf8");
    logSecurity("COMMAND_EXECUTED", "CLAUDE.md loaded as system prompt", {
      bytes: String(systemPromptCache.length),
    });
  } catch {
    systemPromptCache = `You are Elderbot, an autonomous AI agent built by Jesse to serve elders (55+) and their families. You are direct, warm, security-conscious, and proactive. Jesse is your only authenticated command source via Telegram.`;
  }

  return systemPromptCache;
}

/** Build a memory context block from today's notes + search results */
async function buildMemoryContext(userMessage: string): Promise<string> {
  const parts: string[] = [];

  // Today's daily note summary
  try {
    const todaySummary = await getTodaySummary();
    if (todaySummary && !todaySummary.includes("No note found")) {
      parts.push(`## Today's Log\n${todaySummary}`);
    }
  } catch {
    // Non-fatal — skip
  }

  // Relevant memory search (only if message is substantive)
  if (userMessage.length > 10) {
    try {
      const results = await search(userMessage, 3);
      if (results.length > 0) {
        const snippets = results
          .map((r) => {
            const contextLines = r.matches
              .slice(0, 2)
              .map((m) => m.text)
              .join("\n");
            return `### ${r.file}\n${contextLines}`;
          })
          .join("\n\n");
        parts.push(`## Relevant Memory\n${snippets}`);
      }
    } catch {
      // Non-fatal — skip
    }
  }

  return parts.length > 0
    ? `<memory>\n${parts.join("\n\n")}\n</memory>\n\n`
    : "";
}

/**
 * Send a free-form message to Claude and return the response text.
 * Maintains per-thread conversation history.
 */
export async function chat(
  userMessage: string,
  chatId: number,
  threadId?: number,
  domain?: string
): Promise<string> {
  const key = historyKey(chatId, threadId);

  // Load conversation history
  const history = histories.get(key) ?? [];

  // Build memory context
  const memoryContext = await buildMemoryContext(userMessage);

  // Compose the user turn (with memory prepended if available)
  const userContent = memoryContext
    ? `${memoryContext}${userMessage}`
    : userMessage;

  // Add to history
  history.push({ role: "user", content: userContent });

  // Trim history to max length (keep pairs)
  while (history.length > MAX_HISTORY) {
    history.splice(0, 2);
  }

  histories.set(key, history);

  // Load system prompt (cached after first call)
  const systemPrompt = await loadSystemPrompt();

  // Thread context suffix
  const threadContext = domain && domain !== "dm"
    ? `\n\nYou are currently operating in the [${domain}] thread. Tailor your responses to that domain's focus.`
    : "";

  try {
    logSecurity("COMMAND_EXECUTED", "Sending message to Claude API", {
      thread: domain ?? "dm",
      chars: String(userMessage.length),
    });

    // Use streaming to avoid timeout on long responses
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: systemPrompt + threadContext,
          // Prompt caching — CLAUDE.md rarely changes
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: history,
    });

    const response = await stream.finalMessage();

    // Extract text from response content
    let assistantText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        assistantText += block.text;
      }
    }

    if (!assistantText) {
      assistantText = "(No response generated)";
    }

    // Append assistant response to history
    history.push({ role: "assistant", content: assistantText });
    histories.set(key, history);

    logSecurity("COMMAND_EXECUTED", "Claude API response received", {
      thread: domain ?? "dm",
      responseChars: String(assistantText.length),
    });

    return assistantText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `Claude API error: ${msg}`);

    // Remove the failed user turn from history so it doesn't corrupt state
    history.pop();
    histories.set(key, history);

    throw new Error(`Claude API error: ${msg}`);
  }
}

/** Clear conversation history for a thread (useful for /reset or new sessions) */
export function clearHistory(chatId: number, threadId?: number): void {
  const key = historyKey(chatId, threadId);
  histories.delete(key);
}

/** Get conversation history length for a thread */
export function getHistoryLength(chatId: number, threadId?: number): number {
  const key = historyKey(chatId, threadId);
  return histories.get(key)?.length ?? 0;
}
