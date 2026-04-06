/**
 * Delegation task manager.
 *
 * Manages PRD creation, Codex session lifecycle, Ralph loops,
 * QA review, and approval workflows.
 *
 * Security: Sessions sandboxed to ~/elderbot/workspace/codex-sessions/.
 * No access to Jesse's work directories or SOC tools.
 * 8-hour max timeout per task.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import { chat } from "../ai/claude.js";
import type { DelegationTask, PRD, DelegationStatus, ProjectDashboard } from "./types.js";

const TASKS_PATH = resolve(env.ELDERBOT_HOME, "config", "delegation-tasks.json");
const WORKSPACE = resolve(env.ELDERBOT_HOME, "workspace", "codex-sessions");
const MAX_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

let cache: DelegationTask[] | null = null;

async function load(): Promise<DelegationTask[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(TASKS_PATH, "utf8");
    cache = JSON.parse(raw) as DelegationTask[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(tasks: DelegationTask[]): Promise<void> {
  await mkdir(resolve(env.ELDERBOT_HOME, "config"), { recursive: true });
  await writeFile(TASKS_PATH, JSON.stringify(tasks, null, 2), "utf8");
  cache = tasks;
}

/** Generate a PRD from a task description using AI */
export async function generatePRD(description: string): Promise<PRD> {
  const prompt = `You are a product manager writing a PRD (Product Requirements Document) for a small coding task.

Task: ${description}

Output a concise PRD in this exact format:
TITLE: <short title>
DESCRIPTION: <1-2 sentences>
REQUIREMENTS:
- <requirement 1>
- <requirement 2>
- <requirement 3>
ACCEPTANCE_CRITERIA:
- <criterion 1>
- <criterion 2>
- <criterion 3>

Keep it focused and actionable. Max 5 requirements and 5 acceptance criteria.`;

  const response = await chat(prompt, 0, undefined, "general");

  // Parse the response
  const lines = response.split("\n").map((l) => l.trim());
  const title = lines.find((l) => l.startsWith("TITLE:"))?.replace("TITLE:", "").trim() ?? description.substring(0, 60);
  const desc = lines.find((l) => l.startsWith("DESCRIPTION:"))?.replace("DESCRIPTION:", "").trim() ?? description;

  const requirements: string[] = [];
  const criteria: string[] = [];
  let section: "req" | "crit" | null = null;

  for (const line of lines) {
    if (line.startsWith("REQUIREMENTS:")) { section = "req"; continue; }
    if (line.startsWith("ACCEPTANCE_CRITERIA:")) { section = "crit"; continue; }
    if (line.startsWith("- ") && section === "req") requirements.push(line.substring(2));
    if (line.startsWith("- ") && section === "crit") criteria.push(line.substring(2));
  }

  return {
    id: `prd-${Date.now()}`,
    title,
    description: desc,
    requirements: requirements.length > 0 ? requirements : [description],
    acceptanceCriteria: criteria.length > 0 ? criteria : ["Task completed as described"],
    createdAt: new Date().toISOString(),
  };
}

/** Create a new delegation task */
export async function createTask(description: string): Promise<DelegationTask> {
  const tasks = await load();

  const prd = await generatePRD(description);
  const now = new Date();
  const sessionDir = resolve(WORKSPACE, prd.id);
  await mkdir(sessionDir, { recursive: true });

  const task: DelegationTask = {
    id: `task-${Date.now()}`,
    prd,
    status: "created",
    sessionDir,
    loopCount: 0,
    maxLoops: 3,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    timeoutAt: new Date(now.getTime() + MAX_TIMEOUT_MS).toISOString(),
    errors: [],
  };

  tasks.push(task);
  await save(tasks);

  logSecurity("COMMAND_EXECUTED", `Delegation task created: ${prd.title}`, {
    taskId: task.id,
    prdId: prd.id,
  });

  return task;
}

/** Run one Ralph loop iteration on a task */
export async function runRalphLoop(taskId: string): Promise<DelegationTask | null> {
  const tasks = await load();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  // Check timeout
  if (new Date().toISOString() > task.timeoutAt) {
    task.status = "timeout";
    task.updatedAt = new Date().toISOString();
    await save(tasks);
    logSecurity("COMMAND_EXECUTED", `Task timed out: ${task.prd.title}`, { taskId });
    return task;
  }

  // Check max loops
  if (task.loopCount >= task.maxLoops) {
    task.status = "failed";
    task.errors.push("Max Ralph loop iterations reached");
    task.updatedAt = new Date().toISOString();
    await save(tasks);
    return task;
  }

  task.status = "running";
  task.loopCount++;
  task.updatedAt = new Date().toISOString();
  await save(tasks);

  logSecurity("COMMAND_EXECUTED", `Ralph loop ${task.loopCount}/${task.maxLoops} for: ${task.prd.title}`, {
    taskId,
  });

  try {
    // Step 1: Execute via AI (simulate Codex delegation)
    const execPrompt = `You are executing a coding task. Here is the PRD:

Title: ${task.prd.title}
Description: ${task.prd.description}
Requirements:
${task.prd.requirements.map((r) => `- ${r}`).join("\n")}

${task.loopCount > 1 && task.qaReport ? `Previous QA feedback:\n${task.qaReport}\n\nFix the issues found.` : ""}

Workspace directory: ${task.sessionDir}

Provide the solution as a summary of what you built/would build. Include file names, key functions, and architecture decisions.`;

    const execResult = await chat(execPrompt, 0, undefined, "general");
    task.output = execResult;

    // Step 2: QA review
    task.status = "reviewing";
    await save(tasks);

    const qaPrompt = `You are a QA reviewer. Review this output against the acceptance criteria:

Acceptance Criteria:
${task.prd.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}

Output to review:
${execResult.substring(0, 2000)}

Does this meet ALL acceptance criteria? Reply with:
PASS — if all criteria are met
FAIL — followed by specific issues to fix

Be strict but fair.`;

    const qaResult = await chat(qaPrompt, 0, undefined, "general");
    task.qaReport = qaResult;

    if (qaResult.toUpperCase().includes("PASS")) {
      task.status = "approval";
      task.completedAt = new Date().toISOString();
      logSecurity("COMMAND_EXECUTED", `Task passed QA: ${task.prd.title}`, { taskId });
    } else {
      task.status = "needs-fix";
      logSecurity("COMMAND_EXECUTED", `Task needs fixes: ${task.prd.title}`, { taskId });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    task.errors.push(msg);
    task.status = "needs-fix";
    logSecurity("COMMAND_EXECUTED", `Ralph loop error: ${msg}`, { taskId });
  }

  task.updatedAt = new Date().toISOString();
  await save(tasks);
  return task;
}

/** Approve a completed task */
export async function approveTask(taskId: string): Promise<DelegationTask | null> {
  const tasks = await load();
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "approval") return null;

  task.status = "approved";
  task.updatedAt = new Date().toISOString();
  await save(tasks);

  logSecurity("COMMAND_EXECUTED", `Task approved: ${task.prd.title}`, { taskId });
  return task;
}

/** Get all active tasks */
export async function getActiveTasks(): Promise<DelegationTask[]> {
  const tasks = await load();
  return tasks.filter((t) => !["approved", "deployed", "failed", "timeout"].includes(t.status));
}

/** Get all tasks */
export async function getAllTasks(): Promise<DelegationTask[]> {
  return load();
}

/** Check for timed-out tasks */
export async function checkTimeouts(): Promise<DelegationTask[]> {
  const tasks = await load();
  const now = new Date().toISOString();
  const timedOut: DelegationTask[] = [];

  for (const task of tasks) {
    if (["running", "reviewing", "needs-fix", "created"].includes(task.status) && task.timeoutAt < now) {
      task.status = "timeout";
      task.updatedAt = now;
      timedOut.push(task);
      logSecurity("COMMAND_EXECUTED", `Task timed out: ${task.prd.title}`, { taskId: task.id });
    }
  }

  if (timedOut.length > 0) await save(tasks);
  return timedOut;
}

/** Get project dashboard stats */
export async function getDashboard(): Promise<ProjectDashboard> {
  const tasks = await load();
  return {
    activeTasks: tasks.filter((t) => ["created", "running", "reviewing", "needs-fix", "approval"].includes(t.status)).length,
    completedTasks: tasks.filter((t) => ["approved", "deployed"].includes(t.status)).length,
    failedTasks: tasks.filter((t) => ["failed", "timeout"].includes(t.status)).length,
    totalLoops: tasks.reduce((sum, t) => sum + t.loopCount, 0),
  };
}

/** Format task list for Telegram */
export function formatTaskList(tasks: DelegationTask[]): string {
  if (tasks.length === 0) return "No delegation tasks.";

  return tasks
    .map((t) => {
      const icon = {
        created: "[ ]", running: "[>]", reviewing: "[?]", "needs-fix": "[!]",
        approval: "[*]", approved: "[+]", deployed: "[>>]", failed: "[x]", timeout: "[~]",
      }[t.status];

      return [
        `${icon} ${t.prd.title} — ${t.status}`,
        `  ID: ${t.id}`,
        `  Loops: ${t.loopCount}/${t.maxLoops}`,
        t.status === "approval" ? `  Approve: /delegate approve ${t.id}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** Format dashboard for Telegram */
export function formatDashboard(dash: ProjectDashboard): string {
  return [
    "Project Dashboard",
    "---",
    `Active tasks: ${dash.activeTasks}`,
    `Completed: ${dash.completedTasks}`,
    `Failed/Timed out: ${dash.failedTasks}`,
    `Total Ralph loops: ${dash.totalLoops}`,
  ].join("\n");
}
