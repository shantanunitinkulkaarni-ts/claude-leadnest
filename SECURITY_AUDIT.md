# Convorian — Security Audit (read-only review)

*Date: 2026-06-22 · Scope: data isolation, auth, secrets, engine confidentiality,
headers, rate limiting. This is a code review, not a penetration test.*

> **Honest framing:** no app is "unbreachable" — not banks, not Meta. The real goal
> is **defense-in-depth**: make a breach hard, detect it fast, contain the damage.
> Against that bar, Convorian is in **good shape for a pre-launch product** — better
> than typical. Findings below are mostly hardening, not active holes.

## ✅ What's already solid

1. **Per-agent data isolation is enforced at the API layer.** Every sensitive route
   (`leads`, `messages`, `appointments`, `properties`, `knowledge-gaps`) calls
   `requireAgentAccess` / `requireLeadAccess` etc. (`lib/apiAuth.ts`), which checks the
   logged-in user owns that agent via `team_members`, or is a superadmin. Agent A
   cannot read Agent B's leads.
2. **The secret AI engine never reaches the browser.** No client component imports
   `lib/ai-bot`, `lib/gemini`, `lib/llm`, or `lib/botGuards`. The prompt/logic — your
   moat — stays server-only.
3. **No secrets exposed client-side.** Only safe values are `NEXT_PUBLIC_*`
   (Supabase URL + anon key, Sentry DSN, support number). The service-role key is
   server-only. The middleware explicitly refuses to fall back to the service-role key.
4. **No secrets in git.** `.gitignore` covers `.env*`, `*.env.yaml`, `.vercel`. Only
   `.env.example` is tracked.
5. **Webhooks are verified.** Razorpay webhook checks the HMAC signature over the raw
   body before trusting anything. MSG91 status webhook uses a shared-secret token.
6. **Routes are protected.** Middleware redirects unauthenticated users away from
   `/dashboard` and `/admin`. Passwords are handled by Supabase Auth (managed/hashed).
7. **Security headers present:** HSTS (preload), X-Frame-Options, X-Content-Type-Options
   nosniff, plus a CSP. Rate limiting on `/api/auth/register` and `/api/support-chat`.

## ⚠️ Findings & recommendations (priority order)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | ~~RLS has no policies~~ **RESOLVED — the audit was misled by a stale `schema.sql`.** The live DB already had correct tenant-scoped policies on leads/messages/appointments/properties (`agent_id ∈ the user's team_members`). Migration 09 added the same to wa_transactions/activity_log/knowledge_gaps, so the second wall is now **uniform** across all sensitive tables. `schema.sql` updated to match. | ✅ Done | — |
| 2 | **`MSG91_STATUS_SECRET` may be unset** → the delivery-status webhook is open, so anyone could POST fake "delivered/failed" reports. | Low | Set `MSG91_STATUS_SECRET` in Vercel + add `?token=` in the MSG91 dashboard. |
| 3 | **CSP is Report-Only** (not enforced). | Low | After a clean week of reports, switch the header to `Content-Security-Policy`. |
| 4 | **No 2FA** on agent logins. | Medium (pre-launch) | Bucket B — add 2FA + the breach **account-lockdown** (lock after N failed / anomalous logins). |
| 5 | **No audit logging** of who accessed which leads. | Medium | Bucket B/C — also a DPDP expectation. Log read/export of lead data. |
| 6 | **Backup restore never tested.** Nightly backups exist (GitHub Action) but an untested restore = no real DR. | Medium | Bucket B — do one test restore to a scratch DB. |

## Not done (correctly deferred)
- **Penetration test** — costs money, revenue-dependent. The above is a self-review, not a pen test.
- Secret-rotation cadence, formal incident-response doc — Bucket B/C.

## Bottom line
The foundations (data isolation, secret handling, engine confidentiality, webhook
verification) are **correct**. The open items are hardening layers, not gaping holes.
Prioritise: **(1) RLS policies**, **(4) 2FA + lockdown**, **(6) restore test** before
real customer data lands.
