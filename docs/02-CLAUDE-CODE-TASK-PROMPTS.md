# Elderbot: Claude Code Sequential Task Prompts
# ================================================
# Run these ONE AT A TIME in Claude Code.
# Paste each prompt, wait for completion, paste output back, then proceed.
# These build the first product: "Tech Made Simple" landing page + Stripe + guide.
# ================================================


## PROMPT 1: Project Scaffold
```
Create a new Next.js 15 project for Elderbot's first product called "Tech Made Simple" in ~/elderbot/workspaces/tech-made-simple/. Use the following stack:
- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4
- pnpm as package manager

Initialize the project with:
- A clean layout.tsx with warm, elder-friendly styling (large fonts, high contrast, generous spacing)
- A home page (app/page.tsx) with a placeholder hero section
- A /checkout page stub
- A /success page stub
- A /guide page stub (will hold the actual content later)
- Environment variables loaded from .env.local
- A .env.example with placeholders for STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and NEXT_PUBLIC_BASE_URL

Do NOT install Stripe yet. Just scaffold the project structure. Run pnpm install and confirm it builds with pnpm dev.
```

## PROMPT 2: Landing Page Design
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, build out the landing page (app/page.tsx) with the following sections:

HERO:
- Headline: "Technology Shouldn't Be Scary"
- Subheadline: "Simple, patient guides that help your loved ones (55+) feel confident with their phone, tablet, and computer."
- CTA button: "Get the Guide — $29" (links to /checkout)
- Warm color scheme: deep blue (#1e3a5f) for trust, warm gold (#d4a843) for accents, white backgrounds, large readable text (minimum 18px body)

WHAT'S INSIDE:
- 4 feature cards with icons (use simple SVG or emoji):
  1. "iPhone & Android Basics" — Calling, texting, photos, settings
  2. "Video Calling Made Easy" — FaceTime, Zoom, Google Meet step by step
  3. "Scam Protection" — How to spot and avoid phone, email, and text scams
  4. "Voice Assistants" — Siri, Alexa, Google — hands-free help explained simply

HOW IT WORKS:
- 3 steps: "1. Purchase the Guide" → "2. Get Instant Access" → "3. Share with Your Loved One"

TESTIMONIAL PLACEHOLDER:
- A section for future testimonials with placeholder text

FOOTER:
- "Built by Elderbot — an AI on a mission to help elder communities thrive"
- Link to X/Twitter
- Simple copyright

Design this to feel warm, trustworthy, and accessible. Think AARP website meets Apple simplicity. Large touch targets, no tiny text, no clutter. This is for family members buying for their 55+ loved ones.
```

## PROMPT 3: Install and Configure Stripe
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, install and configure Stripe:

1. Run: pnpm add stripe @stripe/stripe-js

2. Create a Stripe utility file at lib/stripe.ts:
   - Server-side Stripe instance using STRIPE_SECRET_KEY
   - Export the instance

3. Create an API route at app/api/checkout/route.ts:
   - POST handler that creates a Stripe Checkout Session
   - Product: "Tech Made Simple Guide"
   - Price: $29.00 (one-time payment)
   - Success URL: /success?session_id={CHECKOUT_SESSION_ID}
   - Cancel URL: /
   - Mode: payment
   - Metadata: { product: "tech-made-simple-v1" }

4. Create the checkout page at app/checkout/page.tsx:
   - On mount, call the API route to create a session
   - Redirect to Stripe Checkout
   - Show a loading state while redirecting
   - Handle errors gracefully

5. Create the success page at app/success/page.tsx:
   - Thank you message
   - "Your guide is being prepared" message
   - Link to /guide (where they'll access the content)
   - Clean, warm design matching the landing page

Do NOT create the actual guide content yet. Just wire up the payment flow so when someone clicks "Get the Guide — $29" they go through Stripe checkout and land on the success page.
```

## PROMPT 4: Stripe Webhook for Fulfillment
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, add a Stripe webhook handler:

1. Create app/api/webhook/route.ts:
   - Verify the Stripe webhook signature using STRIPE_WEBHOOK_SECRET
   - Handle 'checkout.session.completed' events
   - On successful payment:
     a. Log the customer email and payment amount
     b. For now, just console.log the fulfillment (we'll add email delivery later)
   - Return 200 for handled events, 200 for unhandled (don't error on unknown events)

2. Add STRIPE_WEBHOOK_SECRET to .env.example

3. Create a simple in-memory store (lib/purchases.ts) that tracks:
   - Customer email
   - Session ID
   - Purchase date
   - Access granted (boolean)
   
   This is temporary — we'll add a real database later. For now, this lets us verify the flow works.

4. Update the /success page to check if the session_id in the URL corresponds to a completed payment (call a new API route app/api/verify-purchase/route.ts that checks the session status with Stripe).

5. If verified, show a "Download Guide" button. If not, show "Payment processing..." with a retry option.
```

## PROMPT 5: Create the Guide Content
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, create the actual guide content.

Create a comprehensive guide at app/guide/page.tsx with these chapters. The guide should be rendered as a beautiful, large-print web page (NOT a PDF — web-first, mobile-friendly):

DESIGN RULES:
- Minimum 20px body font
- Maximum 65 characters per line (readable width)
- Generous line height (1.8)
- Clear chapter navigation sidebar (collapsible on mobile)
- Print-friendly CSS (@media print)
- High contrast: dark text on white/cream background
- Every step has a number and is on its own line
- Screenshots described with [Screenshot: description] placeholders
- "Tip" callout boxes in a warm gold background
- "Warning" callout boxes in a soft red background (for scam alerts)

CHAPTERS:

Chapter 1: Your Phone is Your Friend
- Turning it on and off
- The home screen explained
- Making a phone call
- Sending a text message
- Taking a photo
- Adjusting volume and brightness
- Tip: "Don't worry about breaking it — phones are tougher than you think!"

Chapter 2: Video Calling Your Family
- What is video calling? (one paragraph, warm)
- FaceTime (iPhone): step by step
- Zoom: joining a call someone sends you
- Google Meet: joining from a link
- Tips for looking and sounding your best
- Troubleshooting: "They can't hear me" / "They can't see me"

Chapter 3: Protecting Yourself from Scams
- The #1 rule: "If it feels rushed, it's a scam"
- Phone call scams: what they sound like
- Email scams: what they look like
- Text message scams: the telltale signs
- What to do if you think you've been scammed
- Who to call for help (FTC, local authorities)
- Warning: "No legitimate company will ever ask for your password"

Chapter 4: Your Voice Assistant
- What is a voice assistant?
- Siri (iPhone/iPad): how to activate and what to say
- Alexa (Amazon Echo): setup basics and useful commands
- Google Assistant: how to use it
- 10 things to try today (weather, timers, reminders, music, calls)

Chapter 5: Staying Connected
- Group text messages (family group chat)
- Sharing photos with family
- Simple social media: Facebook basics (optional)
- Email basics: reading and replying

BONUS: Quick Reference Card
- One-page summary of the most important steps
- Emergency contacts template
- "Ask for help" script: what to say when calling tech support

Protect this page so only verified purchasers can access it (check against the in-memory purchase store via an API call on page load). Show a "Please purchase the guide first" message with a link to the homepage if not verified.
```

## PROMPT 6: Deploy to Vercel
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/:

1. Initialize a git repo if not already done:
   git init
   git add .
   git commit -m "Initial commit: Tech Made Simple landing page + Stripe checkout + guide"

2. Create a GitHub repo called 'tech-made-simple' under the elderbot GitHub account and push:
   git remote add origin git@github.com:elderbot/tech-made-simple.git
   git push -u origin main

3. Deploy to Vercel:
   - If Vercel CLI is available: vercel --prod
   - Set environment variables on Vercel:
     STRIPE_SECRET_KEY
     STRIPE_PUBLISHABLE_KEY  
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
     NEXT_PUBLIC_BASE_URL
     STRIPE_WEBHOOK_SECRET

4. After deployment, provide:
   - The Vercel URL
   - Instructions for setting up the custom domain
   - Instructions for setting up the Stripe webhook URL (vercel-url/api/webhook)

5. Test the full flow:
   - Visit the landing page
   - Click the CTA
   - Verify Stripe checkout loads (use test mode keys first!)
   - Complete a test purchase with Stripe test card 4242 4242 4242 4242
   - Verify the success page loads
   - Verify guide access works

Report back with the deployment URL and test results.
```

## PROMPT 7: X/Twitter Launch Content
```
Draft 5 launch tweets for the Tech Made Simple product. These will be reviewed by Jesse before posting.

Tweet 1 (Launch announcement):
- Introduce Elderbot and the mission
- Announce Tech Made Simple
- Include the link
- Warm, mission-driven tone

Tweet 2 (Problem statement):
- Talk about the tech gap for 55+ adults
- Statistics if available (or relatable anecdotes)
- Position Tech Made Simple as the solution

Tweet 3 (Scam protection angle):
- Focus on the scam protection chapter
- Highlight a specific tip from the guide
- Urgency without fear-mongering

Tweet 4 (Family angle):
- Target adult children/grandchildren
- "Give your parent/grandparent the gift of confidence with technology"
- Emotional, warm

Tweet 5 (Behind the scenes):
- Elderbot's journey: "I'm an AI building products to help elder communities"
- Transparency about the mission
- Invite people to follow along

Format each tweet with the text and a note about suggested posting time and any images/media to pair with it.
```

## PROMPT 8: Revenue Tracking Setup
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, create a revenue tracking system:

1. Create a script at scripts/check-revenue.ts that:
   - Connects to Stripe API
   - Fetches today's payments for the Tech Made Simple product
   - Fetches all-time payments
   - Calculates: today's revenue, total revenue, total customers, refunds
   - Outputs a formatted summary

2. Create a script at scripts/daily-report.ts that:
   - Runs check-revenue.ts
   - Formats the output as a Telegram-friendly message
   - Includes: daily revenue, total revenue, new customers, any refund requests

3. Make both scripts executable with ts-node or tsx

4. Add to package.json scripts:
   "revenue": "tsx scripts/check-revenue.ts"
   "daily-report": "tsx scripts/daily-report.ts"

These will be called by Elderbot's cron jobs to report revenue to Jesse on Telegram.
```

## PROMPT 9: Final QA and Hardening
```
In the Tech Made Simple project at ~/elderbot/workspaces/tech-made-simple/, do a final QA pass:

1. Accessibility audit:
   - All images have alt text
   - All interactive elements are keyboard-navigable
   - Color contrast meets WCAG AA (especially important for elder audience)
   - Font sizes are minimum 18px body, 16px minimum anywhere
   - Touch targets are minimum 44x44px

2. Mobile responsiveness:
   - Test at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad)
   - Guide sidebar collapses to hamburger on mobile
   - All text readable without horizontal scrolling
   - CTA buttons are full-width on mobile

3. SEO basics:
   - Page title and meta description on every page
   - Open Graph tags for social sharing
   - Structured data (Product schema) on the landing page

4. Error handling:
   - Stripe checkout failure → friendly error message
   - Network issues → retry prompts
   - Invalid session IDs → redirect to homepage

5. Security:
   - No API keys in client-side code
   - Webhook signature verification is working
   - Guide page is properly gated behind purchase verification
   - CORS and CSP headers are reasonable

Fix any issues found and commit with: "QA hardening: accessibility, mobile, SEO, error handling, security"
```
