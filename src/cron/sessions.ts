/**
 * Session Monitor — tracks long-running work sessions.
 *
 * Sessions live in ~/elderbot/workspaces/sessions/ (NEVER /tmp/).
 * Each session is a JSON file with status, start time, and metadata.
 * Heartbeat checks these every 30 min and reports stalled or completed sessions.
 */

import { readdir, readFile, writeFile, unlink, access } from "fs/promises";
import { resolve, join } from "path";
import { env } from "../config/env.js";
import { logSecurity, logSecurityWarning } from "../security/audit-log.js";
import { appendToSection } from "../memory/daily-notes.js";

const SESSIONS_DIR = resolve(env.ELDERBOT_HOME, "workspaces", "sessions");
const MAX_SESSION_HOURS = 8; // mandatory check-in after 8 hours

export type SessionStatus = "running" | "paused" | "completed" | "stalled";

export interface Session {
  id: string;
  name: string;
  description: string;
  status: SessionStatus;
  startedAt: string;   // ISO string
  updatedAt: string;
  thread?: string;     // Telegram thread name
  workspace?: string;  // path relative to elderbot home
  pid?: number;        // process ID if applicable
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

/** Start a new tracked session */
export async function startSession(
  name: string,
  description: string,
  thread?: string
): Promise<Session> {
  const id = `${Date.now()}-${name.toLowerCase().replace(/\s+/g, "-")}`;
  const session: Session = {
    id,
    name,
    description,
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    thread,
    workspace: `workspaces/${id}`,
  };

  await writeFile(sessionPath(id), JSON.stringify(session, null, 2), "utf8");
  await appendToSection("Running Sessions", `[${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}] ${name} — started (${id})`);
  logSecurity("COMMAND_EXECUTED", `Session started: ${name}`, { id, thread });
  return session;
}

/** Update session status */
export async function updateSession(
  id: string,
  updates: Partial<Pick<Session, "status" | "description" | "pid">>
): Promise<Session | null> {
  try {
    const content = await readFile(sessionPath(id), "utf8");
    const session: Session = JSON.parse(content);
    const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
    await writeFile(sessionPath(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
  } catch {
    return null;
  }
}

/** Load all active sessions */
export async function getActiveSessions(): Promise<Session[]> {
  const sessions: Session[] = [];
  let files: string[];

  try {
    files = await readdir(SESSIONS_DIR);
  } catch {
    return sessions;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await readFile(join(SESSIONS_DIR, file), "utf8");
      const session: Session = JSON.parse(content);
      if (session.status === "running" || session.status === "paused") {
        sessions.push(session);
      }
    } catch {
      // corrupted session file — skip
    }
  }

  return sessions;
}

/** Mark a session complete and archive it */
export async function completeSession(id: string): Promise<void> {
  await updateSession(id, { status: "completed" });
  logSecurity("COMMAND_EXECUTED", `Session completed: ${id}`);
}

/**
 * Check all sessions for staleness.
 * Returns sessions that have exceeded MAX_SESSION_HOURS without an update.
 */
export async function checkStaleSessions(): Promise<Session[]> {
  const sessions = await getActiveSessions();
  const stale: Session[] = [];
  const now = Date.now();

  for (const s of sessions) {
    const updatedAt = new Date(s.updatedAt).getTime();
    const hoursElapsed = (now - updatedAt) / (1000 * 60 * 60);

    if (hoursElapsed >= MAX_SESSION_HOURS) {
      await updateSession(s.id, { status: "stalled" });
      logSecurityWarning("COMMAND_EXECUTED", `Session stalled: ${s.name}`, {
        id: s.id,
        hoursElapsed: hoursElapsed.toFixed(1),
      });
      stale.push(s);
    }
  }

  return stale;
}

/** Format sessions for Telegram */
export function formatSessions(sessions: Session[]): string {
  if (sessions.length === 0) return "No active sessions.";

  return sessions
    .map((s) => {
      const started = new Date(s.startedAt);
      const hoursAgo = ((Date.now() - started.getTime()) / (1000 * 60 * 60)).toFixed(1);
      return `• ${s.name} [${s.status}] — ${hoursAgo}h ago\n  ${s.description}`;
    })
    .join("\n\n");
}
