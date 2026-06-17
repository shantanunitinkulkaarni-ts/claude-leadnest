# LAUNCH-READY checklist & runbook

*Session 10 work — security hardening + ops runbook. See HANDOFF.md history for prior context.*

This doc has two parts:
1. **Deploy-this-now**: what shipped in this session and how to push it live.
2. **Runbook**: copy-paste recipes for the 6 incidents most likely to wake you up at 2am.

---

## 1. Deploy this session's changes

### What changed (5 files)

| File | What | Why |
|---|---|---|
| `middleware.ts` | Removed `\|\| SUPABASE_SERVICE_ROLE_KEY` fallback on the anon-key line. | Misconfig was silently auth-bypassing into the service role. Now fails loudly. |
| `lib/supabase.ts` | Removed hardcoded Supabase URL + publishable-key fallback in `getSupabase()`. | A forked deploy would have leaked traffic to prod Supabase. CLAUDE.md said "no defaults"; now enforced. |
| `next.config.js` | Added `Content-Security-Policy-Report-Only` header. | Last item on the SECURITY PENDING list. **Report-Only is intentional — monitor for one week, then promote to enforce.** |
| `app/api/auth/register/route.ts` | IP rate limit (5/min) before any DB write. | Signup-spam / credential-stuffing guard. |
| `app/api/support-chat/route.ts` | IP rate limit (20/min) before LLM call. | Stops one bad actor draining GLM credits + bloating `support_chat_logs`. |
| `lib/schema.sql` | Added "STALE — do not bootstrap from this" header. | Half the live schema is in migration files, not here. Prevents anyone using it to seed a fresh DB and getting a broken state. |

### Deploy steps (founder, ~5 min)

```bash
# from C:\LN\claude-leadnest on your Windows machine

# 1. Pull the branch Emergent pushed (or apply the patch if you cloned this sandbox)
git pull origin <branch-name>

# 2. Local typecheck (sanity)
npm run typecheck
npm test                              # Playwright unit specs (~30s)

# 3. Deploy
vercel deploy --prod --yes

# 4. After deploy, verify
#    - Open https://convorian.in → page loads (CSP-RO doesn't break anything visually)
#    - Open DevTools → Console → look for any CSP violation reports. Note them.
#    - Try signup with bogus data 6x in a row → 6th should 429.
#    - Try support chat 21x in a minute → 21st should soft-degrade.
```

### After 1 week of clean Sentry / CSP-violation reports

Promote CSP from Report-Only to enforce:

```js
// next.config.js, in the security headers array
{ key: 'Content-Security-Policy', value: csp }  // (was Content-Security-Policy-Report-Only)
```

---

## 2. RUNBOOK — when things break

### 2.1 "Bot went silent"

**Symptom:** Leads message in, no reply.

```bash
# 1. Did the inbound even reach us?
#    Vercel → Logs → filter "/api/webhook"
#    Look for: 200 ok / 403 (auth header missing) / 500

# 2. If 403:
#    MSG91 dashboard → Webhook settings → confirm header
#    x-webhook-secret == process.env.MSG91_WEBHOOK_SECRET in Vercel

# 3. If 500:
#    Sentry → recent issues. Most likely culprits:
#    - Supabase down (status.supabase.com)
#    - GLM down → should auto-failover to Cerebras (see lib/llm.ts)
#    - Both down → bot sends polite canned fallback (by design)

# 4. If 200 but no outbound:
#    MSG91 dashboard → message log. Check delivery webhook status
#    on /api/webhook/status (Vercel logs filter for [delivery-status]).
```

### 2.2 "Razorpay charge failed / subscription stuck"

```bash
# 1. Razorpay dashboard → Subscriptions → search by customer email
# 2. Status meanings:
#    - active        → all good
#    - halted        → 3 failed UPI debits in a row. Bot is auto-gated off
#                      (lib/webhook checks plan_status). Email customer.
#    - cancelled     → keep access until plan_expires_at, then auto-gate.
#    - pending       → mandate not yet authorised. Resend Checkout link.

# 3. If a charge succeeded in Razorpay but plan_expires_at didn't extend:
#    The razorpay-webhook didn't fire / signature failed. Check Vercel logs
#    for "/api/razorpay-webhook" + Sentry. Verify webhook URL in Razorpay
#    dashboard = https://convorian.in/api/razorpay-webhook and
#    RAZORPAY_WEBHOOK_SECRET matches.
```

### 2.3 "Photos not delivering"

```bash
# This is the recurring bug class. Sequence to debug:

# 1. Check property has media in the RIGHT column:
#    Supabase → properties → find row → look at property_media (NOT features).
#    If media is in features, the engine prompt won't see it.
#    Fix: POST https://convorian.in/api/admin/convert-media (CRON_SECRET header)

# 2. Check format. WhatsApp/Meta SILENTLY DROP avif/heic/webp/tiff.
#    Only JPEG/PNG deliver. Edit property → re-upload as JPEG.

# 3. Check the env flag actually has a value:
#    vercel env ls | grep MSG91_MEDIA_LIVE
#    Must be "true" (literal string). Empty = block won't run.
#    Bug to remember: piped-stdin sets empty silently — always use --value "true".

# 4. Check delivery status:
#    Vercel logs filter [delivery-status]. If you see "failed" with a Meta error
#    code → look up the code, usually a format / size / template issue.
```

### 2.4 "permission denied for table X"

```sql
-- ALWAYS the same fix: service_role missing GRANT.
-- Run in Supabase SQL editor:
GRANT ALL ON TABLE public."<table_name>" TO service_role;

-- Or apply the catch-all from this repo:
-- (sets default privileges so EVERY future table inherits the grant)
\i service_role_grants.sql
```

This should be a one-shot fix (we ran service_role_grants.sql in session 9).
If you see this error again, a new table was created without the
ALTER DEFAULT PRIVILEGES inherit working — re-run service_role_grants.sql.

### 2.5 "Key rotation"

```
Order of operations (do all in one ~15 min window to minimize downtime):

1. Generate new key in the source provider:
   - Supabase: Dashboard → API → roll the SECRET key (sb_secret_...).
                Publishable (sb_publishable_) almost never needs rotation.
   - Razorpay: Settings → Keys → Generate new live key. Old keeps working
                for 24h grace.
   - Resend:   API Keys → Create new → revoke old after step 3.
   - MSG91:    Auth Keys → revoke + regenerate.
   - GLM/Cerebras: provider dashboard → regenerate.

2. Update Vercel env:
   vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production --value "<new>"
   # repeat per key

3. Redeploy:
   vercel deploy --prod --yes

4. Verify:
   - Open https://convorian.in/login → load
   - Send a test WhatsApp → bot replies
   - Razorpay test charge (Razorpay docs: 4111... on a test plan)

5. Revoke old key in provider dashboard.

6. Update local .env:
   vercel env pull
```

### 2.6 "Migration rollback"

You don't have a real migration tool yet, so rollbacks are by hand.

```sql
-- 1. Identify the most recent migration file applied (check
--    your "applied migrations" list — you're tracking this somewhere, right?
--    If not: start a `applied_migrations` table TODAY.)

-- 2. Each migration file at the repo root should have a paired DOWN.sql
--    inline as the bottom comment. If it doesn't, you can:
--      - DROP TABLE / ALTER TABLE ... DROP COLUMN by hand based on the UP.
--      - Or restore from the nightly pg_dump artifact:
--        GitHub → Actions → db-backup workflow → download latest artifact
--        psql $SUPABASE_DB_URL < backup.dump

-- 3. Test the rollback on a dev Supabase project FIRST, never on prod blind.
```

---

## 3. Still-open launch blockers (NOT in this session)

These need founder action or external approval:

| # | Item | Who | Status |
|---|---|---|---|
| 1 | Meta App Review approval | Meta | Submitted, waiting |
| 2 | Tech Provider approval | Meta | Submitted, ~5 day review |
| 3 | Merge PR #72 (bot stage/lang/nudge) | Founder | CI green; just merge + deploy |
| 4 | Merge PR #93 (image→JPEG) | Founder | Deployed to prod, not merged to main |
| 5 | Enable Vercel Fluid Compute | Founder | Settings → Functions → toggle |
| 6 | MSG91 delivery webhook URL | Founder | `https://convorian.in/api/webhook/status` |
| 7 | Clean up old AVIF photos | Founder | Edit UI or `/api/admin/convert-media` |

---

## 4. Engineering-maturity backlog (not launch-blocking)

For after the first 10 paying clients, when revenue justifies engineering time:

1. **Supabase CLI migrations** — fold the 27 `*.sql` files at repo root into `supabase/migrations/` with timestamps. Drop the unused `lib/schema.sql`.
2. **Generated DB types** — `supabase gen types typescript > types/db.ts`. Remove the 16 `as any` casts in the codebase.
3. **Split the 846-line webhook** — orchestrator + step modules. No behaviour change, just testable seams.
4. **Rename `lib/gemini.ts` → `lib/engine.ts`** — the file is the prompt engine, not Gemini code.
5. **Persistent rate limiter** — Upstash/Redis when single-instance cap stops being enough.
6. **Queue for outbound WhatsApp sends** — decouple from the webhook's 60s budget.
7. **Promote CSP from Report-Only to enforce** (after 1 clean week).
8. **Staging environment** — second Supabase project + Vercel preview-branch convention.
