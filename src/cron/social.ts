/**
 * Social media cron handlers.
 *
 * - Mention check: every 30 min, 8am-10pm
 * - Content mining: once daily at 6 PM (drafts for Jesse to review)
 * - Draft expiry: hourly (expire unapproved drafts after 2 hours)
 */

import TelegramBot from "node-telegram-bot-api";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import { processNewMentions } from "../social/mentions.js";
import { mineContent } from "../social/content-miner.js";
import { expireOldDrafts, getPendingDrafts, formatDraftList } from "../social/drafts.js";
import { isXConfigured } from "../social/x-client.js";

/** Check mentions and reply (every 30 min) */
export async function checkMentions(bot: TelegramBot): Promise<void> {
  if (!isXConfigured()) return;

  logSecurity("COMMAND_EXECUTED", "Checking X mentions");

  const result = await processNewMentions();

  // Notify Jesse if there were replies
  if (result.replied > 0) {
    const chatId = env.TELEGRAM_OWNER_CHAT_ID;
    if (chatId) {
      await bot.sendMessage(
        chatId,
        `X Activity: Replied to ${result.replied} mention(s). ${result.errors > 0 ? `(${result.errors} errors)` : ""}`
      ).catch(() => {});
    }
  }
}

/** Mine content and send drafts for approval (daily at 6 PM) */
export async function runContentMiner(bot: TelegramBot): Promise<void> {
  if (!isXConfigured()) return;

  logSecurity("COMMAND_EXECUTED", "Running content miner");

  const draftIds = await mineContent();

  if (draftIds.length > 0) {
    // Send pending drafts to Jesse for approval
    const pending = await getPendingDrafts();
    const chatId = env.TELEGRAM_OWNER_CHAT_ID;

    if (chatId && pending.length > 0) {
      const message = [
        "Tweet Drafts for Approval:",
        "---",
        formatDraftList(pending),
        "",
        "Approve: /tweet approve <draft-id>",
        "Reject: /tweet reject <draft-id>",
        "Drafts expire in 2 hours if not approved.",
      ].join("\n");

      await bot.sendMessage(chatId, message).catch(() => {});
    }
  }
}

/** Expire old drafts (hourly) */
export async function runDraftExpiry(): Promise<void> {
  await expireOldDrafts();
}
