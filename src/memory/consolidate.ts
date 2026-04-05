/**
 * Nightly Memory Consolidation — runs at 2 AM.
 *
 * Reviews today's daily note, extracts important information,
 * updates knowledge/tacit files, and re-indexes memory.
 *
 * Can be run manually: bun src/memory/consolidate.ts
 * Or via cron (Week 3).
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { readTodayNote, logCompleted } from "./daily-notes.js";
import { invalidateIndex, getIndex } from "./search.js";
import { logSecurity } from "../security/audit-log.js";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export interface ConsolidationReport {
  date: string;
  filesUpdated: string[];
  indexedFiles: number;
  summary: string;
}

/**
 * Main consolidation job.
 * Reads today's note, extracts key facts, updates memory files.
 */
export async function consolidate(): Promise<ConsolidationReport> {
  const date = todayStr();
  const filesUpdated: string[] = [];

  logSecurity("BOT_STARTUP", "Nightly consolidation starting", { date });

  // 1. Read today's daily note
  const todayNote = await readTodayNote();

  // 2. Extract action items that were completed
  const completedItems = todayNote
    .split("\n")
    .filter((l) => l.match(/^- \[x\]/i))
    .map((l) => l.replace(/^- \[x\]\s*/i, "").trim());

  // 3. Extract open action items for tomorrow
  const openItems = todayNote
    .split("\n")
    .filter((l) => l.match(/^- \[ \]/))
    .map((l) => l.replace(/^- \[ \]\s*/, "").trim());

  // 4. Update the consolidation log
  const consolidationLogPath = resolve(
    env.ELDERBOT_HOME,
    "life",
    "knowledge",
    "consolidation-log.md"
  );

  let logContent: string;
  try {
    logContent = await readFile(consolidationLogPath, "utf8");
  } catch {
    logContent = "# Consolidation Log\n\nNightly memory updates.\n\n";
  }

  const entry = [
    `## ${date}`,
    "",
    completedItems.length > 0
      ? `Completed: ${completedItems.map((i) => `\n- ${i}`).join("")}`
      : "Completed: (nothing logged)",
    "",
    openItems.length > 0
      ? `Carried forward: ${openItems.map((i) => `\n- ${i}`).join("")}`
      : "Carried forward: (none)",
    "",
    "---",
    "",
  ].join("\n");

  logContent += entry;
  await writeFile(consolidationLogPath, logContent, "utf8");
  filesUpdated.push("life/knowledge/consolidation-log.md");

  // 5. Re-index all memory files
  invalidateIndex();
  const index = await getIndex();

  logSecurity("BOT_STARTUP", "Nightly consolidation complete", {
    date,
    filesUpdated: filesUpdated.length,
    indexedFiles: index.length,
  });

  const report: ConsolidationReport = {
    date,
    filesUpdated,
    indexedFiles: index.length,
    summary: [
      `Consolidation complete for ${date}`,
      `Files updated: ${filesUpdated.length}`,
      `Memory index: ${index.length} files`,
      completedItems.length > 0
        ? `Completed items logged: ${completedItems.length}`
        : "No completed items found",
      openItems.length > 0
        ? `Items carried forward: ${openItems.length}`
        : "No open items",
    ].join("\n"),
  };

  return report;
}

/** Format consolidation report for Telegram */
export function formatReport(report: ConsolidationReport): string {
  return [
    `Nightly consolidation — ${report.date}`,
    "---",
    report.summary,
  ].join("\n");
}

// Run directly: bun src/memory/consolidate.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  consolidate()
    .then((r) => console.log(formatReport(r)))
    .catch(console.error);
}
