import { supabaseAdmin } from '../supabase'
import type { AIDecision } from './types'

export async function prepareBookingSupport(args: {
  decision: AIDecision
  agentId: string
  lead: any
  tutorialMode?: boolean
  resolvedMatchedPropertyId: string | null
}) {
  const { decision, agentId, lead, tutorialMode } = args
  if (!lead) return { bookingLeadState: null, resolvedMatchedPropertyId: args.resolvedMatchedPropertyId }
  let { resolvedMatchedPropertyId } = args
  let bookingLeadState: any = null

  if (decision.action === 'book_visit' || decision.action === 'reschedule_visit') {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('name, email, matched_property_id, pending_appointment_time')
      .eq('id', lead.id)
      .maybeSingle()
    bookingLeadState = data || null
  }

  if (tutorialMode && lead.is_sample && decision.action === 'book_visit' && !resolvedMatchedPropertyId && !bookingLeadState?.matched_property_id) {
    const { data: sampleProp } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('agent_id', agentId)
      .eq('is_sample', true)
      .ilike('location', 'Wakad')
      .limit(1)
      .maybeSingle()
    if (sampleProp?.id) resolvedMatchedPropertyId = sampleProp.id
  }

  return { bookingLeadState, resolvedMatchedPropertyId }
}
