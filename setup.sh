#!/bin/bash
# ============================================
# Elderbot Quick Setup Script
# Run this on your Mac to scaffold everything
# ============================================

set -e

echo "🤖 Setting up Elderbot..."
echo ""

# --- Config ---
ELDERBOT_HOME="$HOME/elderbot"
SECRETS_DIR="$HOME/.elderbot-secrets"

# --- Create main directory ---
mkdir -p "$ELDERBOT_HOME"
cd "$ELDERBOT_HOME"

echo "📁 Creating directory structure..."

# --- Memory system (life/) ---
mkdir -p life/knowledge/{products,contacts,resources,security}
mkdir -p life/daily-notes
mkdir -p life/tacit

# --- Workspaces for projects ---
mkdir -p workspaces

# --- Secrets directory (outside the repo) ---
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# --- Create .env template ---
if [ ! -f "$SECRETS_DIR/.env" ]; then
  cat > "$SECRETS_DIR/.env" << 'ENVEOF'
# ============================================
# Elderbot Secrets — NEVER commit this file
# ============================================

# Telegram
TELEGRAM_BOT_TOKEN=your_token_here

# Stripe
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here

# Vercel
VERCEL_TOKEN=your_token_here

# GitHub (use SSH key instead if possible)
# GITHUB_TOKEN=your_token_here

# Cloudflare
CLOUDFLARE_API_TOKEN=your_token_here

# Railway
RAILWAY_TOKEN=your_token_here

# X/Twitter
TWITTER_API_KEY=your_key_here
TWITTER_API_SECRET=your_secret_here
TWITTER_ACCESS_TOKEN=your_token_here
TWITTER_ACCESS_SECRET=your_secret_here

# Email (Gmail app password)
EMAIL_ADDRESS=elderbot@gmail.com
EMAIL_APP_PASSWORD=your_app_password_here
ENVEOF
  echo "🔐 Created $SECRETS_DIR/.env — fill in your API keys"
else
  echo "🔐 $SECRETS_DIR/.env already exists — skipping"
fi

# --- Create .gitignore ---
cat > .gitignore << 'GITEOF'
# Secrets
.env
*.secret
*.key

# OS
.DS_Store
Thumbs.db

# Node
node_modules/
package-lock.json

# qmD index (regenerated)
life/.qmd-index/

# Temp
tmp/
*.tmp
GITEOF

# --- Create today's daily note ---
TODAY=$(date +%Y-%m-%d)
if [ ! -f "life/daily-notes/$TODAY.md" ]; then
  cat > "life/daily-notes/$TODAY.md" << NOTEEOF
# $TODAY

## Active Projects
- [ ] Elderbot setup — initial configuration and memory system

## Completed Today
- Initial directory structure created
- Memory system scaffolded

## Revenue
- Stripe today: \$0
- Stripe total: \$0

## Conversations Summary
- Setup day — getting Elderbot running

## Action Items
- [ ] Fill in API keys in ~/.elderbot-secrets/.env
- [ ] Create Telegram bot via @BotFather
- [ ] Initialize OpenClaw
- [ ] Copy CLAUDE.md into ~/elderbot/
- [ ] Index memory: qmd index life/
- [ ] Send first test message

## Running Sessions
- (none running)

## Notes
- Day 1. Let's build.
NOTEEOF
  echo "📝 Created today's daily note: life/daily-notes/$TODAY.md"
fi

echo ""
echo "✅ Elderbot directory structure created at $ELDERBOT_HOME"
echo ""
echo "Next steps:"
echo "  1. Copy the CLAUDE.md from the kit into $ELDERBOT_HOME/CLAUDE.md"
echo "  2. Copy the life/ templates from the kit into $ELDERBOT_HOME/life/"
echo "  3. Fill in $SECRETS_DIR/.env with your API keys"
echo "  4. Create your Telegram bot: talk to @BotFather"
echo "  5. Run: cd $ELDERBOT_HOME && open-claw init"
echo "  6. Run: qmd index life/"
echo "  7. Run: open-claw start"
echo "  8. Send your first message on Telegram!"
echo ""
echo "🤖 Elderbot is ready to wake up."
