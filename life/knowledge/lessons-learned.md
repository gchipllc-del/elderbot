# Lessons Learned

## Technical
- **Never use /tmp/ for long-running sessions** — the OS cleans it out and kills your work
- **Splunk SPL regex uses `\S+` not `[^\s]+`** — learned from investigation work
- **`appendcols` requires a prior reporting command** in Splunk
- **Subsearch time windows should be wider than the main search** in Splunk
- **Entra ID field names are case-sensitive** — `correlationId` vs `CorrelationId` across log types
- **Defender XDR Advanced Hunting can't join Sentinel tables with XDR tables**

## Process
- **Set up memory BEFORE doing real work** — or you lose early context
- **Start small, prove the model, then scale** — don't give full access on day one
- **The heartbeat is what makes the bot proactive** — without it, it just waits
- **Group chats > single chat** for multi-project work — prevents context pollution
- **qmD search >> default memory** — faster, more reliable, finds what you need

## Security
- **Separate accounts for everything** — bot gets its own sandbox
- **Two-channel rule works** — authenticated (Telegram) vs information (everything else)
- **Prompt injection is real but manageable** — clear rules + channel differentiation handles it
- **Don't give access you're not ready to lose** — start small, build trust
