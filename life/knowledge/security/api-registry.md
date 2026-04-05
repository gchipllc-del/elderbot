# API & Service Registry

## Active Services

| Service | Purpose | Key Location | Permissions | Last Rotated |
|---------|---------|-------------|-------------|-------------|
| Stripe | Payments | ~/.elderbot-secrets/.env | Full API (elderbot account only) | YYYY-MM-DD |
| Vercel | Frontend deploy | ~/.elderbot-secrets/.env | Deploy + DNS | YYYY-MM-DD |
| GitHub | Code repos | SSH key | Push to elderbot org | YYYY-MM-DD |
| Cloudflare | DNS | ~/.elderbot-secrets/.env | DNS edit only | YYYY-MM-DD |
| Railway | Backend deploy | ~/.elderbot-secrets/.env | Deploy | YYYY-MM-DD |
| X/Twitter | Marketing | ~/.elderbot-secrets/.env | Post + Read | YYYY-MM-DD |
| Gmail | Support email | ~/.elderbot-secrets/.env | Read + Draft | YYYY-MM-DD |
| Telegram Bot | Command channel | ~/.elderbot-secrets/.env | Full bot API | YYYY-MM-DD |

## Key Rotation Schedule
- All keys rotated monthly on the 1st
- Rotation logged in daily note
- Old keys revoked immediately after rotation

## Access Rules
- NEVER store keys in git repos
- NEVER hardcode keys in source code
- ALL keys live in ~/.elderbot-secrets/.env
- Load via `source ~/.elderbot-secrets/.env` or `dotenv`
