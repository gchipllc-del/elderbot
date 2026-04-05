/**
 * Daily Notes — Layer 2 of the 3-layer memory system.
 *
 * Auto-generates today's note, appends entries, and provides
 * a summary for the morning briefing.
 */

import { readFile, writeFile, access } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { invalidateIndex } from "./search.js";

function todayStr(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function notePath(date: string): string {
  return resolve(env.ELDERBOT_HOME, "life", "daily-notes", `${date}.md`);
}

function noteTemplate(date: string): string {
  return `# ${date}

## Active Projects
- [ ] ElderBot build — Week 2: Memory System

## Completed Today
(nothing yet)

## Revenue
- Stripe today: $0
- Stripe total: $0

## Conversations Summary
(no conversations logged yet)

## Action Items
(none)

## Running Sessions
(none)

## Notes
`;
}

/** Ensure today's note exists, creating it from template if not */
export async function ensureTodayNote(): Promise<string> {
  const date = todayStr();
  const path = notePath(date);

  try {
    await access(path);
  } catch {
    await writeFile(path, noteTemplate(date), "utf8");
    invalidateIndex();
  }

  return path;
}

/** Read today's note content */
export async function readTodayNote(): Promise<string> {
  const path = await ensureTodayNote();
  return readFile(path, "utf8");
}

/** Append a note entry under a specific section */
export async function appendToSection(
  section: string,
  entry: string,
  date = todayStr()
): Promise<void> {
  const path = notePath(date);
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch {
    await writeFile(path, noteTemplate(date), "utf8");
    content = noteTemplate(date);
  }

  const sectionHeader = `## ${section}`;
  const idx = content.indexOf(sectionHeader);

  if (idx === -1) {
    // Section not found — append to end
    content += `\n## ${section}\n- ${entry}\n`;
  } else {
    // Find where the section ends (next ## or end of file)
    const afterHeader = idx + sectionHeader.length;
    const nextSection = content.indexOf("\n## ", afterHeader);
    const insertAt = nextSection === -1 ? content.length : nextSection;

    content =
      content.slice(0, insertAt) +
      `\n- ${entry}` +
      content.slice(insertAt);
  }

  await writeFile(path, content, "utf8");
  invalidateIndex();
}

/** Add a timestamped note to today's Notes section */
export async function addNote(text: string): Promise<void> {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  await appendToSection("Notes", `[${time}] ${text}`);
}

/** Log a completed action to today's note */
export async function logCompleted(text: string): Promise<void> {
  await appendToSection("Completed Today", text);
}

/** Log a running session */
export async function logSession(name: string, status: "started" | "stopped"): Promise<void> {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  await appendToSection("Running Sessions", `[${time}] ${name} — ${status}`);
}

/** Get a summary of today's note for the morning briefing */
export async function getTodaySummary(): Promise<string> {
  const content = await readTodayNote();
  const date = todayStr();

  // Extract sections
  const sections = ["Active Projects", "Completed Today", "Action Items", "Revenue"];
  const lines = [`Daily Note — ${date}`, "---"];

  for (const section of sections) {
    const header = `## ${section}`;
    const start = content.indexOf(header);
    if (start === -1) continue;

    const afterHeader = start + header.length + 1;
    const nextSection = content.indexOf("\n## ", afterHeader);
    const sectionContent = content
      .slice(afterHeader, nextSection === -1 ? undefined : nextSection)
      .trim();

    if (sectionContent && sectionContent !== "(nothing yet)" && sectionContent !== "(none)") {
      lines.push(`\n${section}:`);
      lines.push(sectionContent);
    }
  }

  return lines.join("\n");
}

/** List recent daily notes (last N days) */
export async function listRecentNotes(days = 7): Promise<string[]> {
  const notes: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split("T")[0];
    const path = notePath(date);
    try {
      await access(path);
      notes.push(date);
    } catch {
      // note doesn't exist for this day
    }
  }
  return notes;
}
