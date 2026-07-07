// lib/bot/emails.ts
// Email helpers for the AI bot: booking confirmations, agent notifications,
// superadmin alerts, and troll-halt agent alerts. Extracted from lib/ai-bot.ts.
//
// IMPORTANT: do NOT use the `resend` npm package — it is not installed, so
// require('resend') throws at runtime and silently drops every email.
// We use lib/email.ts (Resend REST) directly.

import { sendEmail } from '../email'

/** Send an email via Resend REST, with an optional fallback recipient. */
export async function sendEmailViaResend(
  to: string,
  subject: string,
  body: string,
  fallbackEmail?: string,
): Promise<void> {
  const html = body.replace(/\n/g, '<br>')
  const res = await sendEmail({ to, subject, html })
  if (!res.ok) {
    console.error(`[ai-bot] email to ${to} failed: ${res.error}`)
    if (fallbackEmail) {
      const alt = await sendEmail({ to: fallbackEmail, subject, html })
      console.log(`[ai-bot] fallback email to ${fallbackEmail}: ${alt.ok ? 'sent' : alt.error}`)
    }
  } else {
    console.log(`[ai-bot] email sent to ${to} (id: ${res.id})`)
  }
}

/** Send the site-visit confirmation email to the customer (lead). */
export async function sendCustomerConfirmation(
  customerEmail: string,
  leadName: string,
  propertyTitle: string,
  visitTime: string,
  agent?: any,
): Promise<void> {
  const visitDate = new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const visitTimeStr = new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  const body = `Hi ${leadName},

Your site visit has been confirmed! ✅

📍 Property: ${propertyTitle}
📅 Date: ${visitDate}
🕐 Time: ${visitTimeStr} IST

Our team will reach out to you shortly with more details and directions.

Agent contact:
${agent?.name || agent?.agency_name ? `Name: ${agent?.name || agent?.agency_name}\n` : ''}${agent?.phone ? `Phone: ${agent.phone}\n` : ''}${agent?.email ? `Email: ${agent.email}\n` : ''}

Thank you for choosing us!

Best regards,
TING Team`

  await sendEmailViaResend(customerEmail, '✅ Your Site Visit is Confirmed', body)
}

/** Send the "new site visit request" notification email to the agent. */
export async function sendAgentNotification(
  agentEmail: string,
  leadName: string,
  leadPhone: string,
  leadEmail: string,
  propertyTitle: string,
  visitTime: string,
): Promise<void> {
  const visitDate = new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const visitTimeStr = new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  const body = `New Site Visit Request

Lead: ${leadName}
Phone: ${leadPhone}
Email: ${leadEmail}

Property: ${propertyTitle}
Scheduled: ${visitDate} at ${visitTimeStr} IST

Please confirm if you can accommodate this visit.

---
This is an automated message from TING Bot`

  await sendEmailViaResend(agentEmail, '🔔 New Site Visit Request', body)
}

/** Tell the agent a site visit request needs human review instead of auto-booking. */
export async function notifyAgentOfBookingIssue(
  agentEmail: string,
  leadName: string,
  leadPhone: string,
  leadEmail: string,
  propertyTitle: string,
  visitTime: string | null | undefined,
  reason: string,
): Promise<void> {
  const visitDate = visitTime
    ? new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    : 'Not provided'
  const visitTimeStr = visitTime
    ? new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : 'Not provided'

  const body = `Site visit request needs review

Lead: ${leadName}
Phone: ${leadPhone}
Email: ${leadEmail || 'Not provided'}

Property: ${propertyTitle || 'Not provided'}
Requested: ${visitDate} at ${visitTimeStr} IST
Reason: ${reason}

Please review and connect with the lead directly if needed.

---
This is an automated message from TING Bot`

  await sendEmailViaResend(agentEmail, '⚠️ Site visit request needs review', body)
}

/** Send a booking copy to superadmins, including agent contact details. */
export async function sendSuperadminBookingCopy(
  leadName: string,
  leadPhone: string,
  leadEmail: string,
  propertyTitle: string,
  visitTime: string,
  agent: any,
): Promise<void> {
  const visitDate = new Date(visitTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const visitTimeStr = new Date(visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

  const body = `Site visit booked

Lead: ${leadName}
Phone: ${leadPhone}
Email: ${leadEmail}

Property: ${propertyTitle}
Scheduled: ${visitDate} at ${visitTimeStr} IST

Agent:
Name: ${agent?.name || 'Not provided'}
Agency: ${agent?.agency_name || 'Not provided'}
Phone: ${agent?.phone || 'Not provided'}
Email: ${agent?.email || 'Not provided'}
Agent ID: ${agent?.id || 'Not provided'}

This is an automated copy from TING Bot.`

  await emailSuperadmin('Site visit booked', body)
}

/** Send an error alert to superadmin (support@convorian.in + gmail fallback). */
export async function emailSuperadmin(subject: string, body: string): Promise<void> {
  const adminEmail = 'support@convorian.in'
  const fallbackEmail = 'convorian@gmail.com'
  await sendEmailViaResend(adminEmail, subject, body, fallbackEmail)
}

/** Tell the agent a lead hit an abuse guard so a human can take over. */
export async function notifyAgentOfTrollHalt(
  agent: any,
  lead: any,
  phone: string,
  reason: string,
): Promise<void> {
  const leadName = lead?.name || phone
  if (agent?.email) {
    await sendEmailViaResend(
      agent.email,
      '🚦 Lead needs a human (auto-paused)',
      `The bot paused automatically for a lead and needs you to take over.\n\nLead: ${leadName}\nPhone: ${phone}\nReason: ${reason}\n\nPlease reach out to them directly.`
    )
  }
}
