/**
 * Financial guardrails — spending limits and approval gates.
 *
 * SECURITY-CRITICAL: This module enforces hard spending limits.
 * Every checkout request passes through here BEFORE any money moves.
 *
 * Rules (from CLAUDE.md):
 * - Max daily spend configurable via env (default $100)
 * - Single transaction approval threshold configurable (default $50)
 * - No crypto/wire transfers without explicit approval
 * - Full audit trail on all financial actions
 */

import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import { getTodaySales } from "./sales-ledger.js";
import type { SpendingLimits } from "./types.js";

/** Get current spending limits from config */
export function getSpendingLimits(): SpendingLimits {
  return {
    dailyMaxUsd: parseFloat(env.SPENDING_LIMIT_DAILY_USD) || 100,
    singleTransactionMaxUsd: 100, // hard cap per transaction
    requireApprovalAboveUsd: parseFloat(env.SPENDING_LIMIT_APPROVAL_USD) || 50,
  };
}

/** Get today's total spending */
export async function getDailySpendTotal(): Promise<number> {
  const todaySales = await getTodaySales();
  return todaySales
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.amountUsd, 0);
}

interface GuardrailCheck {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

/** Check if a transaction is within spending limits */
export async function checkSpendingLimit(amountUsd: number): Promise<GuardrailCheck> {
  const limits = getSpendingLimits();
  const dailyTotal = await getDailySpendTotal();

  // Hard block: single transaction exceeds max
  if (amountUsd > limits.singleTransactionMaxUsd) {
    logSecurity("COMMAND_EXECUTED", "GUARDRAIL: Transaction exceeds single-tx limit", {
      amount: String(amountUsd),
      limit: String(limits.singleTransactionMaxUsd),
    });
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Transaction of $${amountUsd.toFixed(2)} exceeds the $${limits.singleTransactionMaxUsd} single-transaction limit.`,
    };
  }

  // Hard block: would exceed daily limit
  if (dailyTotal + amountUsd > limits.dailyMaxUsd) {
    logSecurity("COMMAND_EXECUTED", "GUARDRAIL: Transaction would exceed daily limit", {
      amount: String(amountUsd),
      dailyTotal: String(dailyTotal),
      limit: String(limits.dailyMaxUsd),
    });
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Transaction of $${amountUsd.toFixed(2)} would push daily total ($${dailyTotal.toFixed(2)}) over the $${limits.dailyMaxUsd} daily limit.`,
    };
  }

  // Soft gate: requires Jesse's approval
  if (amountUsd > limits.requireApprovalAboveUsd) {
    logSecurity("COMMAND_EXECUTED", "GUARDRAIL: Transaction requires approval", {
      amount: String(amountUsd),
      threshold: String(limits.requireApprovalAboveUsd),
    });
    return {
      allowed: true,
      requiresApproval: true,
      reason: `Transaction of $${amountUsd.toFixed(2)} exceeds the $${limits.requireApprovalAboveUsd} approval threshold. Jesse must approve.`,
    };
  }

  // All clear
  return { allowed: true, requiresApproval: false };
}

/** Format guardrail status for Telegram display */
export async function formatGuardrailStatus(): Promise<string> {
  const limits = getSpendingLimits();
  const dailyTotal = await getDailySpendTotal();
  const remaining = Math.max(0, limits.dailyMaxUsd - dailyTotal);

  return [
    "Financial Guardrails:",
    `  Daily limit: $${limits.dailyMaxUsd.toFixed(2)}`,
    `  Spent today: $${dailyTotal.toFixed(2)}`,
    `  Remaining: $${remaining.toFixed(2)}`,
    `  Approval required above: $${limits.requireApprovalAboveUsd.toFixed(2)}`,
    `  Single-tx max: $${limits.singleTransactionMaxUsd.toFixed(2)}`,
  ].join("\n");
}
