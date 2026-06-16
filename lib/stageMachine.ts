// ─────────────────────────────────────────────────────────────────────────────
// Conversation Stage Machine
//
// Deterministic, server-side stage resolution. The LLM is TOLD which stage it
// is in via the prompt — it never decides this itself. This is the single
// source of truth for "what should the bot be doing right now," and it must
// stay a pure function of (lead, messageCount) so it's fully unit-testable
// without any DB or network access.
// ─────────────────────────────────────────────────────────────────────────────

export type ConversationStage =
  | 'greeting'        // First message — establish rapport
  | 'discovery'       // Understand needs — SPIN questions
  | 'qualification'   // Budget, timeline, decision maker
  | 'presentation'    // Show matched properties
  | 'objection'       // Handle concerns
  | 'commitment'      // Book site visit
  | 'post_visit'       // Lead has completed a site visit — convert to deal
  | 'nurture'         // Long-term follow up
  | 'closed'          // Won or lost

/**
 * Resolves the lead's current conversation stage.
 *
 * Transition rules, evaluated in priority order (first match wins):
 *
 * 1. `closed` — lead.status is 'closed_won' or 'closed_lost'. Terminal state,
 *    overrides everything else.
 * 2. `post_visit` — lead has post_visit_result set, or status is 'visit_done'.
 *    Takes priority even on the very first inbound message (e.g. a walk-in
 *    logged by the agent before any WhatsApp exchange) because the whole
 *    conversation must pivot to converting that visit into a deal.
 * 3. `greeting` — messageCount <= 1 (first message in the thread).
 * 4. `commitment` — lead.status is 'visit_booked', OR ai_score >= 7 AND
 *    status is 'qualified'. Booked/commitment states take priority over any
 *    field-based logic below.
 * 5. `presentation` — ai_score >= 4 (independent of which fields are filled;
 *    a high enough score means the lead is ready to see properties).
 * 6. `nurture` — temperature is 'cold' AND messageCount > 6. Cold leads who
 *    haven't engaged after several messages get a long-term nurture approach
 *    instead of a hard sell. Checked BEFORE the forced-presentation rule
 *    below — otherwise a cold lead with any criteria captured would always
 *    be forced into presentation at message 5+ and this branch would never
 *    be reachable (a real bug found while writing exhaustive tests for this
 *    function: the original ordering made `nurture` dead code).
 * 7. `discovery` — no criteria captured yet (no intent/areas/budget_min) AND
 *    messageCount <= 4.
 * 8. `presentation` — messageCount >= 5 AND some criteria exist. Discovery
 *    must never drag on forever — a real agent shows properties by message 5,
 *    not message 15. The bot continues gathering missing info naturally
 *    during presentation rather than stalling in discovery.
 * 9. `discovery` — missing name, intent, or preferred_areas.
 * 10. `qualification` — missing budget_min or timeline.
 * 11. `presentation` — fallback default once name/intent/areas/budget/timeline
 *     are all present and the lead isn't cold.
 */
export function detectStage(lead: any, messageCount: number): ConversationStage {
  if (lead.status === 'closed_won' || lead.status === 'closed_lost') return 'closed'
  if (lead.post_visit_result || lead.status === 'visit_done') return 'post_visit'
  if (messageCount <= 1) return 'greeting'
  if (lead.status === 'visit_booked') return 'commitment'
  if (lead.ai_score >= 7 && lead.status === 'qualified') return 'commitment'
  if (lead.ai_score >= 4) return 'presentation'

  if (lead.temperature === 'cold' && messageCount > 6) return 'nurture'

  const hasAnyCriteria = lead.intent || lead.preferred_areas || lead.budget_min
  if (!hasAnyCriteria && messageCount <= 4) return 'discovery'
  if (messageCount >= 5 && hasAnyCriteria) return 'presentation'
  if (!lead.name || !lead.intent || !lead.preferred_areas) return 'discovery'
  if (!lead.budget_min || !lead.timeline) return 'qualification'

  return 'presentation'
}
