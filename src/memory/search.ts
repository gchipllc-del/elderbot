/**
 * Memory Search — fast markdown search across the life/ directory.
 * Replacement for qmD. Indexes all .md files and supports keyword search
 * with context snippets.
 */

import { readdir, readFile, stat } from "fs/promises";
import { resolve, relative, join } from "path";
import { env } from "../config/env.js";

export interface SearchResult {
  file: string;          // relative path from elderbot home
  title: string;         // first H1 heading or filename
  matches: MatchContext[]; // surrounding context for each match
  score: number;         // relevance score
}

export interface MatchContext {
  line: number;
  text: string;          // the matching line
  before: string;        // line before
  after: string;         // line after
}

export interface MemoryFile {
  path: string;          // absolute path
  relative: string;      // relative to elderbot home
  title: string;
  content: string;
  lines: string[];
  modified: Date;
}

let indexCache: MemoryFile[] | null = null;
let indexCacheTime = 0;
const CACHE_TTL_MS = 60_000; // re-index every 60 seconds

/** Walk directory recursively and collect all .md files */
async function walkMarkdown(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      files.push(...(await walkMarkdown(full)));
    } else if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

/** Build (or return cached) index of all markdown files */
export async function getIndex(): Promise<MemoryFile[]> {
  const now = Date.now();
  if (indexCache && now - indexCacheTime < CACHE_TTL_MS) {
    return indexCache;
  }

  const lifeDir = resolve(env.ELDERBOT_HOME, "life");
  const paths = await walkMarkdown(lifeDir);

  const files = await Promise.all(
    paths.map(async (p): Promise<MemoryFile | null> => {
      try {
        const content = await readFile(p, "utf8");
        const s = await stat(p);
        const rel = relative(env.ELDERBOT_HOME, p);
        const filename = p.split("/").pop()!.replace(".md", "");
        return {
          path: p,
          relative: rel,
          title: extractTitle(content, filename),
          content,
          lines: content.split("\n"),
          modified: s.mtime,
        };
      } catch {
        return null;
      }
    })
  );

  indexCache = files.filter(Boolean) as MemoryFile[];
  indexCacheTime = now;
  return indexCache;
}

/** Invalidate the index cache (call after writing new memory files) */
export function invalidateIndex(): void {
  indexCache = null;
}

/**
 * Search memory files for a query string.
 * Supports multi-word queries — all words must appear somewhere in the file.
 */
export async function search(query: string, maxResults = 5): Promise<SearchResult[]> {
  const index = await getIndex();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const file of index) {
    const contentLower = file.content.toLowerCase();

    // All terms must appear somewhere in the file
    if (!terms.every((t) => contentLower.includes(t))) continue;

    const matches: MatchContext[] = [];
    let score = 0;

    for (let i = 0; i < file.lines.length; i++) {
      const lineLower = file.lines[i].toLowerCase();
      const lineMatches = terms.some((t) => lineLower.includes(t));
      if (!lineMatches) continue;

      // Score boosts
      if (file.lines[i].startsWith("#")) score += 10; // heading match
      score += terms.filter((t) => lineLower.includes(t)).length * 2;

      matches.push({
        line: i + 1,
        text: file.lines[i],
        before: file.lines[i - 1] ?? "",
        after: file.lines[i + 1] ?? "",
      });

      if (matches.length >= 3) break; // max 3 context snippets per file
    }

    // Boost recently modified files
    const daysSinceModified =
      (Date.now() - file.modified.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 1) score += 5;
    else if (daysSinceModified < 7) score += 2;

    results.push({ file: file.relative, title: file.title, matches, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/** Format search results for Telegram */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No memory found for: "${query}"`;
  }

  const lines = [`Memory search: "${query}"`, "---"];

  for (const r of results) {
    lines.push(`📄 ${r.title} (${r.file})`);
    for (const m of r.matches.slice(0, 2)) {
      const text = m.text.trim();
      if (text) lines.push(`  → ${text.substring(0, 120)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
