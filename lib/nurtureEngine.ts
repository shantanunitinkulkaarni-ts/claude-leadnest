// ── The Nurture Engine (V1 rails) ────────────────────────────────────────────
// Decides the next nurture MOVE for a lead from its state + engagement signals +
// silent personality profile. Consent-tiered, human-warm, escalating-then-backing-
// off. The goal is a SALE or a clean STOP — never nagging. This is the starter
// playbook; it grows forever (the moat). The DECISION lives here; the WORDS are
// rendered separately (LLM for free-text, Meta template out-of-window).
//
// Honest V1 note: out-of-window moves need Meta-approved templates (pending), so
// until those land the scheduler only sends the in-window (free-text) moves and
// logs the rest as deferred. The engine + data capture are fully built and ready.

import { callLLM } from './llm'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export type NurtureChannel = 'free_text' | 'template'

export type NurtureMove = {
  move: string                  // playbook id, e.g. 'reengage_value', 'no_show_warm_checkin'
  brief: string                 // the intent — rendered into words later
  channel: NurtureChannel       // free_text (in 24h window) | template (out of window)
  templateName?: string         // which approved template, when channel = template
  nextNurtureAt: string | null  // when to consider this lead again (null = done for now)
  newState?: string             // optional nurture_state transition after this move
  angle?: string                // personalization angle chosen (for logging/learning)
}

// ── signal helpers ───────────────────────────────────────────────────────────
function lastInboundMs(lead: any): number {
  return lead.last_inbound_at ? new Date(lead.last_inbound_at).getTime()
    : lead.created_at ? new Date(lead.created_at).getTime() : Date.now()
}
function inWindow(lead: any): boolean {
  return Date.now() - lastInboundMs(lead) < 24 * HOUR
}
function quietMs(lead: any): number {
  return Date.now() - lastInboundMs(lead)
}
function nudgesSent(lead: any): number {
  return Number(lead.engagement?.nudges_sent || 0)
}

// Pick the personalization angle from the silent profile (highest-signal first).
export function pickAngle(p: any): string | undefined {
  if (!p) return undefined
  if (p.values_vastu) return 'vastu'
  if (p.investor) return 'investment_roi'
  if (p.budget_sensitive) return 'loan_or_offer'
  if (p.family_buyer) return 'family_amenities'
  return undefined
}

// Aim for the evening (office-goers respond after work) — V1 keeps it simple:
// schedule the next touch `ms` out; the daily cron itself runs in the evening.
function scheduleIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

// ── the decision ─────────────────────────────────────────────────────────────
// Returns the move to make now, or null (nothing due / stop / protect the number).
export function decideMove(lead: any): NurtureMove | null {
  // Hard stops — never nurture these.
  if (lead.nurture_paused || lead.opted_in === false || lead.bot_paused) return null
  const state: string = lead.nurture_state || 'new'
  if (['won', 'lost', 'stopped'].includes(state)) return null

  const quiet = quietMs(lead)
  const sent = nudgesSent(lead)
  const angle = pickAngle(lead.personality)
  const ch: NurtureChannel = inWindow(lead) ? 'free_text' : 'template'

  // ── No-show: warm, human, time-sensitive (NOT a cold rebook) ──────────────
  if (state === 'no_show') {
    if (sent >= 1) {
      return { move: 'no_show_followup', angle, channel: ch, templateName: 'nurture_checkin',
        brief: 'a second, light check-in after the missed visit — offer a fresh slot or any info they need, zero pressure; if they are not ready, gracefully step back',
        nextNurtureAt: null, newState: 'dormant' }
    }
    return { move: 'no_show_warm_checkin', angle, channel: ch, templateName: 'nurture_checkin',
      brief: 'a warm, human check-in after a missed site visit — gently ask if everything is okay and whether they need more time or information; do NOT say "you missed it, rebook?"',
      nextNurtureAt: scheduleIn(2 * DAY) }
  }

  // ── Post-visit, no decision: gentle, helpful follow-up ────────────────────
  if (state === 'visited') {
    if (sent === 0) return { move: 'post_visit_followup', angle, channel: ch, templateName: 'nurture_checkin',
      brief: 'a warm post-visit follow-up — ask how they found the property, answer doubts, and softly gauge if they want to move ahead',
      nextNurtureAt: scheduleIn(3 * DAY) }
    if (sent === 1) return { move: 'post_visit_nudge', angle, channel: ch, templateName: 'nurture_last_nudge',
      brief: 'a final gentle nudge after the visit — offer to help with the next step (negotiation, loan, another option) or ask if they want to pause',
      nextNurtureAt: scheduleIn(7 * DAY), newState: 'dormant' }
    return null
  }

  // ── Cold lead (bought/uploaded), never engaged: ONE soft compliant touch ──
  // Protect the number above all — try once, then stop unless they reply.
  if (lead.consent_tier === 'cold' && state === 'new') {
    if (sent >= 1) return null
    return { move: 'cold_first_touch', angle, channel: 'template', templateName: 'cold_intro',
      brief: 'a soft, compliant, non-spammy first hello: introduce the agent, mention you can help with their property search in their area, warmly invite a reply — no hard sell',
      nextNurtureAt: null }
  }

  // ── Engaged / shown / dormant but gone quiet: escalating value, then back off ─
  if (['engaged', 'shown', 'dormant', 'new'].includes(state)) {
    if (sent === 0 && quiet >= 1 * DAY) {
      return { move: 'reengage_checkin', angle, channel: ch, templateName: 'nurture_checkin',
        brief: 'a gentle check-in on their property search — offer to share a couple of fresh options that fit what they wanted',
        nextNurtureAt: scheduleIn(2 * DAY) }
    }
    if (sent === 1 && quiet >= 3 * DAY) {
      return { move: 'reengage_value', angle, channel: ch, templateName: 'nurture_new_options',
        brief: 'lead with VALUE — mention new matching listings (or a relevant angle for this person) and nudge toward a quick visit',
        nextNurtureAt: scheduleIn(4 * DAY) }
    }
    if (sent === 2 && quiet >= 7 * DAY) {
      return { move: 'reengage_last', angle, channel: ch, templateName: 'nurture_last_nudge',
        brief: 'a final warm nudge — offer to line up a visit this weekend, or kindly ask if they would like to pause for now (respect their time)',
        nextNurtureAt: scheduleIn(14 * DAY), newState: 'dormant' }
    }
    return null // not due yet, or this streak is exhausted
  }

  return null
}

// ── render the words (free-text moves) ───────────────────────────────────────
// Turns a move's brief into ONE short, warm, human WhatsApp message in the lead's
// language, using the chosen angle. Out-of-window template moves are rendered by
// the template itself, not here.
const ANGLE_GUIDE: Record<string, string> = {
  vastu: 'If natural, mention a Vastu-positive point (e.g. north/east facing, good per Vastu).',
  investment_roi: 'Frame around investment value — rental yield or appreciation.',
  loan_or_offer: 'Mention an easy home-loan option or a current offer if it fits naturally.',
  family_amenities: 'Mention family-friendly aspects — space, safety, schools nearby.',
}

export async function renderNurtureMessage(move: NurtureMove, lead: any, agent: any): Promise<string> {
  const lang = lead.language === 'hi' ? 'Hindi' : lead.language === 'hinglish' ? 'Hinglish (Hindi in English letters)' : 'English'
  const angleLine = move.angle && ANGLE_GUIDE[move.angle] ? `\nAngle: ${ANGLE_GUIDE[move.angle]}` : ''
  const sys = `You are ${agent?.name || 'a property consultant'} from ${agent?.agency_name || 'a real-estate agency'}, writing ONE short WhatsApp message to a lead.
Write like a warm, real human agent — never robotic, never pushy, never salesy. One or two sentences. Reply in ${lang}.
Lead: ${lead.name || 'there'} | looking to ${lead.intent || 'buy/rent'}${lead.preferred_areas?.length ? ` in ${lead.preferred_areas.join(', ')}` : ''}${lead.budget_max ? ` around ₹${lead.budget_max}` : ''}.
Goal of this message: ${move.brief}.${angleLine}
Output ONLY the message text — no quotes, no preamble.`
  try {
    const out = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: 'Write the message.' }])
    return (out || '').trim().replace(/^["']|["']$/g, '') || fallbackMessage(move, lead)
  } catch {
    return fallbackMessage(move, lead)
  }
}

function fallbackMessage(move: NurtureMove, lead: any): string {
  const name = lead.name ? ` ${lead.name}` : ''
  return `Hi${name}, just checking in on your property search — happy to share a few good options whenever you're ready. 😊`
}
