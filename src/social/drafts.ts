/**
 * Tweet draft management.
 *
 * Stores pending tweet drafts for approval workflow.
 * Original tweets require Jesse's approval before posting.
 * Replies can be posted autonomously (after safety check).
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { TweetDraft } from "./types.js";

const DRAFTS_PATH = resolve(env.ELDERBOT_HOME, "config", "tweet-drafts.json");

let cache: TweetDraft[] | null = null;

async function load(): Promise<TweetDraft[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(DRAFTS_PATH, "utf8");
    cache = JSON.parse(raw) as TweetDraft[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(drafts: TweetDraft[]): Promise<void> {
  const dir = resolve(env.ELDERBOT_HOME, "config");
  await mkdir(dir, { recursive: true });
  await writeFile(DRAFTS_PATH, JSON.stringify(drafts, null, 2), "utf8");
  cache = drafts;
}

/** Create a new tweet draft */
export async function createDraft(
  content: string,
  type: "original" | "reply",
  options?: {
    inReplyToId?: string;
    inReplyToUser?: string;
    source?: string;
  }
): Promise<TweetDraft> {
  const drafts = await load();

  const now = new Date();
  const expiresAt = type === "original"
    ? new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString() // 2 hours
    : undefined;

  const draft: TweetDraft = {
    id: `draft-${Date.now()}`,
    content,
    type,
    status: type === "reply" ? "approved" : "pending", // replies auto-approved
    inReplyToId: options?.inReplyToId,
    inReplyToUser: options?.inReplyToUser,
    source: options?.source,
    createdAt: now.toISOString(),
    expiresAt,
  };

  drafts.push(draft);
  await save(drafts);

  logSecurity("COMMAND_EXECUTED", `Tweet draft created: ${type}`, {
    draftId: draft.id,
    chars: String(content.length),
  });

  return draft;
}

/** Approve a draft for posting */
export async function approveDraft(draftId: string): Promise<TweetDraft | null> {
  const drafts = await load();
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft || draft.status !== "pending") return null;

  draft.status = "approved";
  await save(drafts);

  logSecurity("COMMAND_EXECUTED", "Tweet draft approved", { draftId });
  return draft;
}

/** Reject a draft */
export async function rejectDraft(draftId: string): Promise<TweetDraft | null> {
  const drafts = await load();
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft || draft.status !== "pending") return null;

  draft.status = "rejected";
  await save(drafts);

  logSecurity("COMMAND_EXECUTED", "Tweet draft rejected", { draftId });
  return draft;
}

/** Mark a draft as posted */
export async function markPosted(draftId: string, tweetId: string): Promise<void> {
  const drafts = await load();
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) return;

  draft.status = "posted";
  draft.postedAt = new Date().toISOString();
  draft.tweetId = tweetId;
  await save(drafts);
}

/** Expire old pending drafts (called by cron) */
export async function expireOldDrafts(): Promise<number> {
  const drafts = await load();
  const now = new Date().toISOString();
  let count = 0;

  for (const draft of drafts) {
    if (draft.status === "pending" && draft.expiresAt && draft.expiresAt < now) {
      draft.status = "expired";
      count++;
    }
  }

  if (count > 0) {
    await save(drafts);
    logSecurity("COMMAND_EXECUTED", `${count} tweet draft(s) expired`);
  }

  return count;
}

/** Get all pending drafts (awaiting Jesse's approval) */
export async function getPendingDrafts(): Promise<TweetDraft[]> {
  const drafts = await load();
  return drafts.filter((d) => d.status === "pending");
}

/** Get approved but not yet posted drafts */
export async function getApprovedDrafts(): Promise<TweetDraft[]> {
  const drafts = await load();
  return drafts.filter((d) => d.status === "approved" && !d.postedAt);
}

/** Get recent drafts for display */
export async function getRecentDrafts(limit = 10): Promise<TweetDraft[]> {
  const drafts = await load();
  return drafts.slice(-limit);
}

/** Format drafts for Telegram display */
export function formatDraftList(drafts: TweetDraft[]): string {
  if (drafts.length === 0) return "No tweet drafts.";

  return drafts
    .map((d) => {
      const statusIcon = {
        pending: "?",
        approved: "+",
        rejected: "x",
        posted: ">>",
        expired: "~",
      }[d.status];

      return `[${statusIcon}] ${d.type.toUpperCase()} — ${d.status}\n  "${d.content.substring(0, 80)}${d.content.length > 80 ? "..." : ""}"\n  ID: ${d.id}`;
    })
    .join("\n\n");
}
