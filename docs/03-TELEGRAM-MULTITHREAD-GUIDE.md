# Telegram Multi-Thread Setup Guide
# ==================================
# This is the pattern Nat described as "way more powerful" than single chat.
# Each project gets its own group chat = its own context = no pollution.
# ==================================

## Why Group Chats Matter

In a single Telegram DM with your bot, every message shares one context. If you're working on the landing page and want to quickly ask about a Twitter issue, you pollute the landing page context. Group chats solve this — each one spawns a separate OpenClaw session with its own context window.

## Step 1: Enable Group Chat Permissions

1. Open Telegram
2. Search for `@BotFather`
3. Send `/mybots`
4. Select your Elderbot
5. Tap **Bot Settings**
6. Tap **Group Privacy**
7. Tap **Turn OFF** (this allows the bot to see ALL messages in groups, not just @mentions)

## Step 2: Create Your Project Threads

Create a Telegram GROUP CHAT (not a channel) for each workstream. Add Elderbot to each one.

### Recommended Starting Threads

| Group Chat Name | Purpose |
|----------------|---------|
| **Elderbot — Main** | General commands, daily briefings, revenue reports |
| **Elderbot — Tech Made Simple** | First product development, bugs, deployment |
| **Elderbot — Twitter/X** | Tweet drafts, engagement review, content strategy |
| **Elderbot — Support** | Customer issues, email summaries, response drafts |
| **Elderbot — Memory & Config** | Memory system issues, CLAUDE.md updates, cron jobs |

### How to Create Each One

1. In Telegram, tap the pencil icon (new message)
2. Select **New Group**
3. Add your Elderbot bot as a member
4. Name it (e.g., "Elderbot — Tech Made Simple")
5. Done. Start chatting.

## Step 3: How to Use Them

### Main Chat
```
You: Morning briefing please
Elderbot: [revenue summary, priorities, pending items]

You: How are sales looking?
Elderbot: [Stripe data, today vs yesterday, trend]
```

### Product Chat (Tech Made Simple)
```
You: The checkout page is throwing a 500 error. Here's the log: [paste error]
Elderbot: [investigates, fixes, deploys, reports back]

You: Can we add a "Share with Family" button on the success page?
Elderbot: [builds it, commits, deploys]
```

### Twitter/X Chat
```
Elderbot: Draft tweet for your review:
"Technology shouldn't be intimidating. We built Tech Made Simple 
so your loved ones (55+) can feel confident with their phone, 
tablet, and computer. 🤝 [link]"
Post this?

You: Love it. Send it.
Elderbot: Posted. I'll monitor engagement.
```

### Support Chat
```
Elderbot: New email from jane@example.com:
"I bought the guide but the link isn't working on my mom's iPad."
Draft reply:
"Hi Jane, thank you for reaching out..."
Shall I send this?

You: Add a note about clearing Safari cache. Then send.
```

## Step 4: The Power Move — Five Things at Once

With group chats, Elderbot can:
- Fix a bug in the product chat
- Draft a tweet in the X chat
- Respond to a customer in the support chat
- Run a revenue check in the main chat
- Update the memory system in the config chat

...all simultaneously, with zero context pollution between them.

Each group chat kicks off its own OpenClaw session. They're independent. This is how Nat runs 5-8 concurrent workstreams with Felix.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot doesn't respond in group | Check BotFather → Group Privacy is OFF |
| Bot only responds to @mentions | Same fix — Group Privacy must be OFF |
| Bot confuses contexts | Make sure you're in the right group chat |
| Bot stops responding | Check `open-claw status`; restart if needed |
| Too many threads, losing track | Consolidate — only keep active project threads |

## Pro Tip: Pin Important Messages

In each group chat, pin the most important context message. For example, in the product chat, pin: "This chat is for Tech Made Simple development. Repo: github.com/elderbot/tech-made-simple. Deployed at: techmade.simple.elderbot.com"

This gives Elderbot a quick reference at the top of every thread.
