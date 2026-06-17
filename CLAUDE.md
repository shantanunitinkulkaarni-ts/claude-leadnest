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
- LLM: **GLM-4.5-Flash primary → Cerebras (`gpt-oss-120b`) fallback** — chain in
  `lib/llm.ts` (`callLLM`); prompt/engine in `lib/gemini.ts` (filename is legacy).
  Groq, Gemini and Claude/Anthropic are NOT used in the live path.
- Hosting: **Vercel** (the old Google Cloud Run / gcloud deploy is ABANDONED)
- Payments: Razorpay LIVE — wallet top-up + ₹999/mo subscriptions (UPI Autopay)
- Email: Resend (`lib/email.ts`) · Errors: Sentry (org `covorian`, EU region)
- WhatsApp: Meta Cloud API (per-agent creds live in `agents` DB table, not env)

## Deploy
Vercel git auto-deploy is DISCONNECTED. Deploy manually:
`vercel deploy --prod --yes` from repo root (CLI already logged in).
Vercel env var changes need a redeploy to take effect.

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
- Pre-revenue. Waiting on Meta App Review + Tech Provider approval to launch.
