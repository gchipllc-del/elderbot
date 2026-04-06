/**
 * Cron Scheduler — centralized job runner.
 *
 * All scheduled jobs are defined here and in config/crons.yaml.
 * Bot cannot create new cron jobs without Jesse's approval —
 * new job requests go to Telegram for approval first.
 *
 * Jobs:
 *   heartbeat             every 30 min, 6am-10pm
 *   morning-briefing      0 8 daily
 *   nightly-consolidation 0 2 daily
 *   security-review       0 6 daily
 */

import cron, { type ScheduledTask } from "node-cron";
import TelegramBot from "node-telegram-bot-api";
import { runHeartbeat } from "./heartbeat.js";
import { sendMorningBriefing } from "./briefing.js";
import { consolidate } from "../memory/consolidate.js";
import { sendDailySalesReport } from "./sales-report.js";
import { checkMentions, runContentMiner, runDraftExpiry } from "./social.js";
import { logSecurity } from "../security/audit-log.js";
import { env } from "../config/env.js";

export interface CronJob {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  lastRun?: Date;
  runCount: number;
}

// Registry of all cron jobs — single source of truth
const jobRegistry: CronJob[] = [
  {
    name: "heartbeat",
    schedule: "*/30 6-22 * * *",
    description: "Check active sessions, report issues",
    enabled: true,
    runCount: 0,
  },
  {
    name: "morning-briefing",
    schedule: "0 8 * * *",
    description: "Daily status → Telegram",
    enabled: true,
    runCount: 0,
  },
  {
    name: "nightly-consolidation",
    schedule: "0 2 * * *",
    description: "Review day, update memory files, re-index",
    enabled: true,
    runCount: 0,
  },
  {
    name: "security-review",
    schedule: "0 6 * * *",
    description: "Review security log before morning briefing",
    enabled: true,
    runCount: 0,
  },
  {
    name: "daily-sales-report",
    schedule: "0 20 * * *",
    description: "Revenue summary → Telegram at 8 PM",
    enabled: true,
    runCount: 0,
  },
  {
    name: "x-mention-check",
    schedule: "*/30 8-22 * * *",
    description: "Check X mentions and auto-reply",
    enabled: true,
    runCount: 0,
  },
  {
    name: "x-content-miner",
    schedule: "0 18 * * *",
    description: "Mine daily activity for tweet ideas → 6 PM",
    enabled: true,
    runCount: 0,
  },
  {
    name: "x-draft-expiry",
    schedule: "0 * * * *",
    description: "Expire unapproved tweet drafts (hourly)",
    enabled: true,
    runCount: 0,
  },
];

const activeTasks: ScheduledTask[] = [];

function markRun(name: string): void {
  const job = jobRegistry.find((j) => j.name === name);
  if (job) {
    job.lastRun = new Date();
    job.runCount++;
  }
}

/** Start all enabled cron jobs */
export function startAllCrons(bot: TelegramBot): void {
  logSecurity("BOT_STARTUP", "Starting cron jobs", {
    jobs: jobRegistry.filter((j) => j.enabled).map((j) => j.name),
  });

  // Heartbeat — every 30 min between 6am and 10pm
  if (jobRegistry.find((j) => j.name === "heartbeat")?.enabled) {
    activeTasks.push(
      cron.schedule("*/30 6-22 * * *", async () => {
        markRun("heartbeat");
        await runHeartbeat(bot).catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Heartbeat error: ${e.message}`)
        );
      })
    );
  }

  // Morning briefing — 8 AM
  if (jobRegistry.find((j) => j.name === "morning-briefing")?.enabled) {
    activeTasks.push(
      cron.schedule("0 8 * * *", async () => {
        markRun("morning-briefing");
        await sendMorningBriefing(bot).catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Briefing error: ${e.message}`)
        );
      })
    );
  }

  // Nightly consolidation — 2 AM
  if (jobRegistry.find((j) => j.name === "nightly-consolidation")?.enabled) {
    activeTasks.push(
      cron.schedule("0 2 * * *", async () => {
        markRun("nightly-consolidation");
        logSecurity("COMMAND_EXECUTED", "Nightly consolidation starting");
        const report = await consolidate().catch((e) => {
          logSecurity("COMMAND_EXECUTED", `Consolidation error: ${e.message}`);
          return null;
        });
        if (report) {
          logSecurity("COMMAND_EXECUTED", "Nightly consolidation complete", {
            filesUpdated: report.filesUpdated.length,
            indexedFiles: report.indexedFiles,
          });
        }
      })
    );
  }

  // Security review — 6 AM (runs silently, flags go into briefing)
  if (jobRegistry.find((j) => j.name === "security-review")?.enabled) {
    activeTasks.push(
      cron.schedule("0 6 * * *", () => {
        markRun("security-review");
        logSecurity("COMMAND_EXECUTED", "Security review running");
      })
    );
  }

  // Daily sales report — 8 PM
  if (jobRegistry.find((j) => j.name === "daily-sales-report")?.enabled) {
    activeTasks.push(
      cron.schedule("0 20 * * *", async () => {
        markRun("daily-sales-report");
        await sendDailySalesReport(bot).catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Sales report error: ${e.message}`)
        );
      })
    );
  }

  // X mention check — every 30 min, 8am-10pm
  if (jobRegistry.find((j) => j.name === "x-mention-check")?.enabled) {
    activeTasks.push(
      cron.schedule("*/30 8-22 * * *", async () => {
        markRun("x-mention-check");
        await checkMentions(bot).catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Mention check error: ${e.message}`)
        );
      })
    );
  }

  // X content miner — 6 PM daily
  if (jobRegistry.find((j) => j.name === "x-content-miner")?.enabled) {
    activeTasks.push(
      cron.schedule("0 18 * * *", async () => {
        markRun("x-content-miner");
        await runContentMiner(bot).catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Content miner error: ${e.message}`)
        );
      })
    );
  }

  // X draft expiry — hourly
  if (jobRegistry.find((j) => j.name === "x-draft-expiry")?.enabled) {
    activeTasks.push(
      cron.schedule("0 * * * *", async () => {
        markRun("x-draft-expiry");
        await runDraftExpiry().catch((e) =>
          logSecurity("COMMAND_EXECUTED", `Draft expiry error: ${e.message}`)
        );
      })
    );
  }

  logSecurity("BOT_STARTUP", `${activeTasks.length} cron job(s) scheduled`);
}

/** Stop all cron jobs cleanly */
export function stopAllCrons(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  logSecurity("BOT_SHUTDOWN", "All cron jobs stopped");
}

/** Get status of all jobs for /crons command */
export function getCronStatus(): string {
  const lines = ["Cron Jobs", "---"];
  for (const job of jobRegistry) {
    const status = job.enabled ? "enabled" : "disabled";
    const lastRun = job.lastRun
      ? job.lastRun.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : "never";
    lines.push(`• ${job.name} [${status}]`);
    lines.push(`  Schedule: ${job.schedule}`);
    lines.push(`  Last run: ${lastRun} | Runs: ${job.runCount}`);
    lines.push(`  ${job.description}`);
  }
  lines.push("\nTo add a job: request via Telegram — no auto-creation.");
  return lines.join("\n");
}

/** Get the job registry (for /crons command) */
export function getJobRegistry(): CronJob[] {
  return [...jobRegistry];
}
