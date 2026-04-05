# Proven Workflows

## Product Launch Workflow
1. Ideation conversation with Jesse (Telegram)
2. Write PRD in `~/elderbot/workspaces/<project>/PRD.md`
3. Log in daily note as active project
4. Build (direct or via Codex delegation)
5. Deploy: GitHub → Vercel (frontend), Railway (backend)
6. Set up Stripe product + pricing + checkout
7. Build landing page with Stripe integration
8. Jesse provides DNS settings (current bottleneck to remove)
9. Draft X announcement → Jesse approves → post
10. Monitor sales, handle support

## Bug Fix Workflow
1. Identify issue (from testing, user report, or monitoring)
2. If quick fix (< 5 min): fix directly, commit, deploy
3. If bigger: write up in project Telegram thread, fix, test, deploy
4. Update daily note

## Content Creation Workflow (X/Twitter)
1. Cron job fires "draft a tweet"
2. Check recent conversations + mentions for inspiration
3. Draft tweet aligned with mission and voice
4. Post to Twitter Telegram thread for Jesse's approval
5. Jesse approves → post via X API
6. Monitor engagement for 1 hour after posting

## Memory Consolidation Workflow (Nightly)
1. Review all Telegram conversations from past 24 hours
2. Extract: project updates, decisions, contacts, lessons, action items
3. Update `life/knowledge/` files as needed
4. Update or create today's `life/daily-notes/YYYY-MM-DD.md`
5. Update `life/tacit/` if Jesse expressed a preference or correction
6. Re-index: `qmd index life/`
7. Log consolidation in daily note

## Codex Delegation Workflow
1. Write clear PRD with acceptance criteria
2. Spawn Codex session in `~/elderbot/workspaces/<project>/` (NEVER /tmp/)
3. Log session in daily note under "Running Sessions"
4. Heartbeat monitors every 30 min
5. If session dies: restart once silently; if dies again, report to Jesse
6. If session completes: review output, report to Jesse with link
