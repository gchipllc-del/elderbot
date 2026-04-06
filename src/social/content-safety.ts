/**
 * Content safety checker for social media posts.
 *
 * Enforces CLAUDE.md rules: no financial advice, no health claims,
 * no political content, no personal info, no secrets.
 */

import { NEVER_TWEET_TOPICS, type ContentRule } from "./types.js";
import { logSecurity } from "../security/audit-log.js";

interface SafetyCheck {
  safe: boolean;
  violations: string[];
}

/** Check if tweet content is safe to post */
export function checkContentSafety(content: string): SafetyCheck {
  const violations: string[] = [];

  for (const rule of NEVER_TWEET_TOPICS) {
    if (rule.pattern.test(content)) {
      violations.push(rule.description);
    }
  }

  // Length check (280 chars for X)
  if (content.length > 280) {
    violations.push(`Too long (${content.length}/280 chars)`);
  }

  // Empty check
  if (content.trim().length === 0) {
    violations.push("Empty content");
  }

  if (violations.length > 0) {
    logSecurity("COMMAND_EXECUTED", "Content safety violation detected", {
      violations: violations.join(", "),
      contentPreview: content.substring(0, 50),
    });
  }

  return { safe: violations.length === 0, violations };
}

/** Sanitize reply content — strip mentions, trim, enforce limits */
export function sanitizeReply(content: string, replyToUser: string): string {
  // Ensure reply starts with the @mention
  let reply = content;
  if (!reply.startsWith(`@${replyToUser}`)) {
    reply = `@${replyToUser} ${reply}`;
  }

  // Trim to 280 chars
  if (reply.length > 280) {
    reply = reply.substring(0, 277) + "...";
  }

  return reply;
}
