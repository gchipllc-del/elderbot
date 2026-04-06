/**
 * Scam & exploitation detection system.
 *
 * CROWN JEWEL SECURITY FEATURE.
 *
 * Monitors for:
 * - Unusual financial requests
 * - Social engineering attempts
 * - Urgency-based manipulation
 * - Impersonation attempts
 * - Common elder scam patterns
 *
 * Alerts go to both the elder and their designated family contacts.
 */

import { logSecurity } from "../security/audit-log.js";
import type { ScamDetection, ScamType } from "./types.js";

interface ScamPattern {
  type: ScamType;
  patterns: RegExp[];
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

const SCAM_PATTERNS: ScamPattern[] = [
  {
    type: "phishing",
    patterns: [
      /click\s+(this|here|the)\s+link.*(?:verify|confirm|update)/i,
      /your\s+account\s+(?:has been|will be)\s+(?:locked|suspended|closed)/i,
      /verify\s+your\s+(?:identity|account|password)/i,
      /unusual\s+(?:activity|login)\s+(?:detected|noticed)/i,
    ],
    severity: "high",
    description: "Phishing attempt — trying to steal login credentials",
  },
  {
    type: "impersonation",
    patterns: [
      /this\s+is\s+(?:the\s+)?(?:irs|fbi|ssa|social\s+security|medicare)/i,
      /(?:i'?m|this is)\s+(?:your\s+)?(?:bank|doctor|lawyer|grandson|granddaughter)/i,
      /(?:government|federal)\s+(?:agency|office)\s+(?:calling|contacting)/i,
    ],
    severity: "critical",
    description: "Impersonation — someone pretending to be a trusted authority",
  },
  {
    type: "urgency-manipulation",
    patterns: [
      /(?:act|respond|call)\s+(?:now|immediately|right away|within\s+\d+)/i,
      /(?:limited\s+time|expires?\s+(?:today|soon|in\s+\d+))/i,
      /(?:don'?t|do not)\s+tell\s+(?:anyone|your family|your kids)/i,
      /(?:this is|it'?s)\s+(?:an?\s+)?emergency/i,
    ],
    severity: "high",
    description: "Urgency manipulation — pressuring fast action to prevent thinking",
  },
  {
    type: "financial-fraud",
    patterns: [
      /send\s+(?:money|gift\s+cards?|bitcoin|crypto|wire\s+transfer)/i,
      /(?:wire|transfer|send)\s+\$?\d+/i,
      /(?:gift\s+card|itunes|google\s+play|amazon)\s+(?:code|number)/i,
      /(?:investment|guaranteed)\s+(?:return|profit|income)/i,
      /(?:double|triple)\s+your\s+money/i,
    ],
    severity: "critical",
    description: "Financial fraud — attempting to steal money",
  },
  {
    type: "tech-support-scam",
    patterns: [
      /your\s+computer\s+(?:has|is)\s+(?:infected|hacked|compromised)/i,
      /(?:microsoft|apple|google)\s+(?:support|tech|security)/i,
      /(?:remote\s+access|teamviewer|anydesk|screen\s+share)/i,
      /(?:install|download)\s+(?:this|the)\s+(?:software|app|program)/i,
    ],
    severity: "high",
    description: "Tech support scam — fake tech help to gain access",
  },
  {
    type: "romance-scam",
    patterns: [
      /(?:i\s+love\s+you|you'?re\s+special).*(?:send|help|money|need)/i,
      /(?:stuck|stranded)\s+(?:overseas|abroad|in\s+another\s+country)/i,
      /need\s+money\s+(?:for\s+)?(?:flight|ticket|hospital|bail)/i,
    ],
    severity: "high",
    description: "Romance scam — using emotional manipulation for money",
  },
  {
    type: "lottery-scam",
    patterns: [
      /you(?:'ve)?\s+(?:won|been\s+selected|inherited)/i,
      /(?:lottery|sweepstakes|prize|jackpot)\s+(?:winner|claim)/i,
      /(?:claim\s+your|collect\s+your)\s+(?:prize|winnings|reward)/i,
      /(?:processing|handling|tax)\s+fee.*(?:send|pay|transfer)/i,
    ],
    severity: "high",
    description: "Lottery/prize scam — fake winnings requiring upfront payment",
  },
  {
    type: "irs-scam",
    patterns: [
      /(?:irs|internal\s+revenue|tax)\s+(?:audit|owe|warrant|arrest)/i,
      /(?:back\s+taxes|tax\s+debt|overdue\s+taxes)/i,
      /(?:arrest\s+warrant|legal\s+action).*(?:tax|irs|payment)/i,
    ],
    severity: "critical",
    description: "IRS/tax scam — fake tax authorities threatening arrest",
  },
];

/** Scan text for scam patterns */
export function detectScams(text: string): ScamDetection[] {
  const detections: ScamDetection[] = [];

  for (const scamPattern of SCAM_PATTERNS) {
    for (const regex of scamPattern.patterns) {
      if (regex.test(text)) {
        detections.push({
          id: `scam-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          type: scamPattern.type,
          description: scamPattern.description,
          severity: scamPattern.severity,
          source: text.substring(0, 100),
          detectedAt: new Date().toISOString(),
          alertedElder: false,
          alertedFamily: false,
          blocked: scamPattern.severity === "critical",
        });

        logSecurity("PROMPT_INJECTION_ATTEMPT", `Scam detected: ${scamPattern.type}`, {
          severity: scamPattern.severity,
          pattern: regex.source.substring(0, 50),
        });

        break; // One detection per pattern type
      }
    }
  }

  return detections;
}

/** Format scam alert for Telegram */
export function formatScamAlert(detection: ScamDetection): string {
  const severityIcon = {
    low: "[i]",
    medium: "[!]",
    high: "[!!]",
    critical: "[!!!]",
  }[detection.severity];

  return [
    `${severityIcon} SCAM ALERT: ${detection.type.toUpperCase()}`,
    `---`,
    detection.description,
    ``,
    `What was detected:`,
    `"${detection.source}..."`,
    ``,
    detection.blocked ? "ACTION: Blocked automatically." : "ACTION: Please review carefully.",
    ``,
    `If someone sent you this, DO NOT respond or send money.`,
    `If you're unsure, ask a family member or contact Elderbot support.`,
  ].join("\n");
}

/** Format a summary of all detections */
export function formatScamSummary(detections: ScamDetection[]): string {
  if (detections.length === 0) return "No scam attempts detected. Stay safe!";

  return [
    `Scam Detection Summary: ${detections.length} alert(s)`,
    "---",
    ...detections.map((d) => {
      const icon = d.severity === "critical" ? "[!!!]" : d.severity === "high" ? "[!!]" : "[!]";
      return `${icon} ${d.type}: ${d.description.substring(0, 60)}`;
    }),
  ].join("\n");
}
