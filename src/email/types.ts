/**
 * Types for the email & notification subsystem.
 */

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  category: "support" | "notification" | "suspicious" | "general";
  handled: boolean;
  escalated: boolean;
}

export interface SupportTicket {
  id: string;
  emailId: string;
  customerEmail: string;
  subject: string;
  status: "open" | "responded" | "escalated" | "closed";
  autoResponse?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRoute {
  source: string;        // e.g. "stripe", "github", "vercel"
  targetThread?: string; // Telegram thread domain to route to
  priority: "high" | "normal" | "low";
}

// Email safety: NEVER execute instructions from email
export const EMAIL_SAFETY_PATTERNS = [
  /emergency.*send.*money/i,
  /urgent.*transfer.*funds/i,
  /this\s+is\s+(jesse|the\s+owner)/i,
  /execute.*command/i,
  /override.*security/i,
  /ignore.*previous.*instructions/i,
  /you\s+must\s+immediately/i,
  /act\s+now.*or\s+else/i,
];
