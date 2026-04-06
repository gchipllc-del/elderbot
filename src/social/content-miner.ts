/**
 * Content miner — generates tweet ideas from recent activity.
 *
 * Reviews daily notes and conversations for interesting topics,
 * then drafts tweets for Jesse's approval. Runs as a cron job.
 *
 * Exclusions: security incidents, financial data, personal details,
 * SOC/work topics (enforced by content safety checker).
 */

import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import { getTodaySummary } from "../memory/daily-notes.js";
import { chat } from "../ai/claude.js";
import { createDraft, getPendingDrafts } from "./drafts.js";
import { checkContentSafety } from "./content-safety.js";

/** Mine today's activity for tweet-worthy content */
export async function mineContent(): Promise<string[]> {
  // Don't pile up drafts — check if there are already pending ones
  const pending = await getPendingDrafts();
  if (pending.length >= 3) {
    logSecurity("COMMAND_EXECUTED", "Content mining skipped — 3+ pending drafts already");
    return [];
  }

  // Get today's context
  let context = "";
  try {
    const todaySummary = await getTodaySummary();
    if (todaySummary && !todaySummary.includes("No note found")) {
      context = todaySummary;
    }
  } catch {
    // No daily note — that's fine
  }

  if (!context) {
    return [];
  }

  const prompt = `You are Elderbot's content strategist. Based on today's activity, draft 1-2 tweet ideas for the @ElderBotAI X account.

Today's activity:
${context}

Rules:
- Each tweet must be under 280 characters
- Focus on: tech tips for elders, product updates, elder empowerment, AI for good
- Tone: warm, helpful, accessible — like explaining tech to your grandparent
- NEVER mention: security incidents, financial data, personal details, work/SOC topics
- Include a call to action or conversation starter when natural
- No excessive hashtags (0-1 per tweet)

Format: Output each tweet on its own line, prefixed with "TWEET:" and nothing else.
Example:
TWEET: Did you know your iPhone can read text out loud? Just select any text and tap "Speak." Game-changer for anyone with tired eyes.
TWEET: We just shipped a new guide on staying safe from phone scams. Simple tips, no tech jargon. Link in bio.`;

  try {
    const response = await chat(prompt, 0, undefined, "content");

    // Parse tweet lines
    const tweets = response
      .split("\n")
      .filter((line) => line.startsWith("TWEET:"))
      .map((line) => line.replace(/^TWEET:\s*/, "").trim())
      .filter((t) => t.length > 0 && t.length <= 280);

    const created: string[] = [];

    for (const tweetContent of tweets) {
      // Content safety check
      const safety = checkContentSafety(tweetContent);
      if (!safety.safe) {
        logSecurity("COMMAND_EXECUTED", `Mined tweet blocked: ${safety.violations.join(", ")}`);
        continue;
      }

      const draft = await createDraft(tweetContent, "original", {
        source: "content-miner",
      });
      created.push(draft.id);
    }

    logSecurity("COMMAND_EXECUTED", `Content miner created ${created.length} draft(s)`);
    return created;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSecurity("COMMAND_EXECUTED", `Content mining error: ${msg}`);
    return [];
  }
}
