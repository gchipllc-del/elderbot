/**
 * Thread Registry — maps Telegram group threads to domains.
 *
 * Each topic thread in the Telegram group gets an independent context.
 * The bot routes commands based on which thread the message came from.
 *
 * Thread domains:
 *   general        — full execute permissions, quick fixes, general commands
 *   business       — business operations, revenue, products
 *   webdev         — web development, deployments, code
 *   content        — marketing, tweets, content strategy
 *   security       — REPORT ONLY — bot reports here, never executes from here
 *
 * How to set up in Telegram:
 *   1. Create a group, add ElderBot
 *   2. BotFather → /mybots → ElderBot → Group Privacy → Turn OFF
 *   3. Enable Topics in group settings
 *   4. Create topics: General, Business Ops, Web Dev, Content, Security
 *   5. Send a message in each topic — bot will detect and register the thread ID
 *   6. Or manually set IDs via /thread register <domain> <thread_id>
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";

export type ThreadDomain =
  | "general"
  | "business"
  | "webdev"
  | "content"
  | "security"
  | "dm";        // Direct message — always has full permissions

export interface ThreadConfig {
  domain: ThreadDomain;
  name: string;
  description: string;
  executePermissions: boolean; // false = report-only (security thread)
  threadId?: number;           // Telegram message_thread_id (set after registration)
  groupChatId?: number;        // The group chat this thread belongs to
}

const THREAD_CONFIG_PATH = resolve(
  env.ELDERBOT_HOME,
  "config",
  "threads.json"
);

// Default thread definitions — IDs are filled in after Telegram setup
const DEFAULT_THREADS: ThreadConfig[] = [
  {
    domain: "general",
    name: "General",
    description: "Quick fixes, general commands, full permissions",
    executePermissions: true,
  },
  {
    domain: "business",
    name: "Business Ops",
    description: "Revenue, products, business operations",
    executePermissions: true,
  },
  {
    domain: "webdev",
    name: "Web Dev",
    description: "Code, deployments, technical work",
    executePermissions: true,
  },
  {
    domain: "content",
    name: "Content & Marketing",
    description: "Tweets, content strategy, marketing",
    executePermissions: true,
  },
  {
    domain: "security",
    name: "Security & Monitoring",
    description: "Reports only — bot reports here, never executes commands from here",
    executePermissions: false,
  },
];

let cachedThreads: ThreadConfig[] | null = null;

/** Load thread configs from disk (or return defaults) */
export async function loadThreads(): Promise<ThreadConfig[]> {
  if (cachedThreads) return cachedThreads;

  try {
    const content = await readFile(THREAD_CONFIG_PATH, "utf8");
    cachedThreads = JSON.parse(content);
    return cachedThreads!;
  } catch {
    cachedThreads = DEFAULT_THREADS;
    return cachedThreads;
  }
}

/** Save thread configs to disk */
export async function saveThreads(threads: ThreadConfig[]): Promise<void> {
  cachedThreads = threads;
  await writeFile(THREAD_CONFIG_PATH, JSON.stringify(threads, null, 2), "utf8");
}

/** Register a Telegram thread ID to a domain */
export async function registerThread(
  domain: ThreadDomain,
  threadId: number,
  groupChatId: number
): Promise<ThreadConfig | null> {
  const threads = await loadThreads();
  const thread = threads.find((t) => t.domain === domain);
  if (!thread) return null;

  thread.threadId = threadId;
  thread.groupChatId = groupChatId;
  await saveThreads(threads);
  return thread;
}

/** Detect which domain a message belongs to */
export async function detectDomain(
  chatId: number,
  threadId?: number,
  isGroup?: boolean
): Promise<ThreadConfig> {
  // DM = always general with full permissions
  if (!isGroup) {
    return {
      domain: "dm",
      name: "Direct Message",
      description: "Private DM with owner",
      executePermissions: true,
    };
  }

  if (threadId) {
    const threads = await loadThreads();
    const match = threads.find(
      (t) => t.threadId === threadId && t.groupChatId === chatId
    );
    if (match) return match;
  }

  // Unregistered thread — default to general with execute permissions
  return {
    domain: "general",
    name: "Unregistered Thread",
    description: "Thread not yet registered — treating as general",
    executePermissions: true,
  };
}

/** Format thread list for /threads command */
export async function formatThreadList(): Promise<string> {
  const threads = await loadThreads();
  const lines = ["Thread Registry", "---"];

  for (const t of threads) {
    const status = t.threadId ? `ID: ${t.threadId}` : "not registered";
    const perms = t.executePermissions ? "execute" : "report-only";
    lines.push(`• ${t.name} [${perms}]`);
    lines.push(`  ${t.description}`);
    lines.push(`  ${status}`);
  }

  lines.push(
    "\nTo register a thread: send /thread register <domain> in that Telegram topic"
  );
  lines.push("Domains: general, business, webdev, content, security");
  return lines.join("\n");
}
