# Clinepass / GLM Brief — Convorian bot

*Author: Claude (Opus). Date: 2026-06-29. Every claim below is grounded in the repo as of this date — verify against code if it looks stale.*

This answers Clinepass's intake questionnaire. Read `HANDOFF.md` first for full project context; this doc is bot-focused.

---

## 1. Architecture — which engine is live? (DEFINITIVE)

**`lib/ai-bot.ts` (`handleAiBotMessage`) is THE live engine. Focus 100% here.**

- `app/api/webhook/route.ts` (~line 221) calls `handleAiBotMessage()` on every inbound message. That is the only runtime path.
- **`lib/botOrchestrator.ts` is NOT wired in.** Its only reference anywhere is `tests/unit/bot-orchestrator.spec.ts` (unit tests of its pure functions). The **"BOT_V2 flag" exists only in its own comments** — there is no env var, no DB column, no code that checks it. It's an aspirational "code-first" v2 that was never connected.
- **Do NOT delete `botOrchestrator.ts`** without founder approval — it's dead but harmless, has passing tests, and represents an intended future direction. Just ignore it for launch work.
- The prompt engine lives in `lib/gemini.ts` (legacy filename — it is NOT Gemini; it builds the system prompt the live bot uses).

**Design contract (do not violate):** AI decodes intent/language/ambiguity only. CODE does every fact — property fetch/match/present, booking, cancel. The AI must never type a property fact or claim a booking/cancel happened unless the matching action was set.

## 2. Known bot state

Three previously-reported bugs are **already fixed** (verified in code):
- Duplicate visit reminders → `app/api/cron/route.ts` guards `.is('reminder_sent_at', null)` and stamps `reminder_sent_at` after sending.
- "Confirm" → "Sorry, I didn't catch that" → `lib/ai-bot.ts` (~line 636) has a **deterministic confirmation block** (`isConfirmationReply`) that fires before the LLM for any lead with a pending/booked visit.
- Manual mode not pausing → `bot_paused && !simulate` guard + 5-minute auto-resume (webhook + cron).

**Soft spots to PROBE (best targets — not confirmed live failures; traffic is ~zero pre-launch):**
- **Language consistency** — staying in Hindi/Marathi when the lead writes in it; Hinglish code-switching ("Mujhe 2BHK chahiye in Baner"). Prompt-driven in `lib/gemini.ts`. Most likely failure area.
- **Time/date parsing** — "kal subah", "day after tomorrow", "22-06" (dd-mm), "next Monday". Touched by Codex #160 ("prefer customer text when resolving visit dates"); needs adversarial tests.
- **No-match loop** — when zero properties match, confirm the bot doesn't re-ask the same question forever.

## 3. LLM / environment

- **Chain (`lib/llm.ts`, entry `callLLM()`):** Groq `llama-3.3-70b-versatile` (hedged) → **GLM-4.5-Flash fallback**. Keys `GROQ_API_KEY`, `GLM_API_KEY`. GLM endpoint `https://api.z.ai/api/paas/v4/chat/completions`, model `glm-4.5-flash`, `thinking:{type:'disabled'}`. Claude/Gemini are NOT in the live path.
- To verify GLM in isolation: unset/empty `GROQ_API_KEY` in a test env and confirm `GLM_API_KEY` is set → `callLLM()` routes through GLM one-shot.
- **No separate staging** — prod is `convorian.in` + a founder test agent (proton account on the Convorian **755** number). `TEST_AGENT_ID` env exists for tests.
- **Secrets/Supabase/Vercel/Sentry access:** the founder must grant these directly — they are credentials/PII and are not in this repo. Sentry org `covorian` (EU).

## 4. Tests & deploy

- **Playwright.** `npm run test:critical` (tests/critical), `npm run test:e2e`, `npm test` (all), `npm run ci` (lint + typecheck + critical + e2e). Dirs: `tests/{critical,e2e,unit,api,evals}`. Unit tests cover pure fns in `tests/unit/*.spec.ts`. Typecheck: `npm run typecheck`. Lint: `npm run lint`.
- **Deploy is manual:** `vercel deploy --prod --yes` (Vercel git auto-deploy is disconnected). CI runs on every PR (GitHub Actions). Process: branch → PR → CI green → founder approves → merge → deploy.
- **Rollback:** `git checkout stable-2026-06-22` (tag) or branch `fallback/bot-working-2026-06-27` → redeploy.

## 5. Launch priorities (7 days out)

| Pri | Item | Verdict |
|---|---|---|
| P0 | Core loop: qualify → match → book → email reliability | Must work (proven; protect it) |
| P0 | Language consistency (Hindi/Marathi/Hinglish) | Must work — top risk |
| P1 | Time/date parsing robustness | Must work for booking |
| P2 | Nurture sequence firing after silence | Nice for launch, not a blocker |
| v2 | Refactor/split `ai-bot.ts`, type safety | Ship in v2 — do NOT refactor pre-launch |
| v2 | Admin/agent UX polish | v2 |

**Hard rule: no refactors of `lib/ai-bot.ts` before launch.** Behaviour-preserving fixes only — the file is load-bearing and proven end-to-end.

## 6. Data shapes (no PII export — zero real users yet)

Read `db/schema.sql` for exact shapes: `leads` (incl. `chat_history` JSON, `bot_stage`, `bot_paused`, `pending_appointment_time`, `nurture_*`, `personality`), `properties`, `appointments` (`reminder_sent_at`, `scheduled_at`, `status`), `agents` (`office_open`/`office_close`/`weekly_off`/`wa_phone_number_id`; never SELECT `wa_access_token`). Seed test data via the in-app "sample lead" flow (`/api/sample-data`).

## 7. Quick confirmations

1. Bot monitoring dashboard — **No** dedicated one. 2. Sentry — **Yes** (covorian, EU). 3. Rate limits — Groq free tier can throttle → GLM fallback exists for exactly this. 4. RLS blocking bot — **No**; the bot uses the **service-role** client (bypasses RLS). 5. WhatsApp — **Meta approved**, proven on the 755 number. 6. WA fallback — none (Meta is the channel). 7. MSG91 — **stripped from the live chat path** (Meta direct); MSG91 code/env remain only for peripheral templates (nurture cron/alerts), gated by `MSG91_TEMPLATES_LIVE`.

---

**Golden rules for any bot change:** (1) `lib/ai-bot.ts` only, no rewrites; (2) AI decodes, code acts — never let the model invent facts; (3) a lead reply must reset `window_nudge_count`/`nurture_plan`/`plan_d_touches` or the nurture timeline silently breaks; (4) every change → `npm run typecheck` + `npm run lint` + `npm run test:critical` green before PR.
