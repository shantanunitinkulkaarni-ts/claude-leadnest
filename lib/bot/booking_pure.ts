// lib/bot/booking_pure.ts
// Pure helpers extracted from booking.ts for unit testing (Phase 3).
// No DB imports — these functions take data and return strings/objects.

import { formatIST } from '../timeParser'

const RESCHEDULE_LIMIT = 5

/** Build the cancel reply message based on whether an appointment exists. */
export function buildCancelReply(existingAppointment: any): string {
  if (existingAppointment) {
    return `Done — your site visit for ${formatIST(existingAppointment.scheduled_at)} has been cancelled. Would you like to book a new time? 😊`
  }
  return `You don't have an upcoming site visit to cancel. Would you like to book one? 😊`
}

/** Build the reschedule prompt when no new time was given yet. */
export function buildReschedulePrompt(): string {
  return `Sure, let's reschedule! What new date and time works for you? (e.g. "tomorrow 3 PM")`
}

/** Build the troll-halt reply when too many reschedules. */
export function buildTrollHaltReply(): string {
  return `I see you've changed your visit time a few times already. To make sure we get it right, our team will personally connect with you to finalise a slot. 🙏`
}

/** Build the "you already have a booking" reply. */
export function buildDoubleBookReply(existingAppointment: any): string {
  return `You already have a site visit booked for ${formatIST(existingAppointment.scheduled_at)}. Would you like to reschedule it to a new time, or cancel it? 😊`
}

/** Build the "missing data" reply + alert context. */
export function buildMissingDataAlert(
  leadName: string,
  phone: string,
  email: string | undefined,
  visitTime: string | undefined,
  propertyId: string | undefined,
): { reply: string; alertSubject: string; alertBody: string } {
  return {
    reply: `I have your details — our team will reach out shortly to lock in your visit slot. 🙏`,
    alertSubject: '⚠️ Booking could not complete (missing data)',
    alertBody: `A booking was triggered but data was missing.\n\nLead: ${leadName}\nPhone: ${phone}\nEmail: ${email || 'MISSING'}\nVisit time: ${visitTime || 'MISSING'}\nProperty: ${propertyId || 'MISSING — no property matched yet'}`,
  }
}

/** Build the success reply after appointment creation. */
export function buildSuccessReply(
  visitTime: string,
  customerEmail: string | undefined,
  leadName: string,
): string {
  return `✅ Your site visit is confirmed for ${formatIST(visitTime)}.` +
    (customerEmail ? ` A confirmation email is on its way to ${customerEmail}.` : '') +
    ` See you then, ${leadName}! 😊`
}

/** Check if reschedule should be allowed based on appointment count. */
export function shouldAllowReschedule(apptCount: number): boolean {
  return apptCount < RESCHEDULE_LIMIT
}

/** Resolve the visit time and property ID from all available sources. */
export function resolveBookingData(
  newTime: string | undefined,
  bookingLeadState: any,
  lead: any,
  resolvedMatchedPropertyId: string | null,
  existingAppointment: any,
): { visitTime: string | undefined; propertyId: string | undefined } {
  const visitTime = newTime || bookingLeadState?.pending_appointment_time || lead.pending_appointment_time
  const propertyId = resolvedMatchedPropertyId || bookingLeadState?.matched_property_id || existingAppointment?.property_id
  return { visitTime, propertyId }
}

export { RESCHEDULE_LIMIT }