import { config } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";

// Load secrets from ~/.elderbot-secrets/.env (outside the repo)
const secretsPath = resolve(homedir(), ".elderbot-secrets", ".env");
config({ path: secretsPath });

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN ?? "",
  SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID ?? "",
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT ?? "sandbox",
  COINBASE_COMMERCE_API_KEY: process.env.COINBASE_COMMERCE_API_KEY ?? "",
  SPENDING_LIMIT_DAILY_USD: process.env.SPENDING_LIMIT_DAILY_USD ?? "100",
  SPENDING_LIMIT_APPROVAL_USD: process.env.SPENDING_LIMIT_APPROVAL_USD ?? "50",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  ELDERBOT_HOME: resolve(homedir(), "elderbot"),
} as const;

export function validateEnv(): void {
  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === "your_token_here") {
    throw new Error(
      "TELEGRAM_BOT_TOKEN not set. Add it to ~/.elderbot-secrets/.env"
    );
  }
}
