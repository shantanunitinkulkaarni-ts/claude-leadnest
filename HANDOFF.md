# Convorian — Master Project Doc (LIVING — read first, update every chat)

*Last updated: June 9, 2026*

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
- **Email (Resend):** `lib/email.ts` helper built (REST API, no SDK; fails silently so never breaks signup). Welcome email wired into register flow. From-address fixed to `Convorian <noreply@convorian.in>`. ⚠️ Won't deliver until founder verifies convorian.in domain in Resend.
- **Dependabot:** weekly npm vulnerability PRs configured (`.github/dependabot.yml`).
- **Mobile:** Sidebar is now a collapsible drawer with hamburger. Dashboard usable on phones.
- **Demo account** (Razorpay + Meta reviewers): demo@convorian.in / ConvorianDemo@2026 (has the WhatsApp test number + sample data).

## 2. PENDING ⏳

**Gates to first paying client:**
- App Review approval (then can message REAL leads — currently only 5 test recipients)
- Tech Provider approval (for clients to self-connect numbers; concierge onboarding works before this)
- A real WhatsApp number (founder) — **card DONE (Jupiter added to Meta account ✅)** so proactive/template messaging is unblocked once App Review lands
- **₹999 subscription billing** (only wallet top-up exists; recurring plan not built — use Razorpay Subscriptions/Payment Link + manual activation for first 10)
- First clients (outreach — see GTM/consent below)

**Quality/launch-readiness:**
- [x] Opt-in tracking · [x] Password reset · [x] Security audit · [x] Bot reliability · [x] Mobile · [x] Logo compression · [x] Error boundaries · [x] Sentry code · [x] TS errors fixed · [x] Dependabot
- [x] **Deployed** to production (convorian.in). Repo now `vercel link`-ed to project, so future deploys just need `vercel deploy --prod --yes` (logged in as shantanunitinkulkaarni-ts).
- [x] **Sentry DSN** live in Vercel + deployed.
- [ ] **Branded email** — code side DONE (`lib/email.ts`). FOUNDER must: (1) Resend → Domains → add `convorian.in` → add the DNS records it shows → Verify. (2) For Supabase auth emails: Supabase → Auth → SMTP settings → enable Custom SMTP with Resend creds. Until (1), no emails deliver.
- [ ] **UptimeRobot** (founder: uptimerobot.com → free → HTTPS monitor https://convorian.in, 5-min interval → email/SMS alert)
- [ ] Support chat (RAG), SEO foundation

**Founder tasks:**
- Supabase → Auth → URL config: Site URL `https://convorian.in`; Redirect URLs add `/reset-password`, `/**`, `localhost:3003/**`
- Resend: verify convorian.in domain → then Supabase Custom SMTP (branded emails)
- Card (Jupiter) + clean WhatsApp number
- Security cleanup: rotate AWS key, GitHub tokens, Vercel token shown in chat (low priority)
- Outreach to warm network (target 10 clients / ₹10k July; ₹999 monthly, skip annual for now)

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
- [ ] **UptimeRobot** — founder signs up (5 min)
- [ ] **Staging environment** — use Vercel Preview deploys (branch → preview → verify → promote)
- [ ] Supabase: enable Point-in-Time Recovery / confirm daily backups

**Phase C — Testing & Process:**
- [ ] **E2E tests (Playwright)** for the 3 critical flows: signup/login, payment top-up, bot reply
- [ ] Basic unit tests for billing signature verification + auth helpers
- [ ] CI on PRs: lint + typecheck + tests (GitHub Actions) before merge
- [ ] Branching + PR review discipline (stop committing straight to main once stable)
- [ ] CHANGELOG + keep this doc updated

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
- **Phase 3:** fine-tune an open model (Llama/Mistral) on anonymised winning conversations (with consent) → the "Convorian engine".
- **Data flywheel:** more agents → more conversations → better engine → more conversions → more agents. Protect it.
- Engine name TBD (Converge / Cortex — deferred).

## 5. GTM & CONSENT (critical — don't get banned)

- ⛔ **NEVER** scrape numbers and cold-WhatsApp them with templates → instant ban + kills the WABA. (Ironic for a compliance tool.)
- ✅ Get clients via **other channels** (calls, email, IG/LinkedIn DMs, agent FB/WhatsApp groups, click-to-WhatsApp ads) → they **message you first / sign up** = opt-in → then nurture.
- ✅ Add a **free trial** (e.g., 14 days) — solves "nurture then charge."
- Pricing: **₹999/mo** intro for first 20-30 clients. Annual deferred.
- Positioning: at ₹999, simple + reliable wins — agents don't expect enterprise; it just must work without bugs.

## 6. KEY FACTS / GOTCHAS

- **Deploy:** Vercel git auto-deploy is BROKEN (disconnected since May). Deploy via CLI: `vercel deploy --prod --yes --token <TOKEN>` from repo with `VERCEL_ORG_ID=team_fzgmEXAaGXYbDzbWWLQAumJl`, `VERCEL_PROJECT_ID=prj_XeAX3KOfjGzNYS1lofHyRUpYhF08`. (Or fix the GitHub↔Vercel connection.)
- Vercel env changes need a redeploy to take effect.
- WhatsApp creds (phone_number_id, access_token) live **per-agent in the DB** (`agents` table), NOT env. `WHATSAPP_PROVIDER=meta` env (defaults to meta if missing).
- Don't SELECT `wa_access_token` in queries — safety classifier blocks secret reads.
- "permission denied for table X" = missing Postgres **GRANT**, not RLS.
- `lib/gemini.ts` = Groq now (filename kept). `lib/whatsapp.ts` supports Meta + Twilio.
- Vercel Hobby: cron max once/day (set `0 9 * * *`); deployment protection was disabled.
- Entity: individual/sole-proprietor, no GST. Razorpay onboarded as individual.
- Razorpay: real UPI QR only works in LIVE mode; test mode uses `success@razorpay`.
- AWS App Runner was set up then abandoned (account stuck activating; Vercel chosen). Workflow is manual-only.
