// lib/bot/booking.ts
// Appointment booking/reschedule/cancel logic for the AI bot.
// Extracted from lib/ai-bot.ts as part of the Phase 1 refactor.
//
// Phase 3 will harden this: full E2E tests, fix the "missing data" path.

import { supabaseAdmin } from '../supabase'
import { formatIST, bookingTimeIssue } from '../timeParser'
import { sendCustomerConfirmation, sendAgentNotification, emailSuperadmin, notifyAgentOfTrollHalt } from './emails'

const RESCHEDULE_LIMIT = 5

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

  return `✅ Your site visit is confirmed for ${formatIST(visitTime)}.` +
    (customerEmail ? ` A confirmation email is on its way to ${customerEmail}.` : '') +
    ` See you then, ${leadName}! 😊`
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
      return `Done — your site visit for ${formatIST(existingAppointment.scheduled_at)} has been cancelled. Would you like to book a new time? 😊`
    }
    return `You don't have an upcoming site visit to cancel. Would you like to book one? 😊`
  }

  if (action === 'reschedule_visit') {
    const { count: apptCount } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id)

    if ((apptCount || 0) >= RESCHEDULE_LIMIT) {
      await notifyAgentOfTrollHalt(agent, lead, phone, 'too many reschedules')
      return `I see you've changed your visit time a few times already. To make sure we get it right, our team will personally connect with you to finalise a slot. 🙏`
    }
    if (!newTime) {
      return `Sure, let's reschedule! What new date and time works for you? (e.g. "tomorrow 3 PM")`
    }
    if (bookingTimeIssue(newTime, agent)) {
      return bookingTimeIssue(newTime, agent)!
    }
    await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment!.id)
    const propertyId = resolvedMatchedPropertyId || existingAppointment!.property_id
    return await createAppointment(ctx, newTime, propertyId)
  }

  // action === 'book_visit'
  const visitTime = newTime || bookingLeadState?.pending_appointment_time || lead.pending_appointment_time
  const propertyId = resolvedMatchedPropertyId || bookingLeadState?.matched_property_id || existingAppointment?.property_id

  if (existingAppointment) {
    return `You already have a site visit booked for ${formatIST(existingAppointment.scheduled_at)}. Would you like to reschedule it to a new time, or cancel it? 😊`
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
    await emailSuperadmin(
      '⚠️ Booking could not complete (missing data)',
      `A booking was triggered but data was missing.\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${leadUpdates.email || lead.email || 'MISSING'}\nVisit time: ${visitTime || 'MISSING'}\nProperty: ${propertyId || 'MISSING — no property matched yet'}`
    )
    return `I have your details — our team will reach out shortly to lock in your visit slot. 🙏`
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