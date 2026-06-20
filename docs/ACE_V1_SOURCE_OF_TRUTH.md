# ACE V1 — SOURCE OF TRUTH

**THE single canonical spec. Open this first in every new chat.**

- **Owner (architecture + state definitions):** Lead Engineer (Sonnet/Opus)
- **Executor (code only):** Worker (Haiku)
- **Status:** APPROVED — reconciliation locked 2026-06-21
- **Supersedes:** `ACE_V1_MASTER_PLAN.md` (old 13-state model), `docs/convorian-state-machine.md`
  (MATCHING/NEGOTIATION model), and the `lead_stage` naming in the untracked
  `db/migrations/05_lead_state_machine.sql`. Where any of those disagree with this
  file, **this file wins.**

> This doc reconciles the two ACE V1 PDFs (`docs/ACE_V1_ARCHITECTURE.pdf`,
> `docs/ACE_V1_ENGINEERING_PACK.pdf`) with the **live** Convorian codebase. It does
> NOT describe a fresh build. ACE V1 = the existing Next.js/Vercel system, evolved.

---

## 0. TWO DECISIONS THAT FRAME EVERYTHING (founder, 2026-06-21)

1. **Evolve live Convorian** — keep the Next.js 14 / Vercel / Supabase system and
   everything already working (Razorpay wallet, MSG91 messaging, nurture, delivery
   tracking). The ACE PDFs are the **target spec**, not a rebuild. There is **no**
   separate Node backend or standalone queue-worker service — serverless routes +
   cron stay.
2. **Adopt the 17-state `state` model** — migrate off `conversation_stage` to the
   canonical `leads.state`. This **reverses** the earlier "keep conversation_stage"
   instruction, on purpose. Migration is **staged and zero-downtime** (Section 7) —
   the live bot is never blind for a moment.

---

## 1. WHAT ACE IS

A multi-tenant real-estate operating system that:
- converts leads into **site visits** (primary KPI)
- manages broker approvals (human-in-the-loop)
- runs WhatsApp automation (AI + human hybrid)
- tracks wallet billing per message (ledger)
- nurtures and re-engages leads automatically

**PRIMARY KPI: `VISIT_CONFIRMED`.** Everything optimizes toward confirmed visits —
not conversations, not messages, not leads created.

**CORE RULE:** every meaningful action is a **state transition** driven by an
**event**. No business logic mutates a lead directly — it goes through the state
machine (`transitionLead()`).

---

## 2. CANONICAL LEAD STATE MACHINE (17 states)

These 17 states are locked. The Lead Engineer owns this list; Haiku never adds,
renames, or removes a state.

```
NEW
IN_CONVERSATION
QUALIFYING
QUALIFIED
PROPERTY_SHOWN
INTERESTED
VISIT_REQUESTED
AWAITING_BROKER_APPROVAL
VISIT_CONFIRMED
VISIT_COMPLETED
INACTIVE_24H
INACTIVE_3D
INACTIVE_7D
DORMANT
RESURRECTED
LOST
CONVERTED
```

### Definitions + allowed transitions

| State | Entry (when) | Allowed next states |
|---|---|---|
| **NEW** | First inbound message; lead row created | IN_CONVERSATION |
| **IN_CONVERSATION** | Bot greeted; collecting name/language | QUALIFYING, INACTIVE_24H |
| **QUALIFYING** | Intent (buy/rent) known; collecting area/budget/BHK | QUALIFIED, INACTIVE_24H |
| **QUALIFIED** | Intent + area (+budget) complete; search ready | PROPERTY_SHOWN, INACTIVE_24H |
| **PROPERTY_SHOWN** | Matching properties presented (incl. "no match" honesty) | INTERESTED, QUALIFYING, INACTIVE_24H |
| **INTERESTED** | Lead reacts positively to a specific property | VISIT_REQUESTED, QUALIFYING, INACTIVE_24H |
| **VISIT_REQUESTED** | Lead asks to visit AND a valid time is captured | AWAITING_BROKER_APPROVAL, INACTIVE_24H |
| **AWAITING_BROKER_APPROVAL** | Visit request sent to broker; awaiting human decision | VISIT_CONFIRMED, VISIT_REQUESTED *(rejected → re-collect time)* |
| **VISIT_CONFIRMED** | Broker approved; appointment created **★ KPI** | VISIT_COMPLETED, INACTIVE_24H |
| **VISIT_COMPLETED** | Visit happened (post-visit result recorded) | CONVERTED, INACTIVE_24H, LOST |
| **INACTIVE_24H** | No reply for ~24h | RESURRECTED, INACTIVE_3D |
| **INACTIVE_3D** | No reply for ~3 days | RESURRECTED, INACTIVE_7D |
| **INACTIVE_7D** | No reply for ~7 days | RESURRECTED, DORMANT |
| **DORMANT** | Long-term cold (1+ month) | RESURRECTED, LOST |
| **RESURRECTED** | Lead replies after any INACTIVE/DORMANT state | *(re-routes to the correct active state by stored criteria)* |
| **LOST** | Opted out / dead / max nurture exhausted | *(terminal)* |
| **CONVERTED** | Deal won | *(terminal)* |

**Notes**
- "No match" is **not** a state — the lead stays in `PROPERTY_SHOWN`/`QUALIFIED` and
  is handled honestly (never silent intent switch — see Guardrails).
- `RESURRECTED` is transient: on the lead's reply, `transitionLead()` immediately
  routes them back into the funnel at the right active state based on stored
  criteria, then clears the inactive timers.
- **Broker takeover** does not change the lead `state`. It flips the **session** to
  `HUMAN_ACTIVE` and freezes the bot (Section 4).

---

## 3. SUPPORTING STATE MACHINES

**Broker states:** `ONLINE`, `OFFLINE`, `HUMAN_MODE_ACTIVE`, `UNRESPONSIVE`, `SLA_BREACHED`
**Property states:** `ACTIVE`, `RESERVED`, `SOLD`, `RENTED`, `OFF_MARKET` (manual-first updates in V1)
**Session modes:** `AI_ACTIVE`, `HUMAN_ACTIVE`

---

## 4. HUMAN MODE / BROKER TAKEOVER (new — not built yet)

- Only **one** active controller at a time: AI **or** human.
- Broker takeover → session `HUMAN_ACTIVE` → **bot fully frozen** (no auto-replies,
  no nurture sends) for that lead.
- **Auto-resume** = last broker message **+ 1 hour** → session back to `AI_ACTIVE`.
- Resume notification → **email to broker/admin only** (never the customer).

## 5. BROKER SLA (new — not built yet)

15 min internal alert → 2 hr escalation → 6 hr SLA breach → 24 hr unresponsive.

---

## 6. DATA MODEL RECONCILIATION (docs → live)

The PDFs name idealized tables. Map them to the **live** Supabase tables — do not
create duplicates.

| PDF table | Live table | Action |
|---|---|---|
| `leads.state` | `leads.conversation_stage` | **Add `state` column** (Section 7), migrate |
| `conversations` | `messages` | Use existing `messages` |
| `wallet_transactions` | `wa_transactions` | Use existing; add ledger **state** (healthy/low/critical/blocked) classification |
| `properties` | `properties` | Already has type/status/location/price/rent_per_month |
| `lead_events` | *(none — partial via `activity`)* | **New** formal event store w/ idempotency_key |
| `broker_sessions` | *(none)* | **New** for takeover + SLA |
| *(WIP)* `lead_tasks` | `lead_tasks` | Keep the untracked migration's table — it's the nurture scheduler |

---

## 7. THE LIVE → NEW STATE MAP + SAFE MIGRATION

The live bot reads `conversation_stage` on **every inbound message**. We never rip
it out. Zero-downtime sequence:

**Step A — additive migration (safe, no behavior change):** add `leads.state text`
+ index. Do not touch `conversation_stage`.

**Step B — backfill** `state` from existing `conversation_stage`:

| live `conversation_stage` | → `state` |
|---|---|
| `new` | NEW |
| `awaiting_intent` | IN_CONVERSATION |
| `awaiting_area` | QUALIFYING |
| *(criteria complete)* | QUALIFIED |
| `presenting` | PROPERTY_SHOWN |
| `no_match_ai` | PROPERTY_SHOWN *(no-match handled in-state)* |
| `awaiting_booking` | VISIT_REQUESTED / AWAITING_BROKER_APPROVAL |
| `booked` | VISIT_CONFIRMED |
| *(status `visit_done` / `post_visit_result` set)* | VISIT_COMPLETED |

**Step C — dual-write:** the bot writes BOTH `state` and `conversation_stage` for a
short bake period. Nothing downstream breaks.

**Step D — cut reads over** to `state` once verified in prod logs.

**Step E — retire** `conversation_stage` last (drop in a later migration).

---

## 8. NURTURE CADENCE (maps to the INACTIVE states)

From the architecture PDF, mapped onto the inactive ladder:

| State | Cadence |
|---|---|
| INACTIVE_24H (high intent) | 3h, 6h, 12h, 21h *(all before the 24h free-window close / 10 PM cutoff)* |
| INACTIVE_3D (short term) | 36h, 3d |
| INACTIVE_7D | 7d |
| DORMANT (long term → decay) | random 2–5d; then 1 month weekly → 2 months bi-weekly → 3+ months archived pool |

**META RULE (Meta/WhatsApp):** any user reply **resets the 24-hour free messaging
window** and moves the lead to `RESURRECTED`. Out-of-window sends require an
approved paid template.

---

## 9. GENUINE GAPS (real new work vs. what's already live)

1. **Formal state machine** — today stage changes are ad-hoc `update()` calls
   scattered through `app/api/webhook/route.ts`. Replace with one `transitionLead()`
   authority + an allowed-transition matrix.
2. **Broker takeover + SLA** (`broker_sessions`, human-mode freeze, SLA timers) — none exists.
3. **Event log + idempotency** (`lead_events`) — partial today (dedup + `activity`); make it a formal event store.
4. **Nurture/task scheduler** — WIP exists (`lib/nurture/taskGenerator.ts`,
   `taskExecutor.ts`, `lead_tasks`) but pointed at the old `lead_stage` naming.
   **Re-point to `state`** before committing/running.

Already live (do NOT rebuild): wallet/Razorpay, MSG91 send + delivery status,
property search (Sprint 1: `lib/propertySearch.ts`), lead criteria extraction
(Sprint 1: `lib/leadCriteria.ts`), knowledge-gap alerts, nurture email sequence.

---

## 10. GOLDEN RULES / GUARDRAILS

- No event is lost; every event has an **idempotency key**; events stored **before** execution; retryable.
- **All lead changes go through `transitionLead()`** — no direct state mutation.
- **Human override always possible**; human mode freezes the bot.
- Billing is **ledger-based, never overwritten** — always compute balance from the ledger.
- ❌ Rental lead never sees sale property; ❌ buy lead never sees rental property.
- ❌ No silent intent switch. ❌ No auto broker confirmation. ❌ No past-date / out-of-hours bookings.
- Wallet/SLA alerts go to **brokers/admin only — never customers**.
- Budget tolerance 1.2×; area matching typo-tolerant; intent preserved at all fallback levels.

---

## 11. EXECUTION MODEL (roles)

- **Lead Engineer (Sonnet/Opus):** defines architecture, owns state definitions, plans sprints, reviews PRs, approves changes. No production writes without founder "go".
- **Worker (Haiku):** implements functions, follows spec exactly, writes tests, asks when unclear. **Never** changes architecture, invents business rules, or modifies the state machine.
- **Founder (Shantanu):** approves every production-changing action. Simple-English explanations, no jargon.

---

## 12. SPRINT ROADMAP (reconciled)

- **SPRINT 1 — DONE ✅** `lib/propertySearch.ts` + `lib/leadCriteria.ts` (46/46 tests, PR #129).
- **SPRINT 2 — State machine:** `lib/leadStateMachine.ts` (17 states + transition matrix + `transitionLead()`), `state` column migration Steps A–C, backfill, dual-write. Re-point the WIP task scheduler to `state`.
- **SPRINT 3 — Visit + broker approval:** capture visit time → `AWAITING_BROKER_APPROVAL` → broker approve/reject UI → `VISIT_CONFIRMED` + appointment.
- **SPRINT 4 — Event/reliability layer:** `lead_events` store + idempotency keys; standardize webhook on it.
- **SPRINT 5 — Broker takeover + SLA:** `broker_sessions`, human-mode freeze, auto-resume, SLA timers.
- **SPRINT 6 — Nurture activation:** wire `lead_tasks` cadence to the INACTIVE ladder; cutover reads to `state` (Step D), retire `conversation_stage` (Step E).

---

## 13. DEFINITION OF DONE (ACE V1)

```
Lead: "I want to buy in Baner"
  → correct properties shown (intent-correct, budget-aware)
  → Lead: "I like this one"
  → Lead: "Tomorrow 4 PM"
  → Broker approves
  → Appointment created
  → Lead receives confirmation
  → VISIT_CONFIRMED ★
```

Everything else is optimization.

---

*Locked: 2026-06-21. Next review: end of Sprint 2.*
