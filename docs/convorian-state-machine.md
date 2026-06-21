# Convorian State Machine

> Lead lifecycle states and transitions for the WhatsApp bot.

---

## State Definitions

### NEW
- **Entry:** Lead created (first inbound message)
- **Exit:** Intent detected (buy/rent)
- **Transitions:** → QUALIFYING

### QUALIFYING
- **Entry:** Lead has expressed intent (buy/rent)
- **Exit:** Enough criteria collected (area, budget, BHK)
- **Transitions:** → QUALIFIED

### QUALIFIED
- **Entry:** Lead has intent + area + budget
- **Exit:** Property search initiated
- **Transitions:** → MATCHING

### MATCHING
- **Entry:** Property search started
- **Exit:** Properties found or no match
- **Transitions:** → PRESENTING | NURTURE_24H

### PRESENTING
- **Entry:** Properties displayed to lead
- **Exit:** Lead responds (interested/not interested)
- **Transitions:** → VISIT_PENDING | NURTURE_24H

### VISIT_PENDING
- **Entry:** Lead asked to book a visit
- **Exit:** Visit confirmed or lead declines
- **Transitions:** → VISIT_BOOKED | QUALIFYING

### VISIT_BOOKED
- **Entry:** Appointment created
- **Exit:** Visit occurs or is cancelled
- **Transitions:** → VISIT_COMPLETED | QUALIFYING

### VISIT_COMPLETED
- **Entry:** Visit done (post_visit_result set)
- **Exit:** Lead wants to proceed or not
- **Transitions:** → NEGOTIATION | NURTURE_24H

### NEGOTIATION
- **Entry:** Lead interested in closing
- **Exit:** Deal closed or lost
- **Transitions:** → CLOSED | LOST

### NURTURE_24H
- **Entry:** No response for 24 hours
- **Exit:** Lead re-engages or nurture plan exhausted
- **Transitions:** → QUALIFYING | NURTURE_B | LOST

### NURTURE_B
- **Entry:** 24H plan exhausted with no response
- **Exit:** Lead re-engages or plan exhausted
- **Transitions:** → QUALIFYING | NURTURE_C | LOST

### NURTURE_C
- **Entry:** Plan B exhausted
- **Exit:** Lead re-engages or plan exhausted
- **Transitions:** → QUALIFYING | NURTURE_D | LOST

### NURTURE_D
- **Entry:** Plan C exhausted
- **Exit:** Lead re-engages or plan exhausted
- **Transitions:** → QUALIFYING | LOST

### CLOSED
- **Entry:** Deal won
- **Exit:** Terminal
- **Transitions:** (none)

### LOST
- **Entry:** Deal lost / opted out / max nurture exhausted
- **Exit:** Terminal
- **Transitions:** (none)

---

## State Transition Diagram

```
NEW → QUALIFYING → QUALIFIED → MATCHING → PRESENTING → VISIT_PENDING → VISIT_BOOKED → VISIT_COMPLETED → NEGOTIATION → CLOSED
                                                              |               |                |                |
                                                              ↓               ↓                ↓                ↓
                                                         NURTURE_24H    QUALIFYING      NURTURE_24H      NURTURE_24H
                                                              |
                                                              ↓
                                                         NURTURE_B
                                                              |
                                                              ↓
                                                         NURTURE_C
                                                              |
                                                              ↓
                                                         NURTURE_D
                                                              |
                                                              ↓
                                                           LOST
```

---

## Nurture Plans

Each plan has a scheduled sequence of tasks. When a lead enters a nurture state, tasks are scheduled via the Task Generator.

| Plan | Cadence | Max Touches | Content Type |
|------|---------|-------------|--------------|
| NURTURE_24H | 3h / 6h / 12h / 23h | 4 | Free-form |
| NURTURE_B | 1 day / 3 days / 7 days | 3 | Template |
| NURTURE_C | 5 days / 10 days / 15 days | 3 | Template |
| NURTURE_D | 10 days / 14 days / 18 days / 22 days | 4 | Template |

---

## Allowed Transitions (Matrix)

| Current State | Can Transition To |
|---------------|-------------------|
| NEW | QUALIFYING |
| QUALIFYING | QUALIFIED |
| QUALIFIED | MATCHING |
| MATCHING | PRESENTING, NURTURE_24H |
| PRESENTING | VISIT_PENDING, NURTURE_24H |
| VISIT_PENDING | VISIT_BOOKED, QUALIFYING |
| VISIT_BOOKED | VISIT_COMPLETED, QUALIFYING |
| VISIT_COMPLETED | NEGOTIATION, NURTURE_24H |
| NEGOTIATION | CLOSED, NURTURE_24H |
| NURTURE_24H | QUALIFYING, NURTURE_B, LOST |
| NURTURE_B | QUALIFYING, NURTURE_C, LOST |
| NURTURE_C | QUALIFYING, NURTURE_D, LOST |
| NURTURE_D | QUALIFYING, LOST |
| CLOSED | (none) |
| LOST | (none) |