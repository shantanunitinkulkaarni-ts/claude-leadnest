# Convorian — Claude Code Briefing

## FIRST THING, EVERY SESSION
Read `HANDOFF.md` before doing anything. It is the single source of truth
(status, pending work, decisions, gotchas) and must be updated at the end of
every working session. This file is only the door sign; HANDOFF.md is the brain.

## What is this
Convorian (formerly LeadNest): AI WhatsApp assistant SaaS for Indian real-estate
agents. ₹999/month. The bot answers, qualifies, nurtures leads and books site
visits 24/7. Live at https://convorian.in

## Owner
Shantanu — non-developer founder. You are the sole developer (CTO role).
- Use SIMPLE language, no jargon. Explain like to a smart non-technical person.
- Be autonomous on small things; ask before production-changing actions.
- Be conservative with tokens/credits (founder is on Pro plan).

## Stack (current — do not trust older notes)
- Next.js 14 (App Router, TypeScript) · Supabase Postgres
- LLM: **Groq (`llama-3.3-70b-versatile`) primary → GLM-4.5-Flash (Z.ai) fallback** —
  chain in `lib/llm.ts` (`callLLM`, Groq hedged → GLM one-shot). DeepSeek removed
  (balance hit zero); Cerebras retired from the live path (5 req/min free cap too
  low). Gemini/Claude/Anthropic are NOT in the live path. `lib/gemini.ts` is the
  legacy filename for the prompt engine. **The live WhatsApp bot is `lib/ai-bot.ts`
  (`handleAiBotMessage`)** — AI-first: AI decodes intent, CODE does every fact
  (search/present/book). AI never types a property fact.
- Hosting: **Vercel** (the old Google Cloud Run / gcloud deploy is ABANDONED)
- Payments: Razorpay LIVE — wallet top-up + ₹999/mo subscriptions (UPI Autopay)
- Email: Resend via REST (`lib/email.ts` `sendEmail`) — needs `RESEND_API_KEY` +
  `RESEND_FROM_EMAIL` (`noreply@convorian.in`, domain verified). Do NOT use the
  `resend` npm package (not installed). · Errors: Sentry (org `covorian`, EU)
- WhatsApp: **Meta Cloud API DIRECT (Tech Provider) — MSG91 stripped from the live
  bot path (2026-06-23).** Per-agent creds in `agents` table: `wa_phone_number_id`
  + `wa_access_token`. Inbound webhook `/api/webhook` verifies Meta's
  `X-Hub-Signature-256` (`WHATSAPP_APP_SECRET`) + GET verify token
  (`WHATSAPP_VERIFY_TOKEN`). Bot replies on the same channel via `waSendText`/
  `waSendMedia` (`lib/whatsapp.ts`). **PROVEN working end-to-end on a Meta test
  number** (`+1 555-664-3873`). Gotchas learned: a phone number needs `/register`
  (with a 6-digit PIN) before it can send; the WABA must be subscribed to our app
  (`POST /{WABA}/subscribed_apps`) or inbound is silently dropped; the app must be
  Published (Live) for real inbound delivery.
  - Still on MSG91 templates (peripheral, NOT the live chat): nurture cron, reminders,
    alerts, manual reply — convert to Meta templates once those are approved.
  - **Embedded Signup BUILT** (self-serve onboarding): `components/ConnectWhatsAppButton.tsx`
    (FB JS-SDK v4 popup, Configuration ID `27137467672622588`) → `/api/meta/onboard`
    + `lib/metaOnboard.ts` (exchange code → subscribe WABA → IN storage → register →
    save creds). Env: `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`,
    `WHATSAPP_APP_SECRET`. Gotcha: Facebook-Login-for-Business → "Login with the
    JavaScript SDK" must be ON + `https://convorian.in` in Allowed Domains.

## Nurture engine (the moat — see memory: nurture-engine-moat)
- **Decision layer = `lib/nurtureFlow.ts`** — the founder's tested **A/B/C/D** timeline
  (in-window 3/6/12/23h nudges → Plan A→B→C→D post-window, quiet hours, send slots).
  Pure/unit-tested. Executed by the cron's `runNurtureFlowV2` (gated by `NURTURE_FLOW_V2`,
  currently OFF). In-window sends via Meta (`sendToLead`); post-window still calls MSG91
  templates → **must be re-pointed to Meta templates** (pending Meta template approval).
- **New data/moat layer (built):** the bot silently profiles each lead (`leads.personality`,
  via `personality_cues` in `lib/ai-bot.ts` — never shown to the customer) + records
  `engagement` signals; `nurture_events` is the learning log. `lib/nurtureEngine.ts` =
  personality→angle **enrichment** (`pickAngle`/`personalityBrief`), NOT a decision engine.
- **A lead reply MUST reset** `window_nudge_count`/`nurture_plan`/`plan_d_touches` (done in
  `lib/ai-bot.ts`) or the timeline silently breaks. Posture: consent-tiered, protect the
  agent's number above any single lead; goal = sale or clean stop.

## Deploy
Vercel git auto-deploy is DISCONNECTED. Deploy manually:
`vercel deploy --prod --yes` from repo root (CLI already logged in).
Vercel env var changes need a redeploy to take effect.
- Setting env vars: `vercel env add NAME production --value "..." --yes` (piped
  stdin stores EMPTY — a real gotcha). Sensitive vars can't be read back via
  `vercel env pull` (return blank) — add `--no-sensitive` if you need to verify.
- DB migrations: `DATABASE_URL` is in Vercel env; apply DDL with a `pg` client
  (e.g. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`). PostgREST can't run DDL.

## STABLE CHECKPOINT
**Tag `stable-2026-06-22` (commit on main) is the most stable, fully-working
version** — booking + reschedule/cancel, IST date/time, office hours + weekly
day-off, confirmation emails (customer/agent/superadmin), troll kit, Groq LLM.
**If something breaks, revert here:** `git checkout stable-2026-06-22` (or reset
a branch to it), then redeploy. Pushed to GitHub origin.

## Process
- Never commit straight to main: branch → PR → CI green → merge (founder approves).
- Tests: `npm test` (Playwright) · typecheck: `npm run typecheck` · lint: `npm run lint`
- CI runs on every PR. Nightly DB backup runs via GitHub Actions (db-backup.yml).

## Key code rules
- All API routes: `export const dynamic = "force-dynamic"` at top.
- Supabase client uses lazy init — never call createClient() at module level.
- Never SELECT `wa_access_token` in queries.
- NEVER expose API keys/secrets in client-side code.

## Gotchas
- "permission denied for table X" = missing Postgres GRANT, not RLS.
- Vercel Hobby plan: cron max once/day.
- Don't pause/break the demo account (demo@convorian.in) — Meta reviewers use it.
- Razorpay: real UPI works only in LIVE mode; test mode uses success@razorpay.

## Business context
- ₹999/mo vs competitors (Wati, Interakt, Wise Parrot ₹5K/mo). Edge: AI conversion
  engine + real-estate niche. Target: Indian agents, first 10 clients via warm network.
- Pre-revenue and **NOT launched — zero real users**; everything live is testing
  only (ignore stray "15,000 agents" notes). Meta App Review + Tech Provider are
  now APPROVED, so launch is unblocked; first real onboarding = the actual launch.
