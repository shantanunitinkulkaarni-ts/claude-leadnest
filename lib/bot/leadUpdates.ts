import { resolveAppointmentTime } from '../appointment'
import { isValidEmail } from '../timeParser'
import type { AIDecision } from './types'

export function prepareLeadUpdates(args: {
  decision: AIDecision
  lead: any
  message: string
  currentStage: string
  forcedLang: string | null
}) {
  const { decision, lead, message, currentStage, forcedLang } = args
  const leadUpdates: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    bot_stage: decision.stage || currentStage,
    window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  if (decision.updates?.name) leadUpdates.name = decision.updates.name
  if (decision.updates?.language) leadUpdates.language = decision.updates.language
  if (forcedLang) leadUpdates.language = forcedLang
  if (decision.updates?.intent) leadUpdates.intent = decision.updates.intent
  if (decision.updates?.property_category) leadUpdates.property_category = decision.updates.property_category
  if (decision.updates?.preferred_areas?.length) leadUpdates.preferred_areas = decision.updates.preferred_areas
  if (decision.updates?.budget_min) leadUpdates.budget_min = decision.updates.budget_min
  if (decision.updates?.budget_max) leadUpdates.budget_max = decision.updates.budget_max
  if (decision.updates?.bhk) leadUpdates.bhk = decision.updates.bhk
  if (decision.updates?.sqft_preference) leadUpdates.sqft_preference = decision.updates.sqft_preference

  const proposedEmail = decision.updates?.email?.trim()
  const emailIsValid = !proposedEmail || isValidEmail(proposedEmail)
  if (proposedEmail && emailIsValid) leadUpdates.email = proposedEmail

  const bookingResolution = resolveAppointmentTime({
    llmTime: decision.updates?.visit_time,
    replyText: message,
    nowMs: Date.now(),
  })
  if (bookingResolution.ok) {
    leadUpdates.pending_appointment_time = bookingResolution.iso
    leadUpdates.pending_appointment_set_at = new Date().toISOString()
    leadUpdates.confirmation_followup_sent_at = null
  }

  const nowMs = Date.now()
  const prevOutMs = lead.last_outbound_at ? new Date(lead.last_outbound_at).getTime() : null
  const responseSecs = prevOutMs ? Math.max(0, Math.round((nowMs - prevOutMs) / 1000)) : null
  const replyWords = (message || '').trim().split(/\s+/).filter(Boolean).length
  const eng: Record<string, any> = { ...(lead.engagement || {}) }
  eng.replies = (eng.replies || 0) + 1
  eng.last_reply_words = replyWords
  if (responseSecs != null) {
    eng.last_response_secs = responseSecs
    eng.avg_response_secs = eng.avg_response_secs
      ? Math.round((eng.avg_response_secs * (eng.replies - 1) + responseSecs) / eng.replies)
      : responseSecs
  }
  leadUpdates.engagement = eng
  leadUpdates.last_inbound_at = new Date(nowMs).toISOString()
  leadUpdates.last_outbound_at = new Date(nowMs).toISOString()

  if (!lead.consent_tier) leadUpdates.consent_tier = 'consented'
  leadUpdates.window_nudge_count = 0
  leadUpdates.last_nudge_at = null
  leadUpdates.nurture_plan = null
  leadUpdates.plan_d_touches = 0

  if (decision.personality_cues && typeof decision.personality_cues === 'object') {
    leadUpdates.personality = { ...(lead.personality || {}), ...decision.personality_cues }
  }

  return {
    leadUpdates,
    proposedEmail,
    emailIsValid,
    newTime: leadUpdates.pending_appointment_time as string | undefined,
  }
}
