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
- WhatsApp: Meta Cloud API via MSG91 BSP (per-agent creds in `agents` DB table).
  Meta App Review + Tech Provider APPROVED (2026-06-22) — launch unblocked; MSG91
  stays until the Meta-direct/Embedded-Signup migration is built & tested.

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
