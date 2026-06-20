# ACE V1 IMPLEMENTATION MASTER PLAN

**SOURCE OF TRUTH**  
**OWNER:** Lead Engineer (Claude Opus/Sonnet)  
**EXECUTOR:** Worker (Claude Haiku)  
**STATUS:** APPROVED FOR BUILD  
**LAST UPDATED:** 2026-06-21

---

## MISSION

Build the shortest possible path from:

```
Lead Arrives
  ↓
Property Match
  ↓
Property Interest
  ↓
Visit Request
  ↓
Broker Approval
  ↓
Visit Confirmed
```

Everything else is secondary.

**Primary KPI:** `VISIT_CONFIRMED`

Not conversations.  
Not AI messages.  
Not leads created.  

**Confirmed property visits.**

---

## PHASE 1 — PROPERTY MATCHING FOUNDATION ✅ DONE

**GOAL:** Prevent inventory mismatches.

**Current Failure:**
- Rental lead → sees sale properties
- Buy lead → sees rental properties
- This destroys trust immediately.

**DELIVERABLE:** `lib/propertySearch.ts`

**Responsibilities:**
- Intent filtering
- Budget filtering
- Nearby area fallback
- Property ranking

**Public API:**
```typescript
searchPropertiesByFallbackChain()
```

**Output:**
```typescript
{
  level: "exact" | "area_no_budget" | "nearby" | "no_inventory" | "none"
  properties: []
  nearbyAreas?: []
}
```

**Fallback Order:**

**LEVEL 1**
- Area + Intent + Budget

**LEVEL 2**
- Area + Intent

**LEVEL 3**
- Nearby Areas + Intent

**LEVEL 4**
- No Inventory Message

**Rules:**
- Never show rental inventory to buy leads
- Never show sale inventory to rental leads
- Budget filtering optional
- Intent filtering mandatory

**SUCCESS CRITERIA:**
- Rental lead never sees sale property

**STATUS:** ✅ COMPLETE (46/46 tests passing)

---

## PHASE 2 — LEAD MEMORY SYSTEM ✅ DONE

**GOAL:** ACE remembers what the lead already told us.

**DELIVERABLE:** `lib/leadCriteria.ts`

**Responsibilities:**
- Intent extraction
- Area extraction
- Budget extraction
- BHK extraction
- Criteria merging

**Public API:**
```typescript
extractIntent()
extractBudget()
extractArea()
extractBHK()
mergeCriteria()
saveCriteria()
```

**Rules:**
- Newest message always wins
- Example:
  - Lead: "I want to buy" → intent = buy
  - Later: "Actually rent" → intent = rent (overwrite)
  - Do not preserve stale assumptions

**SUCCESS CRITERIA:**
- Lead never has to repeat information

**STATUS:** ✅ COMPLETE (46/46 tests passing)

---

## PHASE 3 — STATE MACHINE

**GOAL:** Remove business logic from route.ts.

**DELIVERABLE:** `lib/leadStateMachine.ts`

**Single source of truth.**

**States:** (13 states from lifecycle)

```
NEW_LEAD
DISCOVERY
PRESENTATION
NO_MATCH
VISIT_INTEREST
AWAITING_BROKER_CONFIRMATION
VISIT_CONFIRMED
NURTURE_24H
PLAN_B
PLAN_C
PLAN_D
CLOSED_WON
CLOSED_LOST
```

**Public API:**
```typescript
getCurrentState()
transitionLead()
```

**Example:**
```typescript
transitionLead(
  lead,
  "property_interest"
)
// returns: VISIT_INTEREST
```

**Rules:**
- No direct state mutations
- All state changes must go through `transitionLead()`

**SUCCESS CRITERIA:**
- State transitions become predictable

---

## PHASE 4 — VISIT INTEREST FLOW

**GOAL:** Capture appointment intent.

**DELIVERABLE:** `lib/visitBooking.ts`

**Responsibilities:**
- Time extraction
- Time validation
- Broker notification
- Appointment preparation

**Public API:**
```typescript
extractVisitTime()
validateVisitTime()
notifyBroker()
prepareAppointment()
```

**Flow:**
```
Lead: "I want to visit"
  ↓
Ask for time
  ↓
Lead provides time
  ↓
Validate
  ↓
Store preferred_visit_time
  ↓
Move to AWAITING_BROKER_CONFIRMATION
```

**Rules:**
- No confirmation before broker approval
- No past dates
- No outside office hours

**SUCCESS CRITERIA:**
- Valid visit requests reach broker

---

## PHASE 5 — BROKER APPROVAL SYSTEM

**GOAL:** Broker becomes final authority.

ACE proposes.  
Broker confirms.

**DELIVERABLE:** Dashboard Section "Pending Visit Requests"

**Columns:**
- Lead
- Property
- Requested Time
- Approve
- Reject
- Suggest Alternative

**Approve Flow:**
```
Approve
  ↓
Appointment created
  ↓
Lead state: VISIT_CONFIRMED
```

**Reject Flow:**
```
Reject
  ↓
Back to VISIT_INTEREST
  ↓
Collect new time
```

**Rules:**
- No automatic confirmations

**SUCCESS CRITERIA:**
- Every confirmed visit was approved by broker

---

## PHASE 6 — APPOINTMENTS

**GOAL:** Persist confirmed visits.

**DELIVERABLE:** `appointments` table

**Fields:**
```
id
lead_id
agent_id
property_id
scheduled_at
status (pending | confirmed | cancelled | completed)
created_at
```

**Rules:**
- Create only after broker approval

**SUCCESS CRITERIA:**
- Every confirmed visit exists in appointments

---

## PHASE 7 — ACTIVITY LOGGING

**GOAL:** Track every meaningful action.

**DELIVERABLE:** Standardize activity events.

**Events:**
```
lead_created
criteria_updated
property_shown
property_interest
visit_requested
broker_approved
visit_confirmed
no_match
lead_opted_out
```

**Rules:**
- Never infer
- Always log

**SUCCESS CRITERIA:**
- Complete lead audit trail

---

## PHASE 8 — NURTURE INFRASTRUCTURE

**GOAL:** Prepare for re-engagement.

Not full nurture.  
Infrastructure only.

**DELIVERABLE:** Add nurture tracking fields.

**Fields:**
```
nurture_entry_at
touch_count
last_touch_at
plan (NURTURE_24H | PLAN_B | PLAN_C | PLAN_D)
```

**Plans:**
- NURTURE_24H
- PLAN_B
- PLAN_C
- PLAN_D

**No templates yet.**  
**No copywriting yet.**  
**Only tracking.**

**SUCCESS CRITERIA:**
- System knows where every inactive lead sits

---

## PHASE 9 — CRON FRAMEWORK

**GOAL:** Automate state progression.

**DELIVERABLE:** `cron/nurture`

**Responsibilities:**
- Find expired windows
- Move states
- Queue nurture actions

**Nothing else.**
- No AI
- No property logic
- No booking logic

**SUCCESS CRITERIA:**
- Inactive leads automatically progress through nurture states

---

## PHASE 10 — ROUTE.TS REFACTOR

**GOAL:** Convert route.ts into orchestration layer.

**CURRENT STATE:** Business logic hardcoded in route.ts

**TARGET STATE:**
```
route.ts
  ↓
leadStateMachine
  ↓
leadCriteria
  ↓
propertySearch
  ↓
visitBooking
  ↓
replyBuilder
```

**Rules:**
- No business logic inside route.ts
- Only orchestration

**SUCCESS CRITERIA:**
- route.ts becomes readable

---

## IMPLEMENTATION ORDER

### **SPRINT 1** ✅ DONE

- Phase 1: `lib/propertySearch.ts`
- Phase 2: `lib/leadCriteria.ts`
- Tests for both
- **Status:** 46/46 tests passing

### **SPRINT 2**

- Phase 3: `lib/leadStateMachine.ts`
- State transitions
- Tests

### **SPRINT 3**

- Phase 4: `lib/visitBooking.ts`
- Broker approval workflow
- `appointments` table

### **SPRINT 4**

- Phase 5: Activity logging
- Broker dashboard approvals

### **SPRINT 5**

- Phase 8: Nurture infrastructure
- Phase 9: Cron framework

---

## DEFINITION OF DONE

Lead sends: `"I want to buy in Baner"`

```
↓
Correct properties shown
↓
Lead: "I like this one"
↓
Lead: "Tomorrow 4 PM"
↓
Broker approves
↓
Appointment created
↓
Lead receives confirmation
↓
VISIT_CONFIRMED achieved
```

**That is ACE V1.**

**Everything else is optimization.**

---

## GUARDRAILS

### Non-Negotiable

- ❌ Rental lead NEVER sees sale property
- ❌ Buy lead NEVER sees rental property
- ❌ No silent intent switches
- ❌ No automatic broker confirmations
- ❌ No past date bookings
- ❌ No out-of-hours bookings

### Always Checked

- Budget tolerance: 1.2x (20%)
- Area matching: typo-tolerant
- Intent preservation at all fallback levels

---

## ROLE CLARITY

**Lead Engineer (Claude Opus/Sonnet)**
- Plans architecture
- Reviews PRs
- Decides on changes
- Approves deployments

**Worker (Claude Haiku)**
- Executes plan
- Implements code
- Writes tests
- Reports blockers

**Communication:**
- Lead: "What do you need clarified?"
- Worker: "What should I code next?"

---

## NOTES FOR LEAD ENGINEER

This plan prioritizes **only the shortest path to VISIT_CONFIRMED**.

No:
- Nurture copywriting
- Complex state machines
- Future-proofing
- Enterprise patterns

Yes:
- Minimal viable features
- Clear guardrails
- Fast iteration
- Production ready

The "everything else" in Phase 8-9 is infrastructure only — no logic, no AI, just tracking. Nurture templates and intensity logic come later when we have real data.

Each phase is:
- Single file (or table)
- Unit tested (46+ tests per phase)
- No dependencies on other phases (except route.ts refactor at the end)
- Deployable independently

---

## SUCCESS METRIC

**Before:** "I showed a rental lead sale properties"  
**After:** "I confirmed 10 property visits this week"

That's ACE V1.

---

*Last reviewed: 2026-06-21*  
*Next review: When SPRINT 2 complete*
