# SPRINT 2 PLAN — State Machine + Safe Migration

**Status:** Planning (awaiting approval before code)  
**Scope:** Implement `lib/leadStateMachine.ts`, execute the safe migration (Steps A–C), re-point the WIP task scheduler.  
**KPI:** All 17 states defined + transition matrix + 100% test coverage; zero-downtime backfill; dual-write verified in logs.  
**Timeline estimate:** 5–7 days (state machine + tests: 2–3 days; migration + dual-write: 2 days; task scheduler re-point: 1 day; bake + cutover: 1–2 days).

---

## 1. WHAT SPRINT 2 CHANGES

### A. Add `lib/leadStateMachine.ts` (new file, ~400 LOC)

**Responsibilities:**
- Define the 17 states as constants.
- Implement `transitionLead(lead, action, context?)` — the **only** authority for state changes.
- State transition matrix (allowed next-states per current state).
- Guard functions for preconditions (e.g., can't confirm visit if not in AWAITING_BROKER_APPROVAL).
- Emit events (via the event store we'll build in Sprint 4) for every transition.
- Return the new lead row (with updated `state` + `state_updated_at`).

**API (public):**
```typescript
transitionLead(lead: Lead, action: string, context?: Record<string, any>): Promise<Lead>
getCurrentState(leadId: string): Promise<string>
getNextStates(currentState: string): string[]
isValidTransition(from: string, to: string): boolean
```

**Input example:**
```typescript
const updatedLead = await transitionLead(lead, 'intent_detected', { intent: 'buy' })
// → lead.state transitions NEW → IN_CONVERSATION, emits event LEAD_INTENT_DETECTED
```

**Matrix (compact notation):**
```
NEW → IN_CONVERSATION | INACTIVE_24H
IN_CONVERSATION → QUALIFYING | INACTIVE_24H
QUALIFYING → QUALIFIED | INACTIVE_24H
QUALIFIED → PROPERTY_SHOWN | INACTIVE_24H
PROPERTY_SHOWN → INTERESTED | QUALIFYING | INACTIVE_24H
INTERESTED → VISIT_REQUESTED | QUALIFYING | INACTIVE_24H
VISIT_REQUESTED → AWAITING_BROKER_APPROVAL | INACTIVE_24H
AWAITING_BROKER_APPROVAL → VISIT_CONFIRMED | VISIT_REQUESTED
VISIT_CONFIRMED → VISIT_COMPLETED | INACTIVE_24H
VISIT_COMPLETED → CONVERTED | INACTIVE_24H | LOST
INACTIVE_24H → RESURRECTED | INACTIVE_3D
INACTIVE_3D → RESURRECTED | INACTIVE_7D
INACTIVE_7D → RESURRECTED | DORMANT
DORMANT → RESURRECTED | LOST
RESURRECTED → (routes to active state by stored criteria)
LOST → (terminal)
CONVERTED → (terminal)
```

### B. Add `leads.state` column (migration: `06_add_state_column.sql`)

**Step A — Additive migration (safe, no behavior change):**

```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_state ON leads (state);
CREATE INDEX IF NOT EXISTS idx_leads_state_updated ON leads (state_updated_at);
```

Do NOT drop or modify `conversation_stage` at this step.

### C. Backfill `state` from `conversation_stage` (Step B — data migration)

**Backfill script (`db/backfill_state.sql` or a manual migration):**

```sql
-- Backfill state from conversation_stage
UPDATE leads
SET state = CASE 
  WHEN conversation_stage = 'new' THEN 'NEW'
  WHEN conversation_stage = 'awaiting_intent' THEN 'IN_CONVERSATION'
  WHEN conversation_stage = 'awaiting_area' THEN 'QUALIFYING'
  WHEN conversation_stage = 'presenting' THEN 'PROPERTY_SHOWN'
  WHEN conversation_stage = 'no_match_ai' THEN 'PROPERTY_SHOWN'
  WHEN conversation_stage = 'awaiting_booking' THEN 'VISIT_REQUESTED'
  WHEN conversation_stage = 'booked' THEN 'VISIT_CONFIRMED'
  ELSE 'NEW'
END,
state_updated_at = COALESCE(updated_at, created_at, NOW())
WHERE state IS NULL;

-- Check for any leads without a state (should be zero after above)
SELECT COUNT(*) as unbackfilled FROM leads WHERE state IS NULL;
```

Run this in a maintenance window or via a founder-approved Supabase SQL editor session. **Not automated** — founder manually runs after Step A is deployed.

### D. Dual-write (Step C — bot writes both columns)

**In `app/api/webhook/route.ts`:**

Replace all bare `update({ conversation_stage: '...' })` calls with a new helper:

```typescript
async function updateLeadStage(leadId: string, newConversationStage: string, newState?: string) {
  const updates: any = { conversation_stage: newConversationStage };
  if (newState) updates.state = newState;
  
  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', leadId);
  
  if (error) logError('stage_update_failed', { newConversationStage, newState, error: error.message });
  return data;
}
```

Then call it everywhere with both arguments:
```typescript
// OLD
await supabaseAdmin.from('leads').update({ conversation_stage: 'presenting' }).eq('id', lead.id)

// NEW
await updateLeadStage(lead.id, 'presenting', 'PROPERTY_SHOWN')
```

**Dual-write period:** ~ 3–5 days (enough for prod logs to confirm no crashes).

### E. Cut reads over (Step D — bot reads `state` instead of `conversation_stage`)

**In `app/api/webhook/route.ts`, at the top:**

```typescript
// Before any message handling
const leadStage = lead.state || lead.conversation_stage || 'NEW'  // fallback to old column if needed
```

Then replace all stage checks:
```typescript
// OLD
if (lead.conversation_stage === 'awaiting_intent') { ... }

// NEW
if (lead.state === 'IN_CONVERSATION') { ... }
```

Run in prod for ~1 day while monitoring Sentry / Vercel logs. If stable, move to Step F.

### F. Retire `conversation_stage` (Step E — drop the old column)

Create a final migration `07_drop_conversation_stage.sql`:
```sql
ALTER TABLE leads DROP COLUMN conversation_stage;
```

**Run this only after** 1+ week of production stability on the new `state` column. Until then, the column stays — it's cheap insurance.

---

## 2. RE-POINT THE WIP TASK SCHEDULER

The untracked files `lib/nurture/taskGenerator.ts` and `taskExecutor.ts` reference
the old `lead_stage` naming. Before committing or running them:

1. Update all references: `lead_stage` → `state`, `lead_tasks` table stays the same.
2. Update the task scheduler to check `lead.state` (not `lead_stage`) when deciding
   which nurture plan to schedule.
3. The cadence from Section 8 of the SOURCE_OF_TRUTH (3h/6h/12h/21h, etc.) maps
   onto the INACTIVE states.

**Example update:**
```typescript
// OLD
if (lead.lead_stage === 'NURTURE_24H') { scheduleHighIntentTasks(...) }

// NEW
if (lead.state === 'INACTIVE_24H') { scheduleHighIntentTasks(...) }
```

---

## 3. FILE PLAN

### New files
- `lib/leadStateMachine.ts` (~400 LOC): state machine + `transitionLead()` + matrix
- `tests/unit/leadStateMachine.spec.ts` (~500 LOC): 50+ tests covering:
  - All 17 states can be created and named correctly
  - All allowed transitions work
  - All disallowed transitions throw (or return error)
  - Idempotency (calling `transitionLead()` twice with same action = safe)
  - Precondition checks (e.g., can't approve visit if not awaiting approval)
- `db/06_add_state_column.sql`: migration to add `state` + `state_updated_at`
- `db/backfill_state.sql`: one-time backfill script (founder-run)
- `docs/SPRINT_2_MIGRATION_RUNBOOK.md`: step-by-step deployment recipe for founder

### Modified files
- `app/api/webhook/route.ts`: add `updateLeadStage()` helper, dual-write all stage changes
- `lib/nurture/taskGenerator.ts`: re-point `lead_stage` → `state`
- `lib/nurture/taskExecutor.ts`: re-point `lead_stage` → `state`
- (commit `db/migrations/05_lead_state_machine.sql` + `lib/nurture/` files with the `state` naming)

### No changes needed
- Database schema otherwise (properties, messages, wallet, etc.)
- `lib/propertySearch.ts`, `lib/leadCriteria.ts` (Sprint 1 code stays)
- Bot response logic in `lib/gemini.ts` (state machine is orthogonal to reply generation)

---

## 4. TEST PLAN (50+ tests)

### Unit tests (`leadStateMachine.spec.ts`)

**State definition tests (5):**
- All 17 states exist and are named correctly
- No duplicate state names
- State constants are immutable

**Transition matrix tests (20):**
- For each state, test all allowed next-states succeed
- For each state, test a few disallowed transitions fail gracefully
- Test RESURRECTED routes correctly based on stored criteria

**Precondition tests (10):**
- Can't confirm visit if not in AWAITING_BROKER_APPROVAL
- Can't move to QUALIFIED if intent is null
- Can't move to PROPERTY_SHOWN if no matching properties
- Etc.

**Idempotency tests (5):**
- Calling `transitionLead()` twice with same action and context = idempotent
- Second call returns the same state without error

**Integration tests (10):**
- Full funnel: NEW → IN_CONVERSATION → QUALIFYING → QUALIFIED → PROPERTY_SHOWN → INTERESTED → VISIT_REQUESTED → AWAITING_BROKER_APPROVAL → VISIT_CONFIRMED
- Full inactive ladder: QUALIFIED → INACTIVE_24H → INACTIVE_3D → INACTIVE_7D → DORMANT → RESURRECTED (routes back to QUALIFIED based on stored criteria)
- Rejected visit: AWAITING_BROKER_APPROVAL → VISIT_REQUESTED (collector asks for new time)

**Migration tests (NOT in leadStateMachine.spec.ts, but in a separate migration test):**
- Backfill script correctly maps all old stages to new states
- No leads left without a state after backfill
- Dual-write works (both columns updated)
- Read cutover doesn't break the bot (log output matches old behavior)

---

## 5. DEPLOYMENT SEQUENCE (0-downtime)

### Prod-safe order:
1. **Friday end-of-day or weekend:** Deploy Step A (add column). Zero behavior change. Safe rollback.
2. **Founder session:** Run backfill script (`db/backfill_state.sql`). Verify counts. Zero-risk (data already exists, not new).
3. **Monday morning:** Deploy dual-write code (Step C). Logs start showing both columns. Monitor Sentry for 24h. **Can roll back: just revert to old code.**
4. **Tuesday morning:** If logs clean, cut reads over (Step D). Restart bots. Monitor 24h.
5. **1+ week later:** Retire old column (Step F) in a scheduled maintenance.

**Rollback at each step:** restore the previous git commit + redeploy. No data loss.

---

## 6. SUCCESS CRITERIA

- [ ] `lib/leadStateMachine.ts` compiles, 50+ tests pass, typecheck clean
- [ ] Migration adds `state` column to live DB without downtime
- [ ] Backfill: 100% of leads have a `state` value (count verified)
- [ ] Dual-write: logs show both columns being written for 3+ days, zero errors
- [ ] Read cutover: bot behavior identical (verified by comparing old vs new logs)
- [ ] 1 week stability: no Sentry alerts tied to state transitions
- [ ] Retire step: `conversation_stage` successfully dropped, no queries use it
- [ ] Task scheduler re-pointed: `lib/nurture/` files reference `state` + tests pass

---

## 7. RISKS + MITIGATIONS

| Risk | Mitigation |
|---|---|
| Live bot goes dark during migration | Zero-downtime sequence (add → backfill → dual-write → read switch). Rollback at each step. |
| Backfill misses some leads | Script includes a count check; founder verifies count before deploying next step. |
| Old `conversation_stage` queries still exist after retirement | Grep the codebase in Step D; update all queries before Step F. |
| Task scheduler breaks due to re-pointing | Test the re-pointed code in a feature branch; run unit tests before committing. |
| Lead drops out of the funnel due to bad state routing | RESURRECTED logic has fallback (routes to QUALIFYING if stored criteria missing). |

---

## 8. QUESTIONS FOR FOUNDER APPROVAL

Before code is written:

1. **Backfill timing:** Should founder run the backfill manually via Supabase SQL editor, or should we automate it in a migration? (Recommendation: manual, so founder sees the row counts and confirms before the bot reads the new column.)
2. **Maintenance window:** Is there a preferred day/time for Step A (adding column) to avoid peak traffic?
3. **Rollback approval:** If anything breaks during Steps C/D, is it OK for the engineer to roll back to the previous commit + redeploy immediately (without waiting for founder)? Or wait for approval?

---

## 9. NEXT AFTER SPRINT 2

- Sprint 3: Visit interest flow + broker approval capture
- Sprint 4: Event log + idempotency layer (formal `lead_events` store)
- Sprint 5: Broker takeover + SLA timers

---

*Locked for review: 2026-06-21 ∼ 14:00.*  
*Ready for code: pending founder questions answered.*
