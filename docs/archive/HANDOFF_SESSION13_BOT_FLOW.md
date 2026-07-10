# Session 13 handoff — Bot reliability + nurture flow + escalation (FOR STAGING REVIEW)

> Branch: `foundation/bot-reliability-escalation`. **NOT merged, NOT deployed, NO prod DB
> changes applied** — per founder instruction (review on staging first). Everything below is
> code + unapplied migrations on the branch. typecheck + lint clean; full unit suite green.

## What was built (ready to review)

### Messaging reliability (plan items #1, #2, #6)
- **#1 Capture send failures (superadmin-visible, agent-invisible).** MSG91 senders now return
  `{ id, error }`; a rejected reply is marked `status='failed'` + `delivery_error` on the row and
  Sentry-captured. The agent's inbox shows nothing (it doesn't render delivery status).
- **#2 Auto-retry glitches.** `sendWithRetry`: 3 attempts, short gaps, retries ONLY transient
  failures (network/429/5xx), never permanent 4xx. Wired into reply, guardrail, photos, manual
  send, and cron sends.
- **#6 JPEG-only photo upload.** Front-door reject of non-JPEG (UI + client + server), keeping
  the re-encode as a second layer → foolproof WhatsApp photo delivery.

### Safe fallback card + escalation (plan items #3a, #3b)
- **Card** (`lib/fallbackCard.ts`): when the engine is down OR the bot can't answer, the reply
  becomes the agent contact card (founder-approved wording). Degrades gracefully if fields blank.
- **Escalation (#3b):** a `bot_fallback` event is logged (last 2-3 messages + a short AI
  "what went wrong" summary) and the superadmin desk (support@convorian.in) is emailed; engine-down
  also emails the agent. Knowledge-gap still alerts the agent via the existing priority alert.

### Nurture flow engine — the conversion timeline (the big one)
- **`lib/nurtureFlow.ts`** — pure, fully unit-tested decision engine:
  - IN-WINDOW (<24h): nudge at **3h, 6h, 12h, 23h**; stops on visit/reply/opt-out; strict quiet
    hours **9am–10pm IST**.
  - POST-WINDOW (24h+ silence, templates only): **Plan A** (re-approach ~day1) → **Plan B**
    (open question ~2-3d) → **Plan C** (offer ~5-7d) → **Plan D** (routine forever: ~day 11, 18,
    24, then every 4 days). Sends only in preferred slots (morning best → afternoon → evening).
- **Cron wiring** behind **`NURTURE_FLOW_V2`** flag (OFF by default → zero prod change). When on,
  `runNurtureFlowV2()` drives both phases; old sections 1+1b are skipped.
- **Simulator:** `POST /api/admin/nurture-sim` (superadmin/CRON) — dry-runs the whole timeline so
  you can SEE every stage in one call, or test one real lead at a simulated time. Nothing sent.

### Train-the-bot data (the moat, #3d)
- `GET /api/admin/training-export?agent_id=...[&format=md]` — exports an agency's Q&A corpus
  (answered = trained knowledge, pending, + fallback events w/ AI summaries) as JSON or a
  RAG-ready markdown doc. Built so a future automated model can ingest it.
- Superadmins can already ANSWER any agency's gaps via the existing knowledge-gaps API (the guard
  allows superadmins) → answers feed the prompt. The **/admin UI to surface this is the remaining
  3c piece** (see pending).

### Agent card fields (#3a.2)
- Migration (unapplied) `03_agent_card_fields.sql`: `office_address`, `weekly_off`, `holidays`.
- Saveable via agent API + Settings rows. **Onboarding "make required at signup" is the remaining UI piece.**

## ⚠️ Before turning the new flow ON (founder actions, after staging review)
1. **Apply migrations** to prod (in order): `db/migrations/02_nurture_flow.sql`,
   `db/migrations/03_agent_card_fields.sql`. (I did NOT apply them.)
2. **Approve MSG91 templates:**
   - `agent_bot_handoff` (Utility) — agent notification when the card fires (already submitting).
   - For Plan B (open question) and Plan C (offer) — two new templates needed; until approved the
     flow holds those leads (no send). Plans A & D reuse the approved suite.
3. **Set env** `NURTURE_FLOW_V2=true` (only after 1+2) to switch the new flow on.
4. Optional: confirm card wording reads right in WhatsApp.

## Still PENDING (not built — need your review/decisions; specs ready)
- **3c /admin UI:** "Bot needs attention" list (reads `activity_log` type=`bot_fallback`: shows
  last 2-3 msgs + AI summary) + an answer box (calls the existing knowledge-gaps PATCH). Backend ready.
- **Onboarding:** make office address + weekly-off/holidays required at signup.
- **Site-visit reminders (1 day / 3h / 15 min) + agent copies + emails + confirmations:** needs a
  **`leads.email`** column + email capture in the intro flow (the checklist's "Name & Email" step),
  plus per-reminder flags on `appointments`. Spec'd, not built (depends on email capture).
- **Reports** (weekly/monthly/quarterly/annual to agent + superadmin + dashboard): larger,
  separate build.
- **Post-visit nurture (tier-2):** explicitly a paid-tier/future feature.
- **Setup / number-integration / billing:** see `files/SETUP_AND_INTEGRATION_PLAN.md` — PLAN ONLY,
  review together (includes the answer to "how do we connect each client's number" + markup/billing).
- **Reports/A-B testing/behavioural analytics/retraining automation:** future / human-dev-team per
  founder.

## How to review on staging
The PR's Vercel **Preview** is the staging URL. The new flow is dark (flag off) so prod behaviour
is unchanged. To preview the timeline logic: `POST /api/admin/nurture-sim` (as superadmin). To see
the card wording: it's in `lib/fallbackCard.ts` / the unit test output.
