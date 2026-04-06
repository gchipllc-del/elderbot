/**
 * Simplified onboarding flow for elders.
 *
 * Guided setup that a non-technical elder can follow:
 * 1. Install Telegram
 * 2. Connect to ElderBot
 * 3. Set up profile (name, family contacts)
 * 4. Bot begins learning and serving
 *
 * No terminal commands required. No API keys exposed.
 * Everything managed through Telegram conversation.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { ElderProfile, OnboardingStep, FamilyContact } from "./types.js";

const PROFILES_PATH = resolve(env.ELDERBOT_HOME, "config", "elder-profiles.json");

let cache: ElderProfile[] | null = null;

async function load(): Promise<ElderProfile[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(PROFILES_PATH, "utf8");
    cache = JSON.parse(raw) as ElderProfile[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(profiles: ElderProfile[]): Promise<void> {
  await mkdir(resolve(env.ELDERBOT_HOME, "config"), { recursive: true });
  await writeFile(PROFILES_PATH, JSON.stringify(profiles, null, 2), "utf8");
  cache = profiles;
}

/** Get onboarding steps */
export function getOnboardingSteps(): OnboardingStep[] {
  return [
    {
      step: 1,
      title: "Welcome",
      instruction: "Welcome to Elderbot! I'm here to help you with technology, stay safe online, and make life easier. Let's get you set up — it'll only take a few minutes.\n\nFirst, what's your name?",
      completed: false,
    },
    {
      step: 2,
      title: "Family Contact",
      instruction: "Great to meet you! For your safety, would you like to add a family member as an emergency contact? They'll be notified if we detect any scam attempts.\n\nJust type their name, or say 'skip' to set this up later.",
      completed: false,
    },
    {
      step: 3,
      title: "Family Contact Details",
      instruction: "What's the best way to reach them? You can share their:\n- Telegram username (if they have one)\n- Email address\n\nOr say 'skip' to add this later.",
      completed: false,
    },
    {
      step: 4,
      title: "Ready",
      instruction: "You're all set! Here's what I can help you with:\n\n- Answer questions about technology in plain language\n- Help you stay safe from online scams\n- Find products and services for your needs\n- Keep your family in the loop\n\nJust type anything you need help with. I'm always here!",
      completed: false,
    },
  ];
}

/** Create a new elder profile */
export async function createElderProfile(
  name: string,
  chatId: string
): Promise<ElderProfile> {
  const profiles = await load();

  const profile: ElderProfile = {
    id: `elder-${Date.now()}`,
    name,
    telegramChatId: chatId,
    familyContacts: [],
    spendingLimits: {
      dailyMaxUsd: 20,
      singleTransactionMaxUsd: 10,
      familyNotifyAboveUsd: 5,
      coolingPeriodHours: 24,
      allowCrypto: false,
    },
    onboardedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };

  profiles.push(profile);
  await save(profiles);

  logSecurity("CONFIG_CHANGE", `Elder profile created: ${name}`, {
    profileId: profile.id,
    chatId,
  });

  return profile;
}

/** Add a family contact to an elder's profile */
export async function addFamilyContact(
  elderId: string,
  contact: FamilyContact
): Promise<boolean> {
  const profiles = await load();
  const profile = profiles.find((p) => p.id === elderId);
  if (!profile) return false;

  profile.familyContacts.push(contact);
  await save(profiles);

  logSecurity("CONFIG_CHANGE", `Family contact added for ${profile.name}: ${contact.name}`);
  return true;
}

/** Get elder profile by Telegram chat ID */
export async function getElderByChatId(chatId: string): Promise<ElderProfile | null> {
  const profiles = await load();
  return profiles.find((p) => p.telegramChatId === chatId) ?? null;
}

/** Update last active timestamp */
export async function updateLastActive(elderId: string): Promise<void> {
  const profiles = await load();
  const profile = profiles.find((p) => p.id === elderId);
  if (profile) {
    profile.lastActive = new Date().toISOString();
    await save(profiles);
  }
}

/** Get all elder profiles */
export async function getAllElders(): Promise<ElderProfile[]> {
  return load();
}

/** Format elder profile for Telegram */
export function formatElderProfile(profile: ElderProfile): string {
  const contacts = profile.familyContacts.length > 0
    ? profile.familyContacts.map((c) => `  - ${c.name} (${c.relationship})`).join("\n")
    : "  None yet";

  return [
    `Elder Profile: ${profile.name}`,
    "---",
    `ID: ${profile.id}`,
    `Onboarded: ${new Date(profile.onboardedAt).toLocaleDateString()}`,
    `Last active: ${new Date(profile.lastActive).toLocaleDateString()}`,
    "",
    "Family contacts:",
    contacts,
    "",
    "Spending limits:",
    `  Daily: $${profile.spendingLimits.dailyMaxUsd}`,
    `  Per transaction: $${profile.spendingLimits.singleTransactionMaxUsd}`,
    `  Family notify above: $${profile.spendingLimits.familyNotifyAboveUsd}`,
    `  Crypto: ${profile.spendingLimits.allowCrypto ? "Allowed" : "Blocked"}`,
    `  Cooling period: ${profile.spendingLimits.coolingPeriodHours}h on large purchases`,
  ].join("\n");
}
