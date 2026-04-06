/**
 * Types for elder safety subsystem.
 */

export interface ElderProfile {
  id: string;
  name: string;
  telegramChatId: string;
  familyContacts: FamilyContact[];
  spendingLimits: ElderSpendingLimits;
  onboardedAt: string;
  lastActive: string;
}

export interface FamilyContact {
  name: string;
  telegramChatId?: string;
  email?: string;
  relationship: string;
  notifyOnTransactions: boolean; // notify on transactions over threshold
  notifyOnScamAttempts: boolean;
}

export interface ElderSpendingLimits {
  dailyMaxUsd: number;           // default $20
  singleTransactionMaxUsd: number; // default $10
  familyNotifyAboveUsd: number;   // default $5
  coolingPeriodHours: number;     // 24 hours for large purchases
  allowCrypto: boolean;           // default false
}

export interface ScamDetection {
  id: string;
  type: ScamType;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  detectedAt: string;
  alertedElder: boolean;
  alertedFamily: boolean;
  blocked: boolean;
}

export type ScamType =
  | "phishing"
  | "impersonation"
  | "urgency-manipulation"
  | "financial-fraud"
  | "tech-support-scam"
  | "romance-scam"
  | "lottery-scam"
  | "irs-scam";

export interface OnboardingStep {
  step: number;
  title: string;
  instruction: string;
  completed: boolean;
}
