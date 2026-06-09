# Phase B — Founder Setup Tasks

**Status: COMPLETE** (uptime ✅ · SMTP ✅ · backups = see note) | Last updated: June 9, 2026

## Completion notes (June 9)
- ✅ **Uptime monitor** — Better Uptime live on https://convorian.in, alerts → support@convorian.in
- ✅ **Branded emails** — Supabase Custom SMTP via Resend confirmed: password-reset emails now send from Convorian (noreply@convorian.in). Verified by live test.
- ⚠️ **Backups** — Supabase free plan has NO automatic daily backups. DECISION: acceptable pre-revenue; upgrade to Supabase Pro (~$25/mo, enables daily + PITR) the moment the first paying customer signs, OR build a free daily pg_dump job if staying on free longer.

---


---

## 1. ✅ Sentry MCP (Completed)
- [x] OAuth flow authenticated
- [x] Sentry tools loaded in Claude Code
- [x] Production error tracking confirmed active (1 sample test event only; no real errors)
- [x] Live issues dashboard: https://covorian.sentry.io/issues/

**Next:** Monitor via `Sentry` command in Claude Code or dashboard above.

---

## 2. Supabase Custom SMTP (Email Auth)

**What:** Make password-reset and auth emails say "Convorian" instead of "Supabase" in the from-name.

**How (5 min):**
1. Go to **Supabase Dashboard** → **Auth** → **SMTP Settings**
2. Toggle **Enable Custom SMTP** → ON
3. Fill in:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** (your Resend API key — found in https://resend.com/api-keys)
   - **From Email Address:** `noreply@convorian.in`
   - **From Name:** `Convorian`
4. Click **Save**

**Test:** Trigger a password reset from https://convorian.in/forgot-password and check the email sender.

**Impact:** Branded auth experience; builds trust with new signups.

---

## 3. Uptime Monitor (Status Page)

**What:** 24/7 monitoring of https://convorian.in so you know instantly if it goes down.

**How (3 min):**
1. Go to **https://betteruptime.com** → Sign up (free tier is fine)
2. Create a new **HTTP Monitor**:
   - **Name:** Convorian Site
   - **URL:** `https://convorian.in`
   - **Check frequency:** 5 minutes
   - **Heartbeat monitoring:** ON
3. Add notification channels (email + Slack if you use it)
4. Done — you'll get instant alerts if the site goes down

**Why Better Uptime:** Free, simple, faster than UptimeRobot. Shows pretty status page you can share with customers later.

---

## 4. Supabase Backup Check (Optional but recommended)

**What:** Confirm daily backups are enabled so we don't lose customer data.

**How:**
1. Supabase Dashboard → **Settings** → **Backups**
2. Confirm Point-in-Time Recovery is **enabled**
3. Done — data is safe

---

## Summary of Actions

| Task | Owner | Status | ETA |
|------|-------|--------|-----|
| Sentry MCP | Claude | ✅ Done | — |
| Supabase SMTP | Founder | ⏳ Pending | 5 min |
| Uptime Monitor | Founder | ⏳ Pending | 3 min |
| Supabase Backup | Founder | ⏳ Optional | 2 min |

**Total time to Phase B complete:** ~10 minutes of founder work.
