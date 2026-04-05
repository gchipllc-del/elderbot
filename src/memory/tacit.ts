/**
 * Tacit Knowledge — Layer 3 of the 3-layer memory system.
 *
 * Stores preferences, patterns, lessons, trusted channels, and security rules.
 * What makes the bot feel like it "knows" you over time.
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { invalidateIndex } from "./search.js";

const TACIT_FILES = {
  preferences: "life/tacit/preferences.md",
  communication: "life/tacit/communication.md",
  security: "life/tacit/security-rules.md",
  lessons: "life/tacit/lessons-learned.md",
  workflows: "life/tacit/workflows.md",
} as const;

type TacitFile = keyof typeof TACIT_FILES;

function tacitPath(file: TacitFile): string {
  return resolve(env.ELDERBOT_HOME, TACIT_FILES[file]);
}

/** Read a tacit knowledge file */
export async function readTacit(file: TacitFile): Promise<string> {
  try {
    return await readFile(tacitPath(file), "utf8");
  } catch {
    return `# ${file}\n\n(no entries yet)\n`;
  }
}

/** Append a lesson learned */
export async function addLesson(lesson: string): Promise<void> {
  const path = tacitPath("lessons");
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    content = "# Lessons Learned\n\n";
  }

  const date = new Date().toISOString().split("T")[0];
  content += `\n- [${date}] ${lesson}`;
  await writeFile(path, content, "utf8");
  invalidateIndex();
}

/** Append a preference or pattern */
export async function addPreference(pref: string): Promise<void> {
  const path = tacitPath("preferences");
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    content = "# Preferences\n\n";
  }

  const date = new Date().toISOString().split("T")[0];
  content += `\n- [${date}] ${pref}`;
  await writeFile(path, content, "utf8");
  invalidateIndex();
}

/** Get a summary of tacit knowledge for context */
export async function getTacitSummary(): Promise<string> {
  const prefs = await readTacit("preferences");
  const security = await readTacit("security");

  return [
    "Tacit Knowledge Summary",
    "---",
    "Key Preferences:",
    prefs
      .split("\n")
      .filter((l) => l.startsWith("-"))
      .slice(0, 5)
      .join("\n") || "(none)",
    "",
    "Security Rules:",
    security
      .split("\n")
      .filter((l) => l.startsWith("-") || l.startsWith("#"))
      .slice(0, 5)
      .join("\n") || "(none)",
  ].join("\n");
}
