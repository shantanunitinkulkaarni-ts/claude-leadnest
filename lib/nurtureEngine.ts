// ── Nurture personalization (enrichment layer) ───────────────────────────────
// The DECISION engine (when + which plan/band) is lib/nurtureFlow.ts. This module
// only adds the NEW intelligence: turning a lead's silent personality profile into
// a personalization "angle" + a short instruction the message generator (generateNudge)
// can fold in — so a nudge lands as the right human angle (Vastu for the religious,
// loan/ROI for the budget/investor minded) instead of a generic "want to visit?".
// The profile is built silently by the bot (lib/ai-bot.ts) over the conversation.

export type NurtureAngle = 'vastu' | 'investment_roi' | 'loan_or_offer' | 'family_amenities'

const ANGLE_GUIDE: Record<NurtureAngle, string> = {
  vastu: 'If natural, mention a Vastu-positive point (e.g. north/east facing, good per Vastu).',
  investment_roi: 'Frame around investment value — rental yield or price appreciation.',
  loan_or_offer: 'Mention an easy home-loan option or a current offer if it fits naturally.',
  family_amenities: 'Mention family-friendly aspects — space, safety, schools nearby.',
}

// Pick the strongest personalization angle from the silent profile, or none.
export function pickAngle(personality: any): NurtureAngle | undefined {
  if (!personality || typeof personality !== 'object') return undefined
  if (personality.values_vastu) return 'vastu'
  if (personality.investor) return 'investment_roi'
  if (personality.budget_sensitive) return 'loan_or_offer'
  if (personality.family_buyer) return 'family_amenities'
  return undefined
}

// A one-line instruction for the message LLM, derived from the lead's profile —
// angle + tone. Empty string when we have no signal (stay generic-but-warm).
export function personalityBrief(personality: any): string {
  if (!personality || typeof personality !== 'object') return ''
  const parts: string[] = []
  const angle = pickAngle(personality)
  if (angle) parts.push(ANGLE_GUIDE[angle])
  if (personality.tone_pref === 'formal') parts.push('Keep the tone respectful and formal.')
  else if (personality.tone_pref === 'warm') parts.push('Keep the tone warm and friendly.')
  if (personality.urgency === 'low') parts.push('They are not in a hurry — no pressure, no urgency language.')
  return parts.join(' ')
}
