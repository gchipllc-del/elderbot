import { env } from "../config/env.js";
import { logSecurity, logSecurityWarning } from "./audit-log.js";

export type ChannelType = "authenticated" | "information";

export interface AuthResult {
  channelType: ChannelType;
  authorized: boolean;
  source: string;
  chatId: string;
}

/**
 * Core security concept from the ElderBot architecture:
 *
 * AUTHENTICATED channels — only Jesse's Telegram device can issue commands.
 * INFORMATION channels — everything else (email, Twitter, web) is untrusted
 * data, never executed as instructions.
 */
export function authenticateMessage(
  chatId: number | string,
  source: string = "telegram"
): AuthResult {
  const chatIdStr = String(chatId);
  const ownerChatId = env.TELEGRAM_OWNER_CHAT_ID;

  // If owner chat ID isn't configured yet, log and allow (first-run setup)
  if (!ownerChatId || ownerChatId === "your_chat_id_here") {
    logSecurityWarning("AUTH_FAILURE", "TELEGRAM_OWNER_CHAT_ID not configured", {
      receivedChatId: chatIdStr,
      source,
    });
    return {
      channelType: "information",
      authorized: false,
      source,
      chatId: chatIdStr,
    };
  }

  // Only Telegram messages from Jesse's chat ID are authenticated
  if (source === "telegram" && chatIdStr === ownerChatId) {
    logSecurity("AUTH_SUCCESS", `Authenticated command from owner`, {
      chatId: chatIdStr,
    });
    return {
      channelType: "authenticated",
      authorized: true,
      source,
      chatId: chatIdStr,
    };
  }

  // Everything else is information-only
  logSecurityWarning("AUTH_FAILURE", `Unauthorized message rejected`, {
    chatId: chatIdStr,
    source,
    ownerChatId,
  });
  return {
    channelType: "information",
    authorized: false,
    source,
    chatId: chatIdStr,
  };
}

/**
 * Check if a message looks like a prompt injection attempt.
 * Simple heuristic — catches common patterns.
 */
export function detectPromptInjection(text: string): boolean {
  const patterns = [
    /ignore (all |your |previous )?instructions/i,
    /pretend (you are|you're|to be)/i,
    /you are now/i,
    /new instructions:/i,
    /system prompt/i,
    /override (security|rules|permissions)/i,
    /act as (admin|root|owner|jesse)/i,
    /emergency:?\s*(send|transfer|delete|execute)/i,
    /i am (the owner|jesse|admin)/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}
