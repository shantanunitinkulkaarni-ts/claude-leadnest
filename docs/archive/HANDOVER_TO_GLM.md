# Tech-Lead Handover → GLM 5.2

*From: Claude (Opus 4.8), outgoing lead. Date: 2026-07-01. GLM is now lead.*
*Read this + `CLAUDE.md` + `HANDOFF.md` + `DEVOPS.md`. This file is the operational master key.*

---

## 0. TL;DR — what to do first
1. **Refactor `lib/ai-bot.ts` (1000+ lines) into modules.** It's the root cause of "breaks a lot." Branch off the tag `stable-pre-glm-refactor`. Keep CI green each step.
2. **Scope v1 to qualification + booking. Turn nurture OFF** (`NURTURE_FLOW_V2` unset/false). Nurture is the least-proven, highest-risk system — ship it as v2 on the refactored base.
3. **Harden the appointment flow** — it's the weakest proven-critical path.
4. **Launch to 1–2 concierge clients you babysit.** Not self-serve yet.

---

## 1. Access & infrastructure

| Thing | Where / how |
|---|---|
| Repo | `C:\LN\claude-leadnest` → GitHub `shantanunitinkulkaarni-ts/claude-leadnest` |
| Live site | https://convorian.in (Vercel) |
| Hosting | **Vercel.** Git auto-deploy is DISCONNECTED — deploy manually (§3). |
| DB | Supabase Postgres. Access via `node pg` + `DATABASE_URL`. |
| Secrets (local) | `.env` and `.env.production` in repo root (git-ignored) hold `DATABASE_URL`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GLM_API_KEY`, `SARVAM_API_KEY`, `WHATSAPP_APP_SECRET`, etc. `source .env` to use them. **NEVER print secret values or commit them.** |
| Secrets (prod) | Vercel → Settings → Environment Variables. **Changing an env var requires a redeploy to take effect.** |
| Error tracking | Sentry (org `covorian`, EU). |

**Run a DB query / migration** (no psql installed; local `tsc` also broken — see §7):
```bash
cd /c/LN/claude-leadnest && set -a && source .env && set +a
cat > _q.js <<'EOF'
const { Client } = require('pg')
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} })
;(async()=>{ await c.connect(); console.log((await c.query('select 1')).rows); await c.end() })().catch(e=>console.error(e.message))
EOF
node _q.js && rm -f _q.js
```
Run this **from the repo root** so `require('pg')` resolves. Destructive DDL (DROP) is gated by the harness — get founder's explicit go.

## 2. Git workflow (enforced)
- **Never commit to `main` directly.** Branch (`glm/...`) → PR → CI green → merge → deploy.
- Every PR: `npm run typecheck && npm run lint && npm run test:unit && npm run test:critical` must pass. CI runs these on every PR.
- Commit trailer: `Co-Authored-By:` your model line. PR body trailer: 🤖 Generated line.
- **Revert point:** `git checkout stable-pre-glm-refactor && vercel deploy --prod --yes`. Make a new `stable-YYYY-MM-DD` tag whenever you reach a known-good state.

## 3. CI / CD / deploy
- **CI:** GitHub Actions on every PR — "Lint, Typecheck & Test" + "Critical Flows Test Suite". Watch with `gh pr checks --watch`.
- **Deploy (manual):** `vercel deploy --prod --yes` from repo root (CLI already logged in). Vercel CLI can be slow in this shell — run it in the background and poll the output file.
- **Merge:** `gh pr merge <n> --merge --delete-branch`. ⚠️ This has silently no-op'd before — always re-verify with `gh pr view <n> --json state` that it actually merged.
- **Env vars via CLI:** piped stdin stores EMPTY — use `vercel env add NAME production --value "..."`. Then redeploy.

## 4. Tests
- **`npm run test:unit`** — 826 pure-function tests, no server, ~1.5 min (config `playwright.unit.config.ts`). Your fast safety net for the refactor. Covers nurture timeline, language detection, reply-validator (anti-hallucination), stage detection, property matching.
- `npm run test:critical` / `test:e2e` — Playwright against a booted dev server.
- **Playwright leaves the web server alive after unit runs** → the outer command "times out" but the tests themselves passed. Read the actual pass/fail line, ignore the timeout.

## 5. Architecture

**Stack:** Next.js 14 (App Router, TS) · Supabase · Vercel · Razorpay (LIVE) · Resend (email) · Sentry · Meta WhatsApp Cloud API (direct) · Sarvam (translation).

**LLM chain** (`lib/llm.ts`, entry `callLLM`): Groq `llama-3.3-70b-versatile` (hedged) → GLM-4.5-Flash fallback. The bot is NOT dependent on Claude.

**The live bot = `lib/ai-bot.ts` → `handleAiBotMessage`.** Called by `app/api/webhook/route.ts` on every inbound. Contract: **AI decodes intent/language; CODE does every fact** (search/match/present/book). AI never types a property fact. `lib/promptEngine.ts` is the prompt engine.

**Key files:**
- `lib/ai-bot.ts` — THE monolith to split. Suggested seams: intent-decode (LLM call + parse), qualification/state, property-match+present (`propertySearch.ts`/`propertyPresenter.ts` already exist), booking/reschedule/cancel, reply-assembly+send, language/translation.
- `lib/whatsapp.ts` — Meta senders (`waSendText`, `sendWhatsAppTemplate`, `sendToLead`, `sendAppointmentReminder`). MSG91 fully removed.
- `lib/translate.ts` — provider-agnostic translation. Sarvam now (`TRANSLATION_PROVIDER=sarvam`), Google-swappable. `TRANSLATE_LANGS=mr` (Marathi only, to protect ₹100 Sarvam credits). Bot reasons in English, translates the reply out.
- `lib/botGuards.ts` — abuse/empty-message guards (the "Sorry, I didn't catch that" lives here).
- `lib/nurtureFlow.ts` (pure A/B/C/D timeline, unit-tested) + `app/api/cron/route.ts` (`runNurtureFlowV2`, gated by `NURTURE_FLOW_V2`). Nurture cron = GitHub Action `nurture-cron.yml` (flaky scheduling — see §6).
- `lib/planLimits.ts` — free tier (500 msgs/10 leads/5 props). `lib/entitlement.ts` — bot only answers entitled agents.
- `db/migrations/` — apply DDL manually via `node pg` (§1); latest is `15_remove_msg91.sql` (⚠️ NOT yet applied to prod — harness blocked it; founder or GLM w/ explicit go must run it).

## 6. Known issues / landmines (the honest list)
1. **`ai-bot.ts` monolith** — every fix risks a new break. This is priority #1.
2. **Appointment flow is buggy** — founder's report; hard to pin down inside the monolith. Add tests as you refactor it.
3. **Nurture never demonstrably fired a WhatsApp nudge on its own.** Cron ran, emails sent (6), but WhatsApp `nudges: 0`; the test lead got skipped. Complex + unproven. **Recommend OFF for v1.**
4. **GitHub cron is unreliable** — free scheduled Actions skip/delay (skipped the 9–11am window). Don't rely on precise timing.
5. **`node_modules` is broken locally** (a stray `pnpm install` restructured it → `tsc` fails with "Cannot find module typescript/bin/tsc"). Rely on CI for typecheck, or `npm install` to repair. `node pg` + playwright CLI still work from repo root.
6. **WABA mess:** founder has multiple "Convorian" WhatsApp Business Accounts. Templates are approved on WABA `1364374782407136`, but the test agent's stored `wa_business_id` (`1035889322127934`, a Sandbox WABA) is stale — yet template sends still succeed from the number, so the stored id is just wrong/unused. For real clients, self-serve auto-creates templates on their own WABA (`lib/metaOnboard.ts`), so this is a test-only tangle.
7. **Sarvam credits = ₹100** (~limited). Marathi only via `TRANSLATE_LANGS`. Founder should apply to Sarvam Startup Program for free 6–12 months.

## 7. Test fixtures (for your QA)
- **Test agent:** "Rakesh Builders", id `0eace761-865a-4437-b314-2194aa205391`, number 755 (`wa_phone_number_id` `1143463112186349`, phone 7559197426), free plan, bot active. Now has 4 active properties (2BHK rental Baner @30k, 2BHK sale Baner, 3BHK rental Wakad, +1).
- **Test lead:** "Sk" id `c55f8353-ed52-450c-8b96-ec2d6e1c2441`, phone `916393260332` (founder's WhatsApp). Reset to clean state.
- **Demo account** `demo@convorian.in` — reserved for Meta reviewers, DO NOT break.
- To send a WhatsApp test directly: `node pg` fetch the agent's `wa_phone_number_id`+`wa_access_token`, POST to `https://graph.facebook.com/v19.0/{id}/messages` (see this session's transcript for the exact script). Never print the token.

## 8. Recommended launch plan (my parting advice as reviewer)
1. **Refactor `ai-bot.ts`** into modules behind the 826 unit tests. Behaviour-preserving, one PR at a time.
2. **v1 = qualify → match → book → confirm + emails.** Nurture engine dormant (`NURTURE_FLOW_V2` off). Keep the code, don't run it.
3. **Harden appointments** with real tests.
4. **Concierge-launch to 1–2 clients**, watch every conversation.
5. **Nurture = v2**, rebuilt on the clean base with real conversation data.

## 9. Business context
Convorian: AI WhatsApp assistant for Indian real-estate agents, ₹999/mo. Pre-launch, zero real users. Owner **Shantanu** — non-technical founder; use simple language, get explicit approval before production-changing actions, be conservative with cost. Meta App Review + Tech Provider APPROVED. Payments LIVE (Razorpay). Stable checkpoints: tags `stable-2026-06-22` and `stable-pre-glm-refactor`.

---
*Everything Claude shipped this session is on `main` and captured in the tag `stable-pre-glm-refactor`. Good luck — the core is real; give it structure and it'll hold.*
