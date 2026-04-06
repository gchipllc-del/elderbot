/**
 * Family notification system.
 *
 * Alerts designated family contacts when:
 * - Scam attempts detected
 * - Transactions over threshold
 * - Unusual activity patterns
 *
 * Opt-in only. Elder controls who gets notified.
 */

import TelegramBot from "node-telegram-bot-api";
import { logSecurity } from "../security/audit-log.js";
import { sendEmail } from "../email/gmail-client.js";
import type { ElderProfile, FamilyContact, ScamDetection } from "./types.js";

/** Send a scam alert to all family contacts */
export async function alertFamilyScam(
  bot: TelegramBot,
  elder: ElderProfile,
  detection: ScamDetection
): Promise<void> {
  for (const contact of elder.familyContacts) {
    if (!contact.notifyOnScamAttempts) continue;

    const message = [
      `Elderbot Safety Alert for ${elder.name}`,
      "---",
      `A potential ${detection.type} scam was detected.`,
      `Severity: ${detection.severity.toUpperCase()}`,
      ``,
      detection.description,
      ``,
      detection.blocked ? "This was automatically blocked." : "Please check in with them.",
      ``,
      `— Elderbot (automated safety alert)`,
    ].join("\n");

    // Try Telegram first
    if (contact.telegramChatId) {
      try {
        await bot.sendMessage(contact.telegramChatId, message);
        detection.alertedFamily = true;
        logSecurity("COMMAND_EXECUTED", `Family alert sent via Telegram to ${contact.name}`);
        continue;
      } catch {
        // Fall through to email
      }
    }

    // Fall back to email
    if (contact.email) {
      const sent = await sendEmail(
        contact.email,
        `Elderbot Safety Alert: ${detection.type} detected for ${elder.name}`,
        message
      );
      if (sent) {
        detection.alertedFamily = true;
        logSecurity("COMMAND_EXECUTED", `Family alert sent via email to ${contact.name}`);
      }
    }
  }
}

/** Send a transaction alert to family contacts */
export async function alertFamilyTransaction(
  bot: TelegramBot,
  elder: ElderProfile,
  productName: string,
  amount: number
): Promise<void> {
  if (amount <= elder.spendingLimits.familyNotifyAboveUsd) return;

  for (const contact of elder.familyContacts) {
    if (!contact.notifyOnTransactions) continue;

    const message = [
      `Elderbot Transaction Notice for ${elder.name}`,
      "---",
      `Product: ${productName}`,
      `Amount: $${amount.toFixed(2)}`,
      `Time: ${new Date().toLocaleString()}`,
      ``,
      `This is an informational notice. No action needed.`,
      `— Elderbot`,
    ].join("\n");

    if (contact.telegramChatId) {
      try {
        await bot.sendMessage(contact.telegramChatId, message);
        continue;
      } catch {
        // Fall through
      }
    }

    if (contact.email) {
      await sendEmail(
        contact.email,
        `Elderbot: ${elder.name} made a purchase ($${amount.toFixed(2)})`,
        message
      );
    }
  }
}

/** Send weekly activity summary to family */
export async function sendWeeklyFamilySummary(
  bot: TelegramBot,
  elder: ElderProfile,
  summary: string
): Promise<void> {
  for (const contact of elder.familyContacts) {
    if (!contact.notifyOnTransactions) continue;

    const message = [
      `Weekly Summary for ${elder.name}`,
      "---",
      summary,
      ``,
      `— Elderbot`,
    ].join("\n");

    if (contact.telegramChatId) {
      try {
        await bot.sendMessage(contact.telegramChatId, message);
        continue;
      } catch {
        // Fall through
      }
    }

    if (contact.email) {
      await sendEmail(contact.email, `Elderbot Weekly Summary: ${elder.name}`, message);
    }
  }
}
