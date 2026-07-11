# Convorian — Operations Runbook

*The "if Shantanu is unavailable" / "how do I operate this" doc. Plain language.
Keep updated. No secrets live in this file — only where to find them.*

## What this app is
Convorian — AI WhatsApp assistant for Indian real-estate agents. Live at
**https://convorian.in**. Next.js 14 app on Vercel, Postgres on Supabase, code on GitHub.

## The services it runs on (and what each does)
| Service | Used for | Where to log in |
|---------|----------|-----------------|
| **Vercel** | Hosting + deploys + env vars | vercel.com (CLI already logged in on this machine) |
| **Supabase** | Database (leads, agents, messages…) + login/auth | supabase.com |
| **GitHub** | Code repo `shantanunitinkulkaarni-ts/claude-leadnest` | github.com |
| **Razorpay** | Payments (₹999 subscriptions, wallet) — LIVE | dashboard.razorpay.com |
| **Resend** | Outbound email (confirmations, nurture) | resend.com |
| **MSG91** | WhatsApp messages (BSP) | msg91.com |
| **Meta / WhatsApp** | WhatsApp Business Platform (Tech Provider) | developers.facebook.com / business.facebook.com |
| **Sentry** | Error tracking (org `covorian`, EU region) | sentry.io |
| **BetterUptime** | Uptime monitoring | betteruptime.com |

All API keys/secrets live in **Vercel → Project → Settings → Environment Variables**
(Production). They are NOT in the code. `DATABASE_URL` (direct Postgres) is there too.

## Deploying a change
```
# from C:\LN\claude-leadnest
npm run typecheck        # must be clean
vercel deploy --prod --yes
```
Vercel git auto-deploy is OFF — you must run the command. **Env var changes need a
redeploy** to take effect.

## 🔴 EMERGENCY: revert to the last known-good version
A stable checkpoint is tagged in git: **`stable-2026-06-22`**.
```
git checkout stable-2026-06-22      # inspect, or branch off it
# to put production back to it:
git checkout -B hotfix-revert stable-2026-06-22
vercel deploy --prod --yes
```

## Setting an environment variable (there's a gotcha)
Piped input stores EMPTY. Always use `--value`:
```
vercel env rm NAME production --yes
vercel env add NAME production --value "the-value" --yes
vercel deploy --prod --yes
```
Sensitive vars can't be read back (`vercel env pull` shows blank) — that's normal.

## Database
- Console: Supabase → SQL Editor. Direct connection string is `DATABASE_URL` in Vercel.
- **Backups:** nightly via GitHub Actions (`.github/workflows/db-backup.yml`).
- **Migrations:** SQL files in `db/migrations/`. Apply DDL via Supabase SQL Editor, or a
  `pg` client using `DATABASE_URL` (PostgREST can't run `ALTER TABLE`).

## Common operations
- **Pause a misbehaving agent's bot:** set `bot_active = false` on their `agents` row
  (Supabase → Table editor → agents).
- **Reset/clear test data:** delete in FK-safe order — `wa_transactions` → `appointments`
  → `messages` → `activity_log` → `leads`.
- **Check why a customer didn't get an email:** Resend → Emails → open it → see status
  (Delivered/Bounced). Needs `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set.
- **Check the bot's brain:** primary LLM is Groq (`lib/llm.ts`), fallback GLM. If the bot
  goes quiet, check Groq/GLM key validity and Sentry for errors.

## 🚨 If you suspect a breach / compromise
1. **Rotate keys immediately** (Supabase service-role + anon, Razorpay, Resend, MSG91,
   GROQ/GLM, CRON_SECRET) — regenerate in each dashboard, update Vercel, redeploy.
2. **Lock affected accounts** — set `bot_active=false`, and in Supabase Auth disable the
   user(s); force password reset.
3. **Pull access logs** from Supabase + Vercel; check Sentry for anomalies.
4. **Notify** affected agents (DPDP breach-notification duty). Grievance officer: **Shantanu**.
5. Restore from the latest clean backup if data was tampered.

## Key code rules (don't break these)
- All API routes start with `export const dynamic = "force-dynamic"`.
- Never `SELECT wa_access_token`.
- Supabase client is lazy-init — never `createClient()` at module top level.
- Never put secrets in client code or `NEXT_PUBLIC_*`.
- Never commit straight to main without typecheck; revert tag exists if needed.

## Contacts
- Founder / Grievance Officer: **Shantanu** — support@convorian.in / WhatsApp +91 7559197426
- Superadmin alerts go to: support@convorian.in (+ WhatsApp 917559197426)
