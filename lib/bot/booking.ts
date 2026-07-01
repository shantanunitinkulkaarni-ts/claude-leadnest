// lib/bot/booking.ts
// Appointment booking/reschedule/cancel logic for the AI bot.
// Extracted from lib/ai-bot.ts as part of the Phase 1 refactor.
//
// Phase 3: extracted pure helpers to booking_pure.ts for unit testing.

import { supabaseAdmin } from '../supabase'
import { formatIST, bookingTimeIssue } from '../timeParser'
import { sendCustomerConfirmation, sendAgentNotification, emailSuperadmin, notifyAgentOfTrollHalt } from './emails'
import {
  buildCancelReply,
  buildReschedulePrompt,
  buildTrollHaltReply,
  buildDoubleBookReply,
  buildMissingDataAlert,
  buildSuccessReply,
  shouldAllowReschedule,
  resolveBookingData,
} from './booking_pure'

export { RESCHEDULE_LIMIT } from './booking_pure'

export type BookingContext = {
  agentId: string
  lead: any
  leadUpdates: Record<string, any>
  bookingLeadState: any
  phone: string
  agent: any
  existingAppointment: any
  resolvedMatchedPropertyId: string | null
  tutorialMode?: boolean
}

export async function createAppointment(
  ctx: BookingContext,
  visitTime: string,
  propertyId: string,
): Promise<string> {
  const { agentId, lead, leadUpdates, bookingLeadState, phone, agent } = ctx
  const leadName = leadUpdates.name || bookingLeadState?.name || lead.name || 'Guest'
  const customerEmail = leadUpdates.email || bookingLeadState?.email || lead.email

  const { error: appointmentErr } = await supabaseAdmin
    .from('appointments')
    .insert({ agent_id: agentId, lead_id: lead.id, property_id: propertyId, scheduled_at: visitTime, status: 'upcoming' })
    .select()
    .single()

  if (appointmentErr) {
    const { data: verify } = await supabaseAdmin
      .from('appointments').select('id').eq('lead_id', lead.id).eq('status', 'upcoming').maybeSingle()
    if (!verify) {
      console.error(`[ai-bot] appointment creation FAILED for ${phone}:`, appointmentErr.message)
      await emailSuperadmin(
        '⚠️ Appointment Creation Failed',
        `Site visit booking FAILED\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${customerEmail}\nRequested Time: ${visitTime}\n\nError: ${appointmentErr.message}`
      )
      return `I'm having a small issue saving your visit. Our team will call you shortly to confirm the slot. 🙏`
    }
  }

  console.log(`[ai-bot] appointment saved for ${phone} at ${visitTime}`)
  await supabaseAdmin.from('leads').update({
    status: 'visit_booked',
    bot_stage: 'visit_confirmed',
    pending_appointment_time: null,
    pending_appointment_set_at: null,
    confirmation_followup_sent_at: null,
    nurture_state: 'paused',
    window_nudge_count: 0,
    last_nudge_at: null,
    nurture_plan: null,
    plan_d_touches: 0,
  }).eq('id', lead.id)
  const { data: prop } = await supabaseAdmin.from('properties').select('title').eq('id', propertyId).single()
  const propertyTitle = prop?.title || 'Selected Property'
  if (customerEmail) await sendCustomerConfirmation(customerEmail, leadName, propertyTitle, visitTime)
  if (agent!.email) await sendAgentNotification(agent!.email, leadName, phone, customerEmail || 'Not provided', propertyTitle, visitTime)

  return buildSuccessReply(visitTime, customerEmail, leadName)
}

export async function executeBookingAction(
  action: 'book_visit' | 'reschedule_visit' | 'cancel_visit',
  ctx: BookingContext,
  newTime: string | undefined,
): Promise<string> {
  const { lead, phone, agent, existingAppointment, resolvedMatchedPropertyId, leadUpdates, bookingLeadState } = ctx

  if (action === 'cancel_visit') {
    if (existingAppointment) {
      await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment.id)
    }
    return buildCancelReply(existingAppointment)
  }

  if (action === 'reschedule_visit') {
    const { count: apptCount } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id)

    if (!shouldAllowReschedule(apptCount || 0)) {
      await notifyAgentOfTrollHalt(agent, lead, phone, 'too many reschedules')
      return buildTrollHaltReply()
    }
    if (!newTime) {
      return buildReschedulePrompt()
    }
    if (bookingTimeIssue(newTime, agent)) {
      return bookingTimeIssue(newTime, agent)!
    }
    await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment!.id)
    const propertyId = resolvedMatchedPropertyId || existingAppointment!.property_id
    return await createAppointment(ctx, newTime, propertyId)
  }

  // action === 'book_visit'
  const { visitTime, propertyId } = resolveBookingData(newTime, bookingLeadState, lead, resolvedMatchedPropertyId, existingAppointment)

  if (existingAppointment) {
    return buildDoubleBookReply(existingAppointment)
  }
  if (!visitTime || !propertyId) {
    const leadName = leadUpdates.name || lead.name || phone
    console.error('[ai-bot] booking missing data', {
      lead_id: lead.id,
      visitTime: visitTime || null,
      propertyId: propertyId || null,
      pendingFromDb: bookingLeadState?.pending_appointment_time || null,
      matchedFromDb: bookingLeadState?.matched_property_id || null,
      matchedResolved: resolvedMatchedPropertyId || null,
      tutorialMode: !!ctx.tutorialMode,
    })
    const alert = buildMissingDataAlert(leadName, phone, leadUpdates.email || lead.email, visitTime, propertyId)
    await emailSuperadmin(alert.alertSubject, alert.alertBody)
    return alert.reply
  }
  if (bookingTimeIssue(visitTime, agent)) {
    console.error('[ai-bot] booking blocked by schedule', {
      lead_id: lead.id,
      visitTime,
      weekly_off: agent.weekly_off || null,
      office_open: agent.office_open || null,
      office_close: agent.office_close || null,
    })
    return bookingTimeIssue(visitTime, agent)!
  }
  return await createAppointment(ctx, visitTime, propertyId)
}