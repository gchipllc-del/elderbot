/**
 * X/Twitter API client.
 *
 * Uses X API v2 with OAuth 1.0a (user context) via raw fetch.
 * No heavy SDK — just the endpoints we need.
 */

import { createHmac, randomBytes } from "crypto";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";

const API_BASE = "https://api.twitter.com/2";

export function isXConfigured(): boolean {
  return !!(
    env.TWITTER_API_KEY &&
    env.TWITTER_API_SECRET &&
    env.TWITTER_ACCESS_TOKEN &&
    env.TWITTER_ACCESS_SECRET
  );
}

// --- OAuth 1.0a signing ---

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateOAuthParams(): Record<string, string> {
  return {
    oauth_consumer_key: env.TWITTER_API_KEY,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
}

function createSignature(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(env.TWITTER_API_SECRET)}&${percentEncode(env.TWITTER_ACCESS_SECRET)}`;

  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildAuthHeader(method: string, url: string, bodyParams: Record<string, string> = {}): string {
  const oauthParams = generateOAuthParams();
  const allParams = { ...oauthParams, ...bodyParams };

  const signature = createSignature(method, url, allParams);
  oauthParams["oauth_signature"] = signature;

  const headerParts = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// --- API methods ---

interface TweetResponse {
  data?: { id: string; text: string };
  errors?: Array<{ message: string }>;
}

interface MentionsResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    conversation_id?: string;
  }>;
  includes?: {
    users?: Array<{ id: string; username: string }>;
  };
  meta?: { newest_id?: string; result_count?: number };
}

/** Post a tweet */
export async function postTweet(text: string, replyToId?: string): Promise<{ id: string; text: string } | null> {
  if (!isXConfigured()) throw new Error("X/Twitter not configured. Add API keys to secrets.");

  const url = `${API_BASE}/tweets`;
  const body: Record<string, unknown> = { text };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }

  const auth = buildAuthHeader("POST", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    logSecurity("COMMAND_EXECUTED", `X API post error: ${response.status}`, {
      error: errText.substring(0, 200),
    });
    throw new Error(`X API error (${response.status}): ${errText.substring(0, 150)}`);
  }

  const result = await response.json() as TweetResponse;

  if (result.errors?.length) {
    throw new Error(`X API: ${result.errors[0].message}`);
  }

  if (result.data) {
    logSecurity("COMMAND_EXECUTED", "Tweet posted", {
      tweetId: result.data.id,
      chars: String(result.data.text.length),
      isReply: String(!!replyToId),
    });
  }

  return result.data ?? null;
}

/** Get recent mentions of the bot's account */
export async function getMentions(sinceId?: string): Promise<MentionsResponse> {
  if (!isXConfigured()) throw new Error("X/Twitter not configured.");

  // First get our own user ID
  const meUrl = `${API_BASE}/users/me`;
  const meAuth = buildAuthHeader("GET", meUrl);

  const meResponse = await fetch(meUrl, {
    headers: { "Authorization": meAuth },
  });

  if (!meResponse.ok) {
    throw new Error(`X API error getting user: ${meResponse.status}`);
  }

  const me = await meResponse.json() as { data?: { id: string } };
  const userId = me.data?.id;
  if (!userId) throw new Error("Could not get bot's user ID");

  // Now get mentions
  const params = new URLSearchParams({
    "tweet.fields": "created_at,conversation_id,author_id",
    "expansions": "author_id",
    "max_results": "20",
  });
  if (sinceId) params.set("since_id", sinceId);

  const mentionsUrl = `${API_BASE}/users/${userId}/mentions?${params.toString()}`;
  const mentionsAuth = buildAuthHeader("GET", mentionsUrl);

  const response = await fetch(mentionsUrl, {
    headers: { "Authorization": mentionsAuth },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`X API mentions error (${response.status}): ${errText.substring(0, 150)}`);
  }

  return response.json() as Promise<MentionsResponse>;
}

/** Delete a tweet (for safety — can remove bad posts quickly) */
export async function deleteTweet(tweetId: string): Promise<boolean> {
  if (!isXConfigured()) return false;

  const url = `${API_BASE}/tweets/${tweetId}`;
  const auth = buildAuthHeader("DELETE", url);

  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Authorization": auth },
  });

  if (response.ok) {
    logSecurity("COMMAND_EXECUTED", "Tweet deleted", { tweetId });
  }

  return response.ok;
}
