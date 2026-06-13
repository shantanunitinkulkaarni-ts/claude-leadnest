# Convorian — Master Project Doc (LIVING — read first, update every chat)

*Last updated: June 10, 2026*

> **This is the single source of truth.** Every new chat: read this first, then update it (Done / Pending / Plan) at the end of the session. Deep business plan lives in `files/CONVORIAN_LAUNCH_BLUEPRINT.md`; user memory at `C:\Users\rahul\.claude\projects\C--LN\memory\`.
>
> **What Convorian is:** AI WhatsApp assistant for Indian real-estate agents. Agents connect their WhatsApp; the bot answers, qualifies, nurtures leads & books visits 24/7. SaaS at ₹999/mo. We are a **Tech Provider** (clients connect their own numbers). Category like Wati/Interakt, but niche (real estate) + AI-led.
> **Stack:** Next.js 14 · Supabase (Postgres) · Groq (Llama 3.3 70B) · **Vercel** (hosting) · Razorpay (payments, LIVE) · Resend (email) · Meta WhatsApp Cloud API. Repo: `C:\LN\claude-leadnest` → GitHub `shantanunitinkulkaarni-ts/claude-leadnest`. Live: **https://convorian.in**.

---

## 1. DONE ✅

- **Live** at https://convorian.in (Vercel, SSL). Convorian brand, indigo/violet theme, glassmorphism landing + live AI chat demo.
- **Pages:** home, /login, /onboarding, /privacy-policy, /terms-of-service, /forgot-password, /reset-password. Legal docs render from `files/*.md`.
- **Auth:** Supabase email/password. **Password reset** built (needs Supabase URL config — see Founder tasks).
- **AI bot:** Groq engine (`lib/gemini.ts`). Stages incl. post-visit conversion. **Live on WhatsApp** via Meta Cloud API test number + permanent token. Deliveries confirmed.
- **Payments:** Razorpay **LIVE** + working (real Checkout + server-side signature verification). Keys in Vercel Production (founder-set).
- **Meta:** Business verified (Udyam). App created. Display name "Convorian" approved. Limits raised (2000 biz-initiated/24h). **App Review SUBMITTED** (messaging + management; 2 videos, test calls done). **Tech Provider verification submitted** (~5 day review).
- **Opt-in/consent tracking:** inbound lead = auto opt-in; manual add requires consent checkbox.
- **Logo:** `public/icon.png` (mark) + `public/logo.png` (wordmark). Compressed: 5MB → 316KB PNG + 18KB WebP. Sidebar uses WebP.
- **Security audit done:** upload route auth fixed, agent API never leaks wa_access_token, register endpoint validates inputs.
- **Bot reliability:** Groq failures send polite fallback (never blank message), message dedup by wa_message_id, lead insert null-checked.
- **TS errors:** all fixed. `ignoreBuildErrors` removed from next.config.
- **Error boundaries:** each dashboard screen wrapped — crash in one widget can't blank whole page.
- **Sentry: LIVE.** Code wired + DSN set in Vercel production + deployed. Error tracking active (test/sample error confirmed received). Org `covorian`, EU region.
- **Email (Resend):** `lib/email.ts` — full branded email system (indigo/violet theme, gradient header, CTA buttons, responsive). Welcome email on signup. **convorian.in domain verified in Resend (GoDaddy auto-added DNS records ✅).** Emails now deliver. Supabase Custom SMTP still needs founder action (see Pending).
- **Nurture email sequence:** 6-step lifecycle flow in `lib/nurture.ts` — Day 1 (add first lead), Day 3 (tips), Day 7 (value recap with real counts), Day 14 (upgrade nudge ₹999), Day 21 (follow-up gap), Day 30 (final upgrade). Runs daily via cron. Tracks progress in `agents.nurture_emails_sent`. DB migration applied to production.
- **Dependabot:** weekly npm vulnerability PRs configured (`.github/dependabot.yml`).
- **Mobile:** Sidebar is now a collapsible drawer with hamburger. Dashboard usable on phones.
- **Demo account** (Razorpay + Meta reviewers): demo@convorian.in / ConvorianDemo@2026 (has the WhatsApp test number + sample data).
- **Invoices/receipts (June 11):** Balance screen now has a "Billing history" list (`/api/subscription/invoices`) with per-payment branded printable receipts (`/api/subscription/receipt`, Print→Save-as-PDF, no PDF lib). Backed by existing `subscription_events`; no migration. Labelled payment receipt, not tax invoice (no GST). LIVE.
- **Help/FAQ + support chat (June 11):** `/help` page (FAQ accordion via `lib/faq.ts`, shared chrome) LIVE. Support chat (floating bubble on dashboard + /help) is now real — Groq-grounded on the FAQ KB (`/api/support-chat`), degrades gracefully, and escalates to a human. Escalation surfaces WhatsApp + email (`lib/support.ts`). **WhatsApp number is a PLACEHOLDER** — until `NEXT_PUBLIC_SUPPORT_WHATSAPP` is set in Vercel it shows "WhatsApp support — launching soon" + email (no dead links). One-line swap when the business SIM arrives. LIVE.

## 2. PENDING ⏳

**Gates to first paying client:**
- App Review approval (then can message REAL leads — currently only 5 test recipients)
- Tech Provider approval (for clients to self-connect numbers; concierge onboarding works before this)
- A real WhatsApp number (founder) — **card DONE (Jupiter added to Meta account ✅)** so proactive/template messaging is unblocked once App Review lands
- **₹999 subscription billing** — ✅ **LIVE & TESTED (June 10)**. Founder completed a real UPI Autopay subscription end-to-end in production: Activate button → Checkout → mandate → webhook → status Active. Code: `lib/razorpay.ts`, `app/api/subscription/{create,cancel}`, `app/api/razorpay-webhook`, bot enforcement in `app/api/webhook`, UI in `BalanceScreen`. DB migration applied; webhook + RAZORPAY_PLAN_ID + RAZORPAY_WEBHOOK_SECRET configured in Razorpay/Vercel.
- First clients (outreach — see GTM/consent below)

**Quality/launch-readiness:**
- [x] Opt-in tracking · [x] Password reset · [x] Security audit · [x] Bot reliability · [x] Mobile · [x] Logo compression · [x] Error boundaries · [x] Sentry code · [x] TS errors fixed · [x] Dependabot
- [x] **Deployed** to production (convorian.in). Repo now `vercel link`-ed to project, so future deploys just need `vercel deploy --prod --yes` (logged in as shantanunitinkulkaarni-ts).
- [x] **Sentry DSN** live in Vercel + deployed.
- [x] **Branded email** — `lib/email.ts` built + deployed. Resend domain verified ✅. Nurture sequence live.
- [x] **Supabase Custom SMTP** — DONE (June 10). Auth/reset emails now send from "Convorian" via Resend. Verified by live password-reset test.
- [x] **Uptime monitor** — DONE (June 10). Better Uptime watching https://convorian.in, alerts → support@convorian.in.
- [x] **Daily DB backup (free)** — DONE (June 10). `.github/workflows/db-backup.yml` runs nightly 02:00 IST, pg_dump → GitHub artifact (90-day retention), SUPABASE_DB_URL secret set, test run verified (real 64KB dump). Supabase free plan has no native backups; upgrade to Pro for PITR when revenue allows.
- [x] **Tests + CI** — DONE (June 10). Playwright tests (`npm test`) + GitHub Actions CI (lint/typecheck/tests) on every PR. Process now: branch → PR → CI green → merge.
- [x] **CLAUDE.md briefing rewritten** (June 10) — every session now told to read HANDOFF.md first.
- [x] **Sentry MCP** — ACTIVE. OAuth done, tools live. Org `covorian` (EU region `de.sentry.io`). Checked: only 1 sample test error, no real production errors. Say "check my Sentry errors" anytime.
- [x] **CTO queue (1) Invoice/receipt screen** — DONE & LIVE (June 11).
- [x] **CTO queue (2) Help/FAQ page + support chat** — DONE & LIVE (June 11). Full ticketing/support team is a later phase (founder's call).
- [ ] **NEXT UP (CTO queue): (3) SEO foundation.** Also pending: clean WhatsApp business number (founder) — once the SIM arrives, set `NEXT_PUBLIC_SUPPORT_WHATSAPP` in Vercel (digits only, e.g. 9198xxxxxxxx) to flip the support-chat WhatsApp button live.

**Founder tasks:**
- Supabase → Auth → URL config: Site URL `https://convorian.in`; Redirect URLs add `/reset-password`, `/**`, `localhost:3003/**`
- Resend domain ✅ · Supabase Custom SMTP ✅ (June 10).
- Jupiter card ✅ added to Meta account. Clean WhatsApp number still needed.
- **Security cleanup — ✅ DONE (June 10).** Rotated ALL exposed secrets with zero downtime: GitHub token (removed from git remote, deleted on GitHub, now in Windows Credential Manager vault — git push/pull works via vault; for GitHub REST API calls retrieve token transiently via `git credential fill`), Groq key, Resend key, Supabase DB password (backup secret + Vercel updated), Supabase service-role key (migrated to NEW API key system: publishable `sb_publishable_...` + secret `sb_secret_...`; legacy JWT-based keys DISABLED in Supabase → old leaked key is dead). JWT signing key left untouched (no forced logouts). Local `.env` refreshed via `vercel env pull` — in sync with prod. Twilio skipped (unused). Verified: site 200, bot + DB working on new keys.
- Outreach to warm network (target 10 clients / ₹10k July; ₹999 monthly, skip annual for now)
- **Verify Supabase → Auth → URL config** (founder-only, can't check from code): Site URL `https://convorian.in`, redirects incl `/reset-password`, `/**`.

## SECURITY & COMPLIANCE (June 11 audit)
- **RLS now ON for ALL data tables** + tenant-scoped policies via `team_members`: agents, leads, messages, appointments, properties, wa_transactions, support_chat_logs, subscription_events, demo_rate_limits. (leads/messages/appointments/properties were RLS-OFF — fixed; were not publicly readable as anon/authenticated lacked SELECT, but now defense-in-depth.) App reads via service_role (bypasses RLS) so behaviour unchanged. Migrations: `rls_lockdown_migration.sql`, `rls_tenant_policies_migration.sql`.
- **Security headers** live (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). CSP still PENDING (needs testing vs Razorpay/Sentry).
- **Debug endpoint** `/api/test-integration` now CRON_SECRET-gated (was public).
- **SEO**: robots.txt + sitemap.xml live.
- **Consent**: onboarding now has a required Terms+Privacy+marketing consent checkbox; stored on agents (`consent_terms/consent_marketing/consent_at`). Privacy/Terms have the AI data-use clause. Migration: `consent_trial_migration.sql`.
- **30-day FREE TRIAL live (promo):** onboarding sets `plan_status='trial'`, `messages_limit=500`, `wa_balance=10` (₹10 starter), `plan_expires_at=+30d`. Webhook pauses the bot when a trial lapses (no paid sub). Nurture emails run across the 30 days → upgrade. Paying flips plan_status to 'active' via Razorpay webhook.
- ⏳ **Security PENDING:** CSP header; rate limiting on public routes (register/support-chat); add `middleware.ts` for page-level auth (defense-in-depth); periodic RLS cross-tenant test.

## 3. ENGINEERING MATURITY PLAN (do this properly — phased, not skipped)

> Context: we shipped fast to unblock launch (live, payments, WhatsApp). That was the right call to validate. Now we layer in proper SDLC hygiene **in parallel**. Prioritized for a solo non-technical founder on a budget — high-value/low-cost first; skip true-enterprise overkill.

**Phase A — Stability & Security ✅ COMPLETE:**
- [x] Security audit: upload auth fixed, agent API field-scoped, register validated
- [x] Bot reliability: Groq fallback, message dedup, lead insert null-check
- [x] Error boundaries across all dashboard screens
- [x] TypeScript: all errors fixed, `ignoreBuildErrors` removed

**Phase B — Observability & Safety net:**
- [x] **Sentry** code wired — needs DSN env var (founder action above)
- [x] **Dependabot** configured
- [x] **Uptime monitor** — Better Uptime live (June 10)
- [x] **Daily DB backups** — free GitHub Actions nightly pg_dump live + verified (June 10)
- [ ] **Staging environment** — use Vercel Preview deploys (branch → preview → verify → promote)

**Phase C — Testing & Process:**
- [x] **E2E tests (Playwright)** for the 3 critical flows — `tests/` dir. Smoke tests (landing/login/onboarding/legal render), payment-verify + signup validation guards, demo-bot graceful-degradation + live-reply (auto-skips without GROQ_API_KEY). Run `npm test`. 12 pass locally.
- [x] **CI on PRs** — `.github/workflows/ci.yml`: lint + typecheck + Playwright tests on every PR and push to main. Uploads Playwright report artifact. (Optional repo secrets: NEXT_PUBLIC_SUPABASE_*, GROQ_API_KEY — bot live-test skips if absent.)
- [x] **`npm run typecheck`** script added (`tsc --noEmit`).
- [ ] Deeper unit tests for billing signature HMAC + auth helpers (validation guards covered; happy-path signature still manual/staging)
- [ ] Branching + PR review discipline (stop committing straight to main once stable)
- [ ] CHANGELOG + keep this doc updated

> **Founder setup tasks (10 min total)** now itemized in `SETUP_TASKS.md`: Supabase Custom SMTP + Better Uptime monitor + backup check.

**Phase D — Scale/Maturity (later, when revenue justifies):**
- [ ] Rate limiting on all API routes; security headers (CSP etc.)
- [ ] PostHog product analytics
- [ ] Load testing; structured logging; incident runbook
- [ ] Data retention automation (DPDP); pen test
- [ ] Pvt Ltd + GST when crossing ₹20L / a client demands GST invoice

## 4. BOT ROADMAP (core moat — "gets smarter over time")

Vision (founder): an engine that **learns from conversations and customizes per client** — more relevant, better at closing, over time.
- **Now:** Groq + sophisticated prompt engineering (the IP is the prompting + stage logic).
- **Phase 1:** per-agent context (their properties, tone, areas) already feeds the prompt — deepen this so each client's bot feels tailored.
- **Phase 2:** capture which messages/conversations convert → feed back as few-shot examples per vertical/agent (lightweight "learning" without training).
  - **June 11 progress (support bot):** support-chat prompt overhauled to be empathetic + context-aware (WhatsApp launching-soon, refund handling). **Conversation logging LIVE** — every turn logged to `support_chat_logs` (table created in prod; `support_chat_logs_migration.sql`). This is the data foundation. **NEXT learning step:** retrieve best past answers (or thumbs-up rated ones — `helpful` column exists) as few-shot examples in the prompt. Same pattern can extend to the main WhatsApp lead bot.
- **Phase 3:** fine-tune an open model (Llama/Mistral) on anonymised winning conversations (with consent) → the "Convorian engine".
- ⏳ **PENDING (do at higher volume): few-shot + fine-tuning.** Foundations now in place — conversation logging LIVE + 👍/👎 feedback wired (`support_chat_logs.helpful`) + consent clause in Privacy/Terms (anonymised conversation data to improve AI, opt-out via privacy@convorian.in). Blocked on DATA VOLUME, not engineering: needs real client conversations first. When volume justifies, (1) few-shot the best 👍-rated answers into the prompt, then (2) fine-tune.
- **Data flywheel:** more agents → more conversations → better engine → more conversions → more agents. Protect it.
- Engine name TBD (Converge / Cortex — deferred).

## 5. GTM & CONSENT (critical — don't get banned)

- ⛔ **NEVER** scrape numbers and cold-WhatsApp them with templates → instant ban + kills the WABA. (Ironic for a compliance tool.)
- ✅ Get clients via **other channels** (calls, email, IG/LinkedIn DMs, agent FB/WhatsApp groups, click-to-WhatsApp ads) → they **message you first / sign up** = opt-in → then nurture.
- ✅ Add a **free trial** (e.g., 14 days) — solves "nurture then charge."
- Pricing: **₹999/mo** intro for first 20-30 clients. Annual deferred.
- Positioning: at ₹999, simple + reliable wins — agents don't expect enterprise; it just must work without bugs.

## 6. KEY FACTS / GOTCHAS

- **Deploy:** Vercel git auto-deploy is BROKEN (disconnected since May). Repo is `vercel link`-ed and CLI is logged in as `shantanunitinkulkaarni-ts`. Just run `vercel deploy --prod --yes` from `C:\LN\claude-leadnest` — no token needed while logged in. Token-based fallback: `vercel deploy --prod --yes --token <TOKEN>` with `VERCEL_ORG_ID=team_fzgmEXAaGXYbDzbWWLQAumJl`, `VERCEL_PROJECT_ID=prj_XeAX3KOfjGzNYS1lofHyRUpYhF08`.
- Vercel env changes need a redeploy to take effect.
- WhatsApp creds (phone_number_id, access_token) live **per-agent in the DB** (`agents` table), NOT env. `WHATSAPP_PROVIDER=meta` env (defaults to meta if missing).
- **MSG91 (BSP) — primary route for first 10-20 clients (June 11):** inbound detected per-request by payload shape (provider-agnostic). **Multi-agent routing LIVE:** inbound `integratedNumber` → agent via `agents.msg91_integrated_number` (digits-only; set per agency in the **/admin** panel "WhatsApp #" column). Fallback to `MSG91_TEST_AGENT_ID` env for single-number/founder-SIM setups. Outbound session replies (24h window) go via `sendViaMsg91` using the same integrated number. Env: `MSG91_AUTHKEY`. ⏳ **DEFERRED:** MSG91 proactive/**template** messaging (nurture, appointment reminders, re-engagement, keepalive) still routes via Meta/Twilio only — needs MSG91-approved templates + their template API (test once live number is in MSG91). Core live AI auto-reply does NOT depend on this.
- Don't SELECT `wa_access_token` in queries — safety classifier blocks secret reads.
- "permission denied for table X" = missing Postgres **GRANT**, not RLS.
- **June 13 batch 2 (founder's 16-issue list) — SHIPPED (needs `june13_batch2_migration.sql` applied to prod):** Property add panel: **possession status (ready/under-construction/new-launch/resale) + possession date**, **rental deposit**, optional **project website + AI-consent checkbox** (engine references the site only when consented — see `PROJECT_SITE_AI_PLAN.md` for the fetch phase), free-text **"other highlights"** (hospital/locality) — all fed into the engine prompt for every stage. Engine: **perfect Hindi + Marathi** rules (script + Latin, never mix), and **shares the agent's name+phone+hours when a lead asks for a human** (verified live). Billing: **GPT-style plan cards** (₹999/mo active, ₹799/yr "coming soon" disabled), **downloadable receipts for top-ups** (generalised `/api/subscription/receipt?txn_id=`), **emailed receipt copies** on top-up (payments/verify) and monthly charge (razorpay-webhook). Inbox: **conversations sorted hottest-first**. Global **search wired** (Topbar → leads+properties dropdown → opens lead in inbox via `convorian:open-lead`). **Add-lead consent disclaimer** strengthened (explicit Meta-ban warning, stores `consent_confirmed`). **Support ticketing** (`/api/support-ticket` + `support_tickets` table + form on /help, emails support@convorian.in + acks user). Support bot: anti-repetition + warm closing on "thanks" + **2-step feedback** (rating → optional reason on No / what-you-liked on Yes, stored in `support_chat_logs.feedback_note`); escalation card already fixed earlier. Help/legal **back button → dashboard** for logged-in users (`SmartBackLink`). Tutorial: **off-screen card + step 2-3-4 glitch fixed** (clamped placement, action steps pinned bottom-centre, spotlight no longer flashes to centre between nav). Visit feedback modal + appointment card **alignment fixed**. ⚠️ Marathi-in-Latin-letters is the one soft spot (sometimes replies English) — core Hindi/Marathi script is solid.
- **June 13 mega-batch (founder's 20-issue list) — SHIPPED:** engine: budget figures now exact-rupee rule (was writing ₹2L for "20k rent") + Indian formatting in UI; HARD office-hours guard in webhook (bot can no longer accept 8pm against 9-7 — refuses + offers in-window slot); Inbox auto-scrolls to latest on tab return; per-chat highlight chips (visit booked w/ date, urgent, hot, qualified); ROI dash fixed ("add a lead" no longer shows with leads present; emojis removed; responsive grid); profile menu redesigned (SVG icons, name+email header, deduped Settings/Billing, Help→/help); "WA Balance"→**Billing & Credits**; transaction history now REAL (new `/api/transactions` — was hardcoded `[]`, why ₹5 top-ups never showed); plan card polished; Settings no longer shows "awaiting Meta" to users; Properties no-photo emoji → professional SVG placeholder; feedback saves now check res.ok (silent failures were why "pending" stuck); tutorial rebuilt as persistent animated spotlight (no flash-bang) + replay doesn't re-lock action steps; **new logo/favicon extracted from `One page brochure.png`** (public/icon.png|webp, logo.png|webp, favicon.ico). Support chat: escalation card clears on resume, email button shows address + copies it, end-of-chat feedback replaces per-message thumbs, "launching soon" placeholder removed.
- **⏳ FOUNDER ACTIONS NEEDED (June 13 batch):** (1) **Support WhatsApp number**: set `NEXT_PUBLIC_SUPPORT_WHATSAPP` in Vercel = the 755… number (digits only, e.g. 9175xxxxxxx) + redeploy → WhatsApp button goes live in support chat. (2) **Master-number template alerts**: create+approve a WhatsApp template in MSG91 dashboard (suggested body: `🔴 Convorian — action needed: {{1}} ({{2}}) {{3}}`), then set `CONVORIAN_WA_NUMBER` (the 755 number) + `MSG91_ALERT_TEMPLATE` (template name) in Vercel → alert trio sends from Convorian master number outside 24h window (code path live in lib/alerts.ts + sendViaMsg91Template). (3) Test lead stuck in manual mode from old handover bug — Inbox → toggle "Resume bot".
- **High-priority alert trio (June 13):** `lib/alerts.ts` → `sendHighPriorityAlert(agent, …)` = **email + WhatsApp to the agent** (voice call slot reserved — MSG91 supports calls; only build if we stay with MSG91 post-Meta-approval). Founder rule: ROI-critical events always use the trio. WhatsApp routes per-agent (MSG91 integrated number → else Meta creds) so it survives the MSG91→Meta migration. Caveat: business-initiated WhatsApp outside a 24h session needs an approved template — until templates exist the WhatsApp leg may not deliver (email always paired). Used by the reschedule-handover alert in the webhook.
- **Handover fix (June 13): bot no longer goes silent after 3+ reschedules.** Old behaviour set `lead.bot_paused=true` (troll detection) → lead got NO replies ever again and the agent never noticed (silent activity-log row only). New: bot stays ON, refuses to move the appointment ("team will call to lock the final time"), answers everything else, agent gets ONE email alert (`type='human_handover'` activity row guards against repeats). Engine prompt gets a RESCHEDULING IS LOCKED section (via `reschedulingLocked` ctx, computed from activity_log count). Manual mode (Inbox toggle) still works for agent-initiated takeover. Hedge timer 4s→3s.
- **LLM engine (June 13 v2): GLM ONLY.** Founder decision: Gemini REMOVED (dead key, needs ₹1000 prepaid) and Groq REMOVED from all customer-facing paths (100k tokens/day free cap → mid-day canned replies to real leads; "not reliable"). Single provider: **GLM-4.5-Flash via `lib/llm.ts` (`glmChat`)** — used by the lead bot (`lib/gemini.ts`), support chat, and landing demo chat. Reliability = **hedged requests**: if the first GLM call hasn't answered in 4s, a parallel duplicate fires and the faster one wins (free-tier latency is spiky: median ~2s, ~1 in 8 calls stalls 12s+). Benchmarked: median 1.9s, max 3.0s over 10 calls. If BOTH attempts fail the webhook sends the polite canned fallback (rare). Groq now exists ONLY as the offline eval judge (`npm run eval` — dev tool, never customer-facing). `GROQ_API_KEY`/`GEMINI_API_KEY` can stay in Vercel (unused by runtime).
- **LLM engine (June 13): GLM PRIMARY.** Chain is now **GLM-4.5-Flash (Z.ai, free, `GLM_API_KEY`, thinking disabled) → Gemini (if key) → Groq**. Gemini key is DEAD (401 ACCOUNT_STATE_INVALID — founder declined ₹1000 prepaid; key kept as middle fallback in case it's ever fixed). Only `glm-4.5-flash` is free on the Z.ai key (other models 429 "recharge"). **CRITICAL PROMPT FIX (June 13): property inventory now in the prompt for ALL stages** — it was only in the `presentation` stage, so in every other stage the bot literally couldn't see prices and FABRICATED them (e.g. quoted ₹75L for a ₹95L flat). Verified 5/5 exact-price accuracy after fix. Also added "prices are sacred / inventory is complete" rules. **Vercel functions pinned to Tokyo `hnd1`** (vercel.json) — Supabase is ap-northeast-1; was running in US East = 2-3s of DB round-trips per reply. Webhook logs `Webhook Timing: engine took Xms / total Xms`.
- **LLM engine (June 12): MULTI-PROVIDER.** `lib/gemini.ts` → `callEngineLLM()` tries **Gemini Flash (`gemini-flash-latest`, free tier, thinking disabled) PRIMARY**, auto-falls back to **Groq (Llama 3.3 70B)** on any error/ratelimit/empty — so the bot never goes silent. Env: `GEMINI_API_KEY` (set in Vercel prod + .env as `Gemini_API_KEY`; code reads both). Plan: enable Gemini PAID billing (₹1000) at 5 paying clients (removes free-tier privacy caveat); later swap to Haiku/Sonnet (1-line provider add) if funds permit. `lib/whatsapp.ts` supports Meta + Twilio + **MSG91 (primary BSP)**.
- **EMAIL WAS FULLY BROKEN — FIXED (June 13):** `RESEND_FROM_EMAIL` still pointed at the dead **`leadnest.in`** domain (pre-rebrand), so EVERY transactional email 403'd silently — welcome, password reset, payment receipts, support tickets, nurture. Discovered via the nurture cron. Fixed: Vercel `RESEND_FROM_EMAIL` → **`Convorian <noreply@convorian.in>`** (convorian.in is the verified Resend domain) + redeploy. Confirmed emails now SEND. Also fixed a `failCount` regex bug in `lib/nurture.ts` (a `\d` collapsed to literal `d` in a template literal → fail markers stuck at `#fail1`, retried a bad send forever) — now string-parsed + bounded to 3 attempts, and the throw path is caught. Note: Resend free tier can 429 under burst; fine at normal cadence.
- **NURTURE / FOLLOW-UPS — PHASE 1 LIVE (June 13):** The bot now CHASES quiet leads. `generateNudge()` (lib/gemini.ts) writes ONE contextual, non-repeating re-engagement message; `/api/cron` sends them at **3h (soft) / 10h (value) / 23h (window-save)** after the lead's last message, only while the **24h window is open** (free-text, no template needed), only in **IST quiet hours 9 AM–8 PM**, max 3/window, never if it's the lead's turn. Counter resets on any inbound (webhook). **Provider-aware** via `sendToLead()` (MSG91 if `msg91_integrated_number` else Meta) — so it works for MSG91 clients (the old keepalive only worked for Meta). Appointment reminders + post-visit prompts also made provider-aware. **Opt-out**: webhook detects STOP/unsubscribe (tightened regex, EN+Hindi+Marathi) → `opted_in=false`, `nurture_state='opted_out'`, bot silenced + farewell sent. **Cadence driver = `.github/workflows/nurture-cron.yml` (every 15 min, free)** — Vercel Hobby's 1/day cron can't do this. ⚠️ FOUNDER: add **`CRON_SECRET`** repo secret (GitHub → Settings → Secrets → Actions, same value as Vercel's CRON_SECRET) or the Action fails. Migration: `nurture_migration.sql` (leads: `last_nudge_at`, `window_nudge_count`, `nurture_state`). ⏳ Phase 2 (outside-window Day3/7/14 re-engagement) needs approved templates — see below.
- **Webhook double-reply bug FIXED (June 12, PR pending):** root cause = Meta/MSG91 webhook retries + non-atomic message dedup + webhook had no `maxDuration` (Gemini's 25s timeout exceeded Vercel's default → killed mid-run → provider retried → two replies, one being the canned "Thank you for reaching out" fallback). Fix: `maxDuration=60` on webhook, Gemini timeout 25s→12s, atomic dedup via partial unique index on inbound `wa_message_id` (`messages_dedup_migration.sql` — MUST be applied to prod), robust engine reply/JSON parser (`parseEngineResponse`, handles code fences/multi-line JSON, unit-tested), outbound wa_message_id stamped by row id (old `.update().order().limit()` was a no-op ordering), office-hours check now IST not UTC. ⚠️ ALSO FOUND: **Groq free tier 100k tokens/day was EXHAUSTED on June 12** — when Gemini fails AND Groq is rate-limited the canned fallback fires; eval lab runs eat this budget fast. Consider Groq Dev Tier or running evals sparingly.
- **Prompt-training lab:** `npm run eval` (EVALS.md) runs the real engine prompt vs ~9 scenarios with an AI judge — run after any prompt change. Engine roadmap in `ENGINE_ROADMAP.md`; issue backlog (6 batches) in user memory.
- Vercel Hobby: cron max once/day (set `0 9 * * *`); deployment protection was disabled.
- Entity: individual/sole-proprietor, no GST. Razorpay onboarded as individual.
- Razorpay: real UPI QR only works in LIVE mode; test mode uses `success@razorpay`.
- AWS App Runner was set up then abandoned (account stuck activating; Vercel chosen). Workflow is manual-only.
