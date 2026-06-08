# Convorian — Master Project Doc (LIVING — read first, update every chat)

*Last updated: June 8, 2026 (evening)*

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
- **Logo:** `public/icon.png` (mark) + `public/logo.png` (wordmark). Favicon + sidebar wired. ⚠️ files are 5MB each — MUST compress.
- **Demo account** (Razorpay + Meta reviewers): demo@convorian.in / ConvorianDemo@2026 (has the WhatsApp test number + sample data).

## 2. PENDING ⏳

**Gates to first paying client:**
- App Review approval (then can message REAL leads — currently only 5 test recipients)
- Tech Provider approval (for clients to self-connect numbers; concierge onboarding works before this)
- A real WhatsApp number + a **card** on the WhatsApp account (founder getting Jupiter card)
- **₹999 subscription billing** (only wallet top-up exists; recurring plan not built — use Razorpay Subscriptions/Payment Link + manual activation for first 10)
- First clients (outreach — see GTM/consent below)

**Quality/launch-readiness (in progress):**
- [x] Opt-in tracking · [x] Password reset
- [ ] **Security audit + tenant isolation** (NEXT — verify no agent can read another's data)
- [ ] **Bot reliability hardening** (graceful error handling, never send broken msg)
- [ ] Mobile responsiveness
- [ ] **Branded email** (Supabase Custom SMTP via Resend — emails currently say "Supabase", unprofessional)
- [ ] Error tracking (Sentry), uptime (UptimeRobot)
- [ ] Compress the 5MB logo files; finish logo across landing/login/legal
- [ ] Support chat (RAG), SEO foundation

**Founder tasks:**
- Supabase → Auth → URL config: Site URL `https://convorian.in`; Redirect URLs add `/reset-password`, `/**`, `localhost:3003/**`
- Resend: verify convorian.in domain → then Supabase Custom SMTP (branded emails)
- Card (Jupiter) + clean WhatsApp number
- Security cleanup: rotate AWS key, GitHub tokens, Vercel token shown in chat (low priority)
- Outreach to warm network (target 10 clients / ₹10k July; ₹999 monthly, skip annual for now)

## 3. ENGINEERING MATURITY PLAN (do this properly — phased, not skipped)

> Context: we shipped fast to unblock launch (live, payments, WhatsApp). That was the right call to validate. Now we layer in proper SDLC hygiene **in parallel**. Prioritized for a solo non-technical founder on a budget — high-value/low-cost first; skip true-enterprise overkill.

**Phase A — Stability & Security (do NOW, launch-critical):**
- [ ] Security audit: tenant isolation on every API route, auth checks, input validation, no secret leaks, RLS/GRANTs correct
- [ ] Bot reliability: graceful handling of Groq/Meta/DB failures; never send empty/broken messages; retries
- [ ] Error boundaries + friendly error states across the app
- [ ] Fix critical TypeScript errors (currently `ignoreBuildErrors: true` — masks real bugs)

**Phase B — Observability & Safety net (cheap, high value):**
- [ ] **Sentry** error tracking (free tier) — frontend + backend
- [ ] **UptimeRobot** uptime alerts (free)
- [ ] **Staging environment** — use Vercel Preview deploys (a `staging` branch / PR previews) so we test before production. (Currently: commit→main→CLI deploy straight to prod. Move to: branch → preview → verify → promote.)
- [ ] **Dependabot** (free, GitHub) for dependency vulnerability alerts
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
