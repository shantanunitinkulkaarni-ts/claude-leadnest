// ─────────────────────────────────────────────────────────────────────────────
// NURTURE FLOW ENGINE  (the conversion timeline — pure, testable)
// ─────────────────────────────────────────────────────────────────────────────
// This is the "intelligence engine" foundation: it decides, for a given lead at
// a given moment, WHAT the bot should do next to move them toward a site visit.
// It is PURE (no DB, no network, no clock) so every timing/branch is unit-tested
// and the cron just executes whatever it returns. Founder-specified timeline.
//
// TWO PHASES:
//   IN-WINDOW  (lead messaged within 24h → free-text allowed): nudge toward a
//     visit at 3h, 6h, 12h, 23h after their last message. Stops the moment a
//     visit is booked or they reply (their reply resets the whole clock upstream).
//   POST-WINDOW (24h+ of silence → only approved paid templates deliver): a
//     sequence of named plans that re-approach with growing gaps:
//       Plan A  — first re-approach (ideally a property creative/template).      ~day 1
//       Plan B  — open question to surface the hesitation.                       ~2–3 days after A
//       Plan C  — strong offer / festive / discount / video.                    ~5–7 days after B
//       Plan D  — routine nurture forever (incl. an agent contact card):        ~10–12 days after C,
//                 then day 18, day 24, then every 4 days, until they reply /
//                 block / the agent stops it.
//
// A lead REPLY (handled in the webhook) resets window_nudge_count + nurture_plan
// and reopens the 24h window, so the flow naturally restarts in-window. If the
// reply happens while already on Plan B/C/D, the webhook keeps them out of "first
// nurture" — see note in the webhook.
//
// Quiet hours: NEVER message before 9am or after 10pm IST (founder: strict).
// Post-window sends prefer the windows when RE leads actually act: late morning
// (best, enables a same-day evening visit), then late afternoon, then evening.

const H = 60 * 60 * 1000
const DAY = 24 * H
const IST_OFFSET = 5.5 * H

export type NurturePlan = 'A' | 'B' | 'C' | 'D'
export type InWindowBand = 3 | 6 | 12 | 23
export type PostWindowKind = 'reapproach' | 'open_question' | 'offer' | 'routine'

export type NurtureDecision =
  | { send: false; reason: string; dormant?: boolean }
  | { send: true; phase: 'in_window'; band: InWindowBand; reason: string }
  | { send: true; phase: 'post_window'; plan: NurturePlan; kind: PostWindowKind; reason: string }

// ── Tunables (centralised so they're easy to adjust later) ───────────────────
export const IN_WINDOW_BANDS: InWindowBand[] = [3, 6, 12, 23] // hours since last inbound
// Gap (days) the lead must have been silent before the NEXT post-window plan fires.
export const PLAN_GAP_DAYS: Record<NurturePlan, number> = {
  A: 1,   // ~a day after the window closes
  B: 2.5, // 2–3 days after Plan A
  C: 6,   // 5–7 days after Plan B
  D: 11,  // 10–12 days after Plan C (then Plan D repeats, see PLAN_D_REPEAT_DAYS)
}
// Plan D repeats: ~6-day gaps for the first couple of touches, then settle to 4.
export const PLAN_D_FIRST_GAP_DAYS = 6
export const PLAN_D_STEADY_GAP_DAYS = 4
export const PLAN_D_STEADY_AFTER_TOUCHES = 2

const QUIET_START_HOUR = 9   // inclusive — no messages before 9am IST
const QUIET_END_HOUR = 22    // exclusive — no messages at/after 10pm IST

// IST hour (0–23) for an epoch-ms instant.
export function istHour(nowMs: number): number {
  return new Date(nowMs + IST_OFFSET).getUTCHours()
}

export function withinQuietHours(nowMs: number): boolean {
  const h = istHour(nowMs)
  return h >= QUIET_START_HOUR && h < QUIET_END_HOUR
}

// Post-window preferred send windows, best-first. Morning aims for a same-day
// evening visit; afternoon pushes a same-day eve visit; evening is last resort
// (still fine if an immediate booking is possible). Returns null outside them.
export type SendWindow = 'morning' | 'afternoon' | 'evening' | null
export function postWindowSlot(nowMs: number): SendWindow {
  const h = istHour(nowMs)
  if (h >= 9 && h < 12) return 'morning'
  if (h >= 15 && h < 17) return 'afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return null
}

// Has this lead already had its visit booked / been won/lost / opted out / paused?
function isFlowHalted(lead: any): { halted: boolean; reason: string } {
  if (lead?.bot_paused) return { halted: true, reason: 'bot_paused' }
  if (lead?.opted_in === false || lead?.nurture_state === 'opted_out') return { halted: true, reason: 'opted_out' }
  const status = lead?.status
  if (status === 'visit_booked' || status === 'visit_done' || status === 'closed_won' || status === 'closed_lost') {
    return { halted: true, reason: `status_${status}` }
  }
  return { halted: false, reason: '' }
}

// ── In-window decision: which 3/6/12/23h band (if any) is due now ────────────
function decideInWindow(lead: any, nowMs: number, hoursSinceInbound: number): NurtureDecision {
  const count = lead?.window_nudge_count || 0
  if (count >= IN_WINDOW_BANDS.length) return { send: false, reason: 'in_window_exhausted' }
  if (!withinQuietHours(nowMs)) return { send: false, reason: 'quiet_hours' }

  // The band due next is the one at index = count (0→3h, 1→6h, 2→12h, 3→23h).
  const band = IN_WINDOW_BANDS[count]
  if (hoursSinceInbound < band) return { send: false, reason: `band_not_reached(${hoursSinceInbound.toFixed(1)}h/<${band}h)` }
  // Don't fire two nudges within 2h (clock-skew / double-run safety).
  const lastNudge = lead?.last_nudge_at ? new Date(lead.last_nudge_at).getTime() : 0
  if (lastNudge && nowMs - lastNudge < 2 * H) return { send: false, reason: 'nudged_recently' }

  return { send: true, phase: 'in_window', band, reason: `in_window_${band}h` }
}

// ── Post-window decision: which plan fires now ───────────────────────────────
function decidePostWindow(lead: any, nowMs: number): NurtureDecision {
  // The anchor for "how long silent" is the last thing WE sent (template) or,
  // before any post-window touch, the moment their window closed (last_message_at).
  const lastInbound = lead?.last_message_at ? new Date(lead.last_message_at).getTime() : 0
  const lastTouch = lead?.last_template_at ? new Date(lead.last_template_at).getTime() : 0
  const current: NurturePlan | null = (['A', 'B', 'C', 'D'].includes(lead?.nurture_plan) ? lead.nurture_plan : null)

  // Next plan to run given where we are now.
  const nextPlan: NurturePlan = current === null ? 'A'
    : current === 'A' ? 'B'
    : current === 'B' ? 'C'
    : current === 'C' ? 'D'
    : 'D' // already on D → stays on D (repeats)

  // Required silent-gap before nextPlan.
  let requiredGapDays: number
  if (nextPlan === 'D' && current === 'D') {
    // Plan D repeats: first couple of D touches ~6 days apart, then every 4 days.
    const dTouches = lead?.plan_d_touches || 0
    requiredGapDays = dTouches < PLAN_D_STEADY_AFTER_TOUCHES ? PLAN_D_FIRST_GAP_DAYS : PLAN_D_STEADY_GAP_DAYS
  } else {
    requiredGapDays = PLAN_GAP_DAYS[nextPlan]
  }

  const anchor = lastTouch || lastInbound || nowMs
  const daysSilent = (nowMs - anchor) / DAY
  if (daysSilent < requiredGapDays) {
    return { send: false, reason: `gap_not_reached(${daysSilent.toFixed(1)}/${requiredGapDays}d, next=${nextPlan})` }
  }

  // Only send in a preferred daytime slot (also enforces quiet hours).
  if (!postWindowSlot(nowMs)) return { send: false, reason: 'outside_send_window' }

  const kind: PostWindowKind = nextPlan === 'A' ? 'reapproach'
    : nextPlan === 'B' ? 'open_question'
    : nextPlan === 'C' ? 'offer'
    : 'routine'
  return { send: true, phase: 'post_window', plan: nextPlan, kind, reason: `plan_${nextPlan}` }
}

// ── Main entry point ─────────────────────────────────────────────────────────
// `lead`  : a leads row (needs last_message_at, window_nudge_count, last_nudge_at,
//            nurture_plan, last_template_at, plan_d_touches, status, opted_in,
//            nurture_state, bot_paused)
// `nowMs` : current time (injectable for tests/simulation)
export function decideNurtureStep(lead: any, _agent: any, nowMs: number): NurtureDecision {
  const halt = isFlowHalted(lead)
  if (halt.halted) return { send: false, reason: halt.reason }

  const lastInbound = lead?.last_message_at ? new Date(lead.last_message_at).getTime() : 0
  if (!lastInbound) return { send: false, reason: 'no_last_message' }
  const hoursSinceInbound = (nowMs - lastInbound) / H

  // It must be OUR turn — if the lead's last message is newer than our last touch,
  // the caller should already have reset counters; we still guard here.
  if (hoursSinceInbound < IN_WINDOW_BANDS[0]) return { send: false, reason: 'too_soon' }

  return hoursSinceInbound < 24
    ? decideInWindow(lead, nowMs, hoursSinceInbound)
    : decidePostWindow(lead, nowMs)
}
