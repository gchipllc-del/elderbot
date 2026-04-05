/**
 * Thread Context — tracks per-thread state and provides
 * context isolation between concurrent conversations.
 *
 * Each thread gets its own:
 * - Active project reference
 * - Recent command history
 * - Context window (last N messages)
 */

import { ThreadDomain } from "./registry.js";

export interface ThreadContext {
  domain: ThreadDomain;
  chatId: number;
  threadId?: number;
  activeProject?: string;
  lastActivity: Date;
  messageCount: number;
}

// In-memory context store — keyed by "chatId:threadId" or "chatId:dm"
const contextStore = new Map<string, ThreadContext>();

function contextKey(chatId: number, threadId?: number): string {
  return threadId ? `${chatId}:${threadId}` : `${chatId}:dm`;
}

/** Get or create context for a thread */
export function getContext(
  chatId: number,
  domain: ThreadDomain,
  threadId?: number
): ThreadContext {
  const key = contextKey(chatId, threadId);
  let ctx = contextStore.get(key);

  if (!ctx) {
    ctx = {
      domain,
      chatId,
      threadId,
      lastActivity: new Date(),
      messageCount: 0,
    };
    contextStore.set(key, ctx);
  }

  ctx.lastActivity = new Date();
  ctx.messageCount++;
  return ctx;
}

/** Update active project for a thread */
export function setActiveProject(
  chatId: number,
  threadId: number | undefined,
  project: string
): void {
  const key = contextKey(chatId, threadId);
  const ctx = contextStore.get(key);
  if (ctx) ctx.activeProject = project;
}

/** Get all active thread contexts */
export function getAllContexts(): ThreadContext[] {
  return Array.from(contextStore.values());
}

/** Format context summary for /threads command */
export function formatContextSummary(): string {
  const contexts = getAllContexts();
  if (contexts.length === 0) return "No active thread contexts.";

  return contexts
    .map((c) => {
      const ago = Math.round(
        (Date.now() - c.lastActivity.getTime()) / 60000
      );
      const project = c.activeProject ? ` | Project: ${c.activeProject}` : "";
      return `• [${c.domain}] ${c.messageCount} msgs, last active ${ago}m ago${project}`;
    })
    .join("\n");
}
