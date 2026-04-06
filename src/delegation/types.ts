/**
 * Types for the delegation & project management subsystem.
 */

export interface PRD {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  acceptanceCriteria: string[];
  createdAt: string;
}

export type DelegationStatus =
  | "created"     // PRD written, not yet started
  | "running"     // Codex session active
  | "reviewing"   // Bot is QA-reviewing output
  | "needs-fix"   // QA found issues, iterating
  | "approval"    // Awaiting Jesse's final approval
  | "approved"    // Jesse approved
  | "deployed"    // Live
  | "failed"      // Gave up after max retries
  | "timeout";    // Hit 8-hour limit

export interface DelegationTask {
  id: string;
  prd: PRD;
  status: DelegationStatus;
  sessionDir: string;
  loopCount: number;       // number of Ralph loop iterations
  maxLoops: number;        // default 3
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  timeoutAt: string;       // 8 hours from start
  output?: string;         // summary of what was built
  qaReport?: string;       // bot's QA findings
  errors: string[];
}

export interface ProjectDashboard {
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalLoops: number;
}
