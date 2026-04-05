/**
 * Elderbot AI conversation handler.
 *
 * Routes free-form messages through OpenRouter (free tier) using:
 * - Meta Llama 3.3 70B as primary model (free, high quality)
 * - CLAUDE.md as the system prompt
 * - Per-thread conversation history
 * - Memory context from daily notes + search
 *
 * When Elderbot earns revenue, can upgrade to Claude API by
 * setting ANTHROPIC_API_KEY and switching the provider.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { search } from "../memory/search.js";
import { getTodaySummary } from "../memory/daily-notes.js";
import { logSecurity } from "../security/audit-log.js";

// --- Model configuration ---

interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
}

// Free models ranked by quality — falls back down the list if one fails
const FREE_MODELS: ModelConfig[] = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", contextWindow: 65536 },
  { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B", contextWindow: 131072 },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 3 405B", contextWindow: 131072 },
  { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder", contextWindow: 262144 },
  { id: "qwen/qwen3.6-plus:free", name: "Qwen 3.6 Plus", contextWindow: 1048576 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 120B", contextWindow: 262144 },
  { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B", contextWindow: 32768 },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B", contextWindow: 131072 },
  { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", contextWindow: 131072 },
  // Ultimate fallback — OpenRouter picks whichever free model is available
  { id: "openrouter/auto", name: "OpenRouter Auto", contextWindow: 32768 },
];

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

// --- Conversation history ---

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const histories = new Map<string, ChatMessage[]>();

let systemPromptCache: string | null = null;

const MAX_HISTORY = 20; // Last 20 turns per thread

function historyKey(chatId: number, threadId?: number): string {
  return threadId ? `${chatId}:${threadId}` : `${chatId}:dm`;
}

// --- System prompt ---

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

// --- Memory context ---

async function buildMemoryContext(userMessage: string): Promise<string> {
  const parts: string[] = [];

  // Today's daily note summary
  try {
    const todaySummary = await getTodaySummary();
    if (todaySummary && !todaySummary.includes("No note found")) {
      parts.push(`## Today's Log\n${todaySummary}`);
    }
  } catch {
    // Non-fatal
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
      // Non-fatal
    }
  }

  return parts.length > 0
    ? `<memory>\n${parts.join("\n\n")}\n</memory>\n\n`
    : "";
}

// --- OpenRouter API call ---

async function callOpenRouter(
  messages: ChatMessage[],
  modelIndex = 0
): Promise<string> {
  const model = FREE_MODELS[modelIndex];
  if (!model) throw new Error("All free models failed. Try again later.");

  const response = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://elderbot.app",
      "X-Title": "Elderbot",
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    logSecurity("COMMAND_EXECUTED", `OpenRouter ${model.name} error: ${response.status}`, {
      body: errBody.substring(0, 200),
    });

    // If this model failed (rate limit or other), try the next one
    if (modelIndex < FREE_MODELS.length - 1) {
      const nextModel = FREE_MODELS[modelIndex + 1];
      logSecurity("COMMAND_EXECUTED", `Falling back to ${nextModel.name}`);
      // Brief pause on 429 to avoid hammering
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 500));
      }
      return callOpenRouter(messages, modelIndex + 1);
    }

    throw new Error(`All models busy — try again in a minute.`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    // Model-specific error — try fallback
    if (modelIndex < FREE_MODELS.length - 1) {
      logSecurity("COMMAND_EXECUTED", `${model.name} returned error, falling back`, {
        error: data.error.message ?? "unknown",
      });
      return callOpenRouter(messages, modelIndex + 1);
    }
    throw new Error(data.error.message ?? "Unknown OpenRouter error");
  }

  const assistantText = data.choices?.[0]?.message?.content;
  if (!assistantText) {
    throw new Error("Empty response from OpenRouter");
  }

  logSecurity("COMMAND_EXECUTED", `Response from ${model.name}`, {
    chars: String(assistantText.length),
  });

  return assistantText;
}

// --- Public API ---

/**
 * Send a free-form message and return the AI response.
 * Maintains per-thread conversation history.
 */
export async function chat(
  userMessage: string,
  chatId: number,
  threadId?: number,
  domain?: string
): Promise<string> {
  const key = historyKey(chatId, threadId);
  const history = histories.get(key) ?? [];

  // Build memory context
  const memoryContext = await buildMemoryContext(userMessage);

  // Compose user turn with memory context
  const userContent = memoryContext
    ? `${memoryContext}${userMessage}`
    : userMessage;

  // Add user message to history
  history.push({ role: "user", content: userContent });

  // Trim history (keep pairs)
  while (history.length > MAX_HISTORY) {
    history.splice(0, 2);
  }

  histories.set(key, history);

  // Load system prompt
  const systemPrompt = await loadSystemPrompt();
  const threadContext = domain && domain !== "dm"
    ? `\n\nYou are currently operating in the [${domain}] thread. Tailor your responses to that domain's focus.`
    : "";

  // Build full message array with system prompt
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt + threadContext },
    ...history,
  ];

  try {
    logSecurity("COMMAND_EXECUTED", "Sending message to OpenRouter", {
      thread: domain ?? "dm",
      chars: String(userMessage.length),
      model: FREE_MODELS[0].name,
    });

    const assistantText = await callOpenRouter(messages);

    // Save assistant response to history
    history.push({ role: "assistant", content: assistantText });
    histories.set(key, history);

    return assistantText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `AI error: ${msg}`);

    // Remove failed user turn
    history.pop();
    histories.set(key, history);

    throw new Error(`AI error: ${msg}`);
  }
}

/** Clear conversation history for a thread */
export function clearHistory(chatId: number, threadId?: number): void {
  const key = historyKey(chatId, threadId);
  histories.delete(key);
}

/** Get conversation history length for a thread */
export function getHistoryLength(chatId: number, threadId?: number): number {
  const key = historyKey(chatId, threadId);
  return histories.get(key)?.length ?? 0;
}

/** Get current model info */
export function getCurrentModel(): string {
  return `${FREE_MODELS[0].name} (via OpenRouter free tier)`;
}
