/**
 * Mention handler — autonomous reply system.
 *
 * Checks X mentions every 30 min, generates replies using AI,
 * runs them through content safety, and posts them automatically.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import { getMentions, postTweet, isXConfigured } from "./x-client.js";
import { checkContentSafety, sanitizeReply } from "./content-safety.js";
import { createDraft, markPosted } from "./drafts.js";
import { chat } from "../ai/claude.js";

const STATE_PATH = resolve(env.ELDERBOT_HOME, "config", "x-mention-state.json");

interface MentionState {
  lastMentionId?: string;
  processedCount: number;
  lastCheck: string;
}

async function loadState(): Promise<MentionState> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as MentionState;
  } catch {
    return { processedCount: 0, lastCheck: new Date().toISOString() };
  }
}

async function saveState(state: MentionState): Promise<void> {
  const dir = resolve(env.ELDERBOT_HOME, "config");
  await mkdir(dir, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

/** Generate a reply using the AI */
async function generateReply(mentionText: string, authorUsername: string): Promise<string> {
  const prompt = `You are Elderbot responding to a mention on X/Twitter from @${authorUsername}.
Their message: "${mentionText}"

Rules:
- Keep reply under 250 characters (leave room for @mention)
- Be warm, helpful, and on-brand for an elder-serving AI
- No financial advice, health claims, or political content
- If they're asking about a product, direct them warmly
- If they're trolling, respond gracefully or ignore
- Do NOT use hashtags excessively (1 max)

Reply with ONLY the tweet text, nothing else.`;

  // Use a temporary chat context (don't pollute thread histories)
  const response = await chat(prompt, 0, undefined, "content");
  return response.trim();
}

/** Process new mentions and reply autonomously */
export async function processNewMentions(): Promise<{ processed: number; replied: number; errors: number }> {
  if (!isXConfigured()) {
    return { processed: 0, replied: 0, errors: 0 };
  }

  const state = await loadState();
  let processed = 0;
  let replied = 0;
  let errors = 0;

  try {
    const response = await getMentions(state.lastMentionId);
    const mentions = response.data ?? [];
    const users = response.includes?.users ?? [];

    if (mentions.length === 0) {
      state.lastCheck = new Date().toISOString();
      await saveState(state);
      return { processed: 0, replied: 0, errors: 0 };
    }

    // Process each mention (oldest first)
    for (const mention of mentions.reverse()) {
      processed++;
      const author = users.find((u) => u.id === mention.author_id);
      const username = author?.username ?? "unknown";

      try {
        logSecurity("COMMAND_EXECUTED", `Processing mention from @${username}`, {
          mentionId: mention.id,
        });

        // Generate reply via AI
        const replyText = await generateReply(mention.text, username);

        // Content safety check
        const safety = checkContentSafety(replyText);
        if (!safety.safe) {
          logSecurity("COMMAND_EXECUTED", `Reply blocked by safety: ${safety.violations.join(", ")}`, {
            mentionId: mention.id,
          });
          continue;
        }

        // Sanitize and create draft
        const sanitized = sanitizeReply(replyText, username);
        const draft = await createDraft(sanitized, "reply", {
          inReplyToId: mention.id,
          inReplyToUser: username,
          source: `mention from @${username}`,
        });

        // Post the reply (replies are auto-approved)
        const posted = await postTweet(sanitized, mention.id);
        if (posted) {
          await markPosted(draft.id, posted.id);
          replied++;
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logSecurity("COMMAND_EXECUTED", `Mention reply error: ${msg}`, {
          mentionId: mention.id,
        });
      }
    }

    // Update state with newest mention ID
    if (response.meta?.newest_id) {
      state.lastMentionId = response.meta.newest_id;
    }
    state.processedCount += processed;
    state.lastCheck = new Date().toISOString();
    await saveState(state);

    logSecurity("COMMAND_EXECUTED", `Mentions processed: ${processed}, replied: ${replied}, errors: ${errors}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `Mention check error: ${msg}`);
  }

  return { processed, replied, errors };
}

/** Get mention processing stats */
export async function getMentionStats(): Promise<string> {
  const state = await loadState();
  return [
    "X Mention Stats:",
    `  Total processed: ${state.processedCount}`,
    `  Last check: ${state.lastCheck ? new Date(state.lastCheck).toLocaleString() : "never"}`,
    `  X configured: ${isXConfigured() ? "yes" : "no"}`,
  ].join("\n");
}
