# Sprint 2 Migration Runbook — State Machine Deployment

**Timeline:** 5–7 days (planning → deployment → cutover)

**Participants:**
- **Engineer (GLM):** Executes steps, monitors Sentry/logs
- **Founder (Shantanu):** Approves each step, runs SQL backfill

---

## Phase 2A: Add Column (Friday EOD)

**Goal:** Add `state` + `state_updated_at` columns to `leads` table. Zero behavior change.

### Engineer: Deploy code
```bash
cd /path/to/claude-leadnest
git checkout main
git pull origin main

# Deploy migration 06_add_state_column.sql
# (Migration runs automatically when code is deployed to Vercel)
vercel deploy --prod --yes
```

### Verify
```bash
# Check migration was applied (no errors in Sentry)
# Vercel logs should show: "Migration 06_add_state_column.sql applied successfully"
```

### Rollback (if needed)
```bash
vercel deploy --prod --yes  # Redeploy previous commit
git revert <commit-hash>    # Or manually drop columns via Supabase
```

---

## Phase 2B: Backfill Data (Saturday)

**Goal:** Populate `state` from `conversation_stage` for all existing leads.

### Founder: Run SQL backfill

1. Open Supabase dashboard → SQL Editor
2. Create a new query and paste this script:

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

-- Verify: count of leads without a state (should be 0)
SELECT COUNT(*) as unbackfilled FROM leads WHERE state IS NULL;
```

3. **Before running:** Note the total count of leads:
   ```sql
   SELECT COUNT(*) FROM leads;
   ```

4. **Run the backfill query.**

5. **Verify:** The final SELECT should return `0` unbackfilled leads.
   - If count > 0, notify engineer immediately — backfill failed.

6. **Log:** Screenshot the results for audit.

### Engineer: Verify backfill
```bash
# Query Supabase to confirm all leads have a state
node -e "
const { Client } = require('pg')
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} })
;(async()=>{ 
  await c.connect()
  const { rows } = await c.query('SELECT COUNT(*) as total, COUNT(state) as with_state FROM leads')
  console.log(rows[0])
  await c.end() 
})()
"
```

Expected output:
```
{ total: '42', with_state: '42' }
```

---

## Phase 2C: Dual-Write (Monday–Wednesday, 3 days)

**Goal:** Bot writes both `state` and `conversation_stage` columns. Logs show both.

### Engineer: Deploy dual-write code

**Code changes in `app/api/webhook/route.ts`:**

```typescript
// Add this helper near the top of the file
async function updateLeadStage(
  leadId: string,
  newConversationStage: string,
  newState?: string
) {
  const updates: any = { conversation_stage: newConversationStage }
  if (newState) updates.state = newState
  
  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', leadId)
  
  if (error) {
    logError('stage_update_failed', {
      leadId,
      newConversationStage,
      newState,
      error: error.message,
    })
  }
  return data
}

// Replace all bare `.update({ conversation_stage: '...' })` calls with:
await updateLeadStage(lead.id, 'presenting', 'PROPERTY_SHOWN')
```

**Deploy:**
```bash
vercel deploy --prod --yes
```

### Monitor (3 days)

**Engineer checks:**
- **Sentry:** Zero new errors related to `stage_update_failed` or state transitions
- **Vercel logs:** Sample messages show both columns being written
- **Dashboard:** Agent interactions work normally (no silent failures)
- **Test lead:** Send a WhatsApp message to test number; verify bot replies normally

**Daily:** Check Sentry dashboard for 2 minutes each morning.

**If errors appear:**
- Revert to previous commit: `git revert <dual-write-commit>`
- Redeploy: `vercel deploy --prod --yes`
- Notify founder; reschedule Phase 2D

**On day 3, if clean:** Approve for Phase 2D.

---

## Phase 2D: Read Cutover (Thursday morning)

**Goal:** Bot reads `state` column instead of `conversation_stage`.

### Engineer: Deploy read cutover

**Code changes in `app/api/webhook/route.ts`:**

```typescript
// At the top of handleAiBotMessage():
const leadStage = lead.state || lead.conversation_stage || 'NEW'

// Replace all checks:
// OLD: if (lead.conversation_stage === 'awaiting_intent') { ... }
// NEW: if (leadStage === 'IN_CONVERSATION') { ... }
```

**Deploy:**
```bash
vercel deploy --prod --yes
```

### Monitor (1 day)

**Engineer checks:**
- **Sentry:** Zero new errors
- **Logs:** Compare old-column behavior vs new-column behavior (should be identical)
- **Test lead:** Send multiple messages; bot behavior unchanged
- **Fallback works:** If a lead somehow lacks `state`, it falls back to `conversation_stage`

**If all clean by end of day:** Approve for Phase 2F.

---

## Phase 2F: Retire Old Column (One week later)

**Goal:** Drop `conversation_stage` column. Data is now canonically stored in `state`.

### Engineer: Create retirement migration

**File: `db/migrations/07_drop_conversation_stage.sql`**

```sql
-- Phase 2F: Retire conversation_stage (one week after read cutover)
-- All reads now use `state` column. This is a hard cutover.

ALTER TABLE leads DROP COLUMN conversation_stage;
```

**Deploy:**
```bash
vercel deploy --prod --yes
```

### Verify
- Sentry: Zero errors
- Test lead: Continue working normally
- Logs: No references to `conversation_stage`

---

## Success Criteria ✅

After all phases:

- [x] All leads have a `state` value (verified after backfill)
- [x] Dual-write logs show both columns for 3+ days (zero errors)
- [x] Read cutover behaves identically to old code (verified by log comparison)
- [x] 1 week of production stability (no Sentry alerts)
- [x] Old column successfully dropped
- [x] Bot continues to work normally end-to-end

---

## Rollback Strategy

| Phase | Rollback Plan |
|-------|---------------|
| 2A | Redeploy previous commit; drop column via Supabase |
| 2B | Restore backup; re-run backfill with corrected mapping |
| 2C | Revert dual-write code; keep both columns (safe) |
| 2D | Revert read cutover code; go back to reading `conversation_stage` |
| 2F | Recreate `conversation_stage` from `state` (requires backup) |

---

## Questions for Founder Approval

**Before Phase 2A:**
1. ✅ OK to deploy migration Friday EOD (low-risk, additive)?
2. ✅ OK to run backfill Saturday morning?
3. ✅ OK for engineer to auto-rollback if Phase 2C errors appear (vs waiting for approval)?

---

## Timeline Summary

```
Fri EOD:     Phase 2A (add column) — 5 min
Sat morning: Phase 2B (backfill) — 15 min
Mon–Wed:     Phase 2C (dual-write) — 3 days monitoring
Thu morning: Phase 2D (read cutover) — 1 day monitoring
Following week: Phase 2F (drop old column) — 2 min

Total: 5–7 calendar days (3 engineer days of active work)
```

---

*Locked for founder review: 2026-07-10*
