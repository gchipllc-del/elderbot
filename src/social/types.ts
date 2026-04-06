/**
 * Types for the social media subsystem.
 */

export interface TweetDraft {
  id: string;
  content: string;
  type: "original" | "reply";
  status: "pending" | "approved" | "rejected" | "posted" | "expired";
  inReplyToId?: string;
  inReplyToUser?: string;
  source?: string; // what inspired this tweet (conversation topic, product launch, etc.)
  createdAt: string;
  expiresAt?: string; // original tweets expire after 2 hours without approval
  postedAt?: string;
  tweetId?: string; // X tweet ID after posting
}

export interface Mention {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  conversationId?: string;
}

export interface ContentRule {
  pattern: RegExp;
  description: string;
}

// Topics that must NEVER appear in tweets
export const NEVER_TWEET_TOPICS: ContentRule[] = [
  { pattern: /financial\s*advice|invest\s+in|buy\s+stock|guaranteed\s+return/i, description: "Financial advice" },
  { pattern: /cure|treat\s+disease|medical\s+advice|diagnos/i, description: "Health claims" },
  { pattern: /vote\s+for|democrat|republican|trump|biden|maga|liberal|conservative/i, description: "Political content" },
  { pattern: /jesse['']?s?\s+(address|phone|email|ssn|social\s*security)/i, description: "Personal information about Jesse" },
  { pattern: /password|api[_\s]?key|secret[_\s]?key|token|\.env/i, description: "Credentials or secrets" },
  { pattern: /soc\s*analyst|security\s*operations|incident\s*report|vulnerability/i, description: "SOC/work topics" },
  { pattern: /elderbot.*source\s*code|system\s*prompt|claude\.md/i, description: "Internal system details" },
];
