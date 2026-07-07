// lib/bot/booking.ts
// Appointment booking/reschedule/cancel logic for the AI bot.
// Extracted from lib/ai-bot.ts as part of the Phase 1 refactor.
//
// Phase 3: extracted pure helpers to booking_pure.ts for unit testing.

import { supabaseAdmin } from '../supabase'
import { formatIST, bookingTimeIssue, formatVisitConfirmationWithAI } from '../timeParser'
import {
  sendCustomerConfirmation,
  sendAgentNotification,
  sendSuperadminBookingCopy,
  emailSuperadmin,
  notifyAgentOfTrollHalt,
  notifyAgentOfBookingIssue,
} from './emails'
import {
  buildCancelReply,
  buildReschedulePrompt,
  buildTrollHaltReply,
  buildDoubleBookReply,
  buildMissingDataAlert,
  buildBookingReviewAlert,
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

async function loadBookingProperty(agentId: string, propertyId: string | undefined | null) {
  if (!propertyId) return null
  const { data } = await supabaseAdmin
    .from('properties')
    .select('id, title, status, location')
    .eq('agent_id', agentId)
    .eq('id', propertyId)
    .maybeSingle()
  return data || null
}

function isPropertyBookable(property: any): boolean {
  return String(property?.status || 'active').trim().toLowerCase() === 'active'
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
    nurture_state: 'paused',
    window_nudge_count: 0,
    last_nudge_at: null,
    nurture_plan: null,
    plan_d_touches: 0,
  }).eq('id', lead.id)
  const { data: prop } = await supabaseAdmin.from('properties').select('title').eq('id', propertyId).single()
  const propertyTitle = prop?.title || 'Selected Property'
  if (customerEmail) await sendCustomerConfirmation(customerEmail, leadName, propertyTitle, visitTime, agent)
  if (agent!.email) await sendAgentNotification(agent!.email, leadName, phone, customerEmail || 'Not provided', propertyTitle, visitTime)
  await sendSuperadminBookingCopy(leadName, phone, customerEmail || 'Not provided', propertyTitle, visitTime, agent)

  const confirmationReply = await formatVisitConfirmationWithAI({
    scheduledIso: visitTime,
    language: leadUpdates.language || bookingLeadState?.language || lead.language || null,
    leadName,
    customerEmail: customerEmail || undefined,
  })
  if (confirmationReply && confirmationReply.trim().length >= 8) return confirmationReply
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
    const propertyId = resolvedMatchedPropertyId || existingAppointment!.property_id
    const property = await loadBookingProperty(agent.id, propertyId)
    const rescheduleIssue = bookingTimeIssue(newTime, agent)
    if (rescheduleIssue) {
      const alert = buildBookingReviewAlert({
        leadName: lead.name || phone,
        phone,
        email: leadUpdates.email || bookingLeadState?.email || lead.email,
        visitTime: newTime,
        propertyTitle: property?.title || existingAppointment?.property_id || null,
        reason: rescheduleIssue,
      })
      if (agent?.email) {
        await notifyAgentOfBookingIssue(
          agent.email,
          lead.name || phone,
          phone,
          leadUpdates.email || bookingLeadState?.email || lead.email || '',
          property?.title || existingAppointment?.property_id || 'Selected property',
          newTime,
          rescheduleIssue,
        )
      }
      return alert.reply
    }
    if (!property || !isPropertyBookable(property)) {
      const reason = !property
        ? 'selected property could not be found'
        : `selected property is ${String(property.status || 'inactive').replace(/_/g, ' ')}`
      const alert = buildBookingReviewAlert({
        leadName: lead.name || phone,
        phone,
        email: leadUpdates.email || bookingLeadState?.email || lead.email,
        visitTime: newTime,
        propertyTitle: property?.title || existingAppointment?.property_id || null,
        reason,
      })
      if (agent?.email) {
        await notifyAgentOfBookingIssue(
          agent.email,
          lead.name || phone,
          phone,
          leadUpdates.email || bookingLeadState?.email || lead.email || '',
          property?.title || existingAppointment?.property_id || 'Selected property',
          newTime,
          reason,
        )
      }
      return alert.reply
    }
    await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppointment!.id)
    return await createAppointment(ctx, newTime, propertyId)
  }

  // action === 'book_visit'
  const { visitTime, propertyId } = resolveBookingData(newTime, bookingLeadState, lead, resolvedMatchedPropertyId, existingAppointment)
  const customerEmail = leadUpdates.email || bookingLeadState?.email || lead.email
  const leadName = leadUpdates.name || lead.name || phone

  if (existingAppointment) {
    return buildDoubleBookReply(existingAppointment)
  }
  if (!customerEmail) {
    return 'Please share your email address so I can send the visit confirmation.'
  }
  if (!visitTime || !propertyId) {
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
  const property = await loadBookingProperty(agent.id, propertyId)
  if (bookingTimeIssue(visitTime, agent)) {
    const issue = bookingTimeIssue(visitTime, agent)!
    console.error('[ai-bot] booking blocked by schedule', {
      lead_id: lead.id,
      visitTime,
      weekly_off: agent.weekly_off || null,
      office_open: agent.office_open || null,
      office_close: agent.office_close || null,
    })
    const alert = buildBookingReviewAlert({
      leadName,
      phone,
      email: customerEmail,
      visitTime,
      propertyTitle: property?.title || propertyId,
      reason: issue,
    })
    if (agent?.email) {
      await notifyAgentOfBookingIssue(agent.email, leadName, phone, customerEmail || '', property?.title || propertyId, visitTime, issue)
    }
    return alert.reply
  }
  if (!property || !isPropertyBookable(property)) {
    const reason = !property
      ? 'selected property could not be found'
      : `selected property is ${String(property.status || 'inactive').replace(/_/g, ' ')}`
    console.error('[ai-bot] booking blocked by property status', {
      lead_id: lead.id,
      propertyId,
      propertyStatus: property?.status || null,
    })
    const alert = buildBookingReviewAlert({
      leadName,
      phone,
      email: customerEmail,
      visitTime,
      propertyTitle: property?.title || propertyId,
      reason,
    })
    if (agent?.email) {
      await notifyAgentOfBookingIssue(
        agent.email,
        leadName,
        phone,
        customerEmail || '',
        property?.title || propertyId || 'Selected property',
        visitTime,
        reason,
      )
    }
    return alert.reply
  }
  return await createAppointment(ctx, visitTime, propertyId)
}
