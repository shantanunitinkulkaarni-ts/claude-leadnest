# Convorian Lead Nurture & Follow-up Plan

*Drafted June 13, 2026 — status: PLAN (approved for build when founder says go)*

## 0. Why nothing fires today (the bug behind "I see none")

The cron route (`/api/cron`) already has a 23-hour keepalive, appointment
reminders and post-visit prompts — but Vercel Hobby allows **one cron run per
day** (9 AM). The keepalive looks for "windows expiring in the next 1–2 hours",
so a once-daily run misses ~92% of windows. Reminders fire late. Post-visit
prompts fire the next morning.

**Fix (Phase 1, infra):** a GitHub Actions workflow (free, like our DB backup)
calls `GET /api/cron` with `CRON_SECRET` **every 15 minutes**. No Vercel
upgrade needed. The route is already idempotent (timestamp/flag guards).

---

## 1. Hard constraints every send must respect

| Constraint | Rule |
|---|---|
| 24h WhatsApp window | Free-form AI messages ONLY while the window is open (lead messaged < 24h ago). Outside it: pre-approved TEMPLATE messages only. |
| Templates | Cost money per send → deduct from Billing & Credits (`deductWABalance`). Need MSG91 (now) / Meta (later) approval. None approved yet → Phase 2. |
| Opt-in / opt-out | Only nurture `opted_in` leads. NEW: engine must detect "stop/don't message me" and set `opted_in=false` + never touch again. Critical for ban-safety. |
| Quiet hours | Sends only 9 AM – 8 PM IST (or the agent's office hours if narrower). Anything due at night queues for morning. |
| Frequency caps | Max 3 nudges per open window. Max 1 nurture touch per day. Max 3 unanswered template touches total → then lead goes dormant. |
| State gates | Never nurture when: `bot_paused`, status closed_won/closed_lost, agent's bot off, subscription lapsed, insufficient credits (templates). |
| Reply resets everything | Any inbound from the lead cancels pending nudges and restarts the clock. |

---

## 2. Sequence A — "Conversation drop-off" (inside the 24h window, FREE, AI-written)

Trigger: bot asked something / shared a property and the lead went silent.

| When (after lead's last msg) | What | How it's written |
|---|---|---|
| **T+3h** | Contextual nudge — picks up the exact thread: "By the way Rahul, that east-facing 2BHK I mentioned — want me to hold Saturday slot?" | Engine (GLM) in a dedicated FOLLOW-UP mode: gets last 6 messages + stage + matched property; told to be one line, add NEW value, never "just checking in". |
| **T+10h** | Value-add touch — something genuinely useful: a matching property they haven't seen, a detail (society, possession date), or answer expansion. | Same engine mode, instructed to introduce one new fact from inventory. |
| **T+23h** | Window-closing save — last free message: clear, warm CTA designed to earn a reply (a reply re-opens the window for free). "Before I wrap up for the day — should I keep the Baner shortlist active for you?" | Engine mode "window_save". Replaces today's random hardcoded keepalive lines. |

Stage-aware tone: discovery leads get a question; presentation leads get a
property fact; commitment leads get a visit-slot offer; post-visit leads get a
decision nudge referencing the agent's visit notes.

## 3. Sequence B — "Gone quiet" (outside the window, TEMPLATES, paid)

Trigger: window closed, lead not booked/closed, hasn't replied.

| When (after window closed) | Template (placeholders) | Intent |
|---|---|---|
| **Day 3** | `Hi {{name}}, new {{bhk}} options just came up in {{area}} within your budget. Want me to send the best one?` | Re-engagement with concrete value |
| **Day 7** | `{{name}}, quick update on {{area}}: {{market_line}}. Your shortlist is still active — reply YES and I'll refresh it.` | Market-pulse authority touch |
| **Day 14** | `Should we keep looking for your {{bhk}} in {{area}}? Reply 1 = yes, keep me posted · 2 = pause for now.` | Clean close-or-continue |

After 3 unanswered: mark `nurture_state='dormant'`, stop. (Optional Day-45
"one new listing" revival — founder's call, costs credits.)

Every template send: deduct credits, log to `activity_log`, visible in
Billing & Credits history.

## 4. Sequence C — Visit lifecycle (highest ROI, mostly free)

| When | What | Channel |
|---|---|---|
| Booking moment | Confirmation with date/time/property recap (already in conversation) | In-window, engine |
| **T−24h** | Reminder (template exists: `leadnest_appointment_reminder`) | Template |
| **T−3h (same day)** | NEW short reminder: "See you at 5 PM at Skyline Residency! Address: …" | Template (or in-window if open) |
| **T+2h after visit** | Agent gets the feedback prompt (exists; will now fire on time with 15-min cron) + the FeedbackGate in dashboard | To agent |
| **T+1 day** | If feedback = interested/follow-up: engine references the agent's notes — "You mentioned the master bedroom won you over…" | Template or window |
| **T+3 days** | Objection-handling touch based on recorded hesitation | Template or window |
| **T+7 days** | Final decision nudge or alternative property offer | Template |
| No-show | T+1h: gentle reschedule offer (one only — reschedule limit logic already guards trolls) | Template or window |

## 5. What the engine considers before EVERY follow-up (decision checklist)

1. Opted in? bot active? subscription active? not paused/closed? → else skip
2. Window open? → free-form engine message : template (credits available?)
3. Quiet hours? → queue for next morning
4. Caps hit (3/window, 1/day, 3 unanswered templates)? → skip/dormant
5. Anything NEW to say (new property, visit context, unanswered question)?
   → if genuinely nothing, prefer silence over spam (engine can return SKIP)
6. Stage + temperature decide tone: hot = direct CTA, warm = value, cold = light touch

## 6. Data changes needed (one migration)

- `leads`: `last_nudge_at`, `window_nudge_count` (reset on inbound),
  `nurture_state` ('active' | 'dormant' | 'opted_out'), `template_touches`
- `messages`: `kind` ('reply' | 'nudge' | 'template_nurture' | 'reminder') for ROI reporting
- Engine: FOLLOW-UP prompt mode + opt-out detection (sets `opted_in=false`)

## 7. Rollout phases

- **Phase 1 (buildable NOW, zero cost):** 15-min GitHub Actions cron + Sequence A
  (3h/10h/23h in-window nudges, engine-written) + on-time visit reminders/post-visit
  prompts + opt-out detection. Founder can test end-to-end same day.
- **Phase 2 (needs founder):** MSG91 templates approved + `CONVORIAN_WA_NUMBER`
  → Sequence B (Day 3/7/14) + Sequence C template legs, with credit deduction.
- **Phase 3 (after Meta App Review):** same sequences, Meta-approved templates,
  per-agent numbers; MSG91 retired.

## 8. Success metrics (ROI dash later)

Nudge reply rate · window-save rate (23h msg that earned a reply) ·
re-engagement rate per template · visits recovered after no-show ·
opt-out rate (keep < 2%, else soften cadence).
