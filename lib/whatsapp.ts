import axios from 'axios'
import { supabase } from './supabase'

// ─── Provider detection ───────────────────────────────────────────────────────
// Set WHATSAPP_PROVIDER=twilio in env for Twilio, anything else = Meta
const PROVIDER = process.env.WHATSAPP_PROVIDER || 'meta'

const WA_API_VERSION = 'v19.0'
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`

// ─── Send plain text message ──────────────────────────────────────────────────
export async function sendWhatsAppMessage(
  phoneNumberId: string,  // Meta: phone_number_id | Twilio: ignored (uses env)
  accessToken: string,    // Meta: access token    | Twilio: ignored (uses env)
  toPhone: string,
  message: string
): Promise<string | null> {
  if (PROVIDER === 'twilio') {
    return sendViaTwilio(toPhone, message)
  }
  return sendViaMeta(phoneNumberId, accessToken, toPhone, message)
}

// ─── Meta sender ──────────────────────────────────────────────────────────────
async function sendViaMeta(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  message: string
): Promise<string | null> {
  try {
    const res = await axios.post(
      `${WA_BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { body: message, preview_url: false }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return res.data?.messages?.[0]?.id || null
  } catch (err: any) {
    console.error('Meta send error:', err?.response?.data || err.message)
    return null
  }
}

// ─── Twilio sender ────────────────────────────────────────────────────────────
async function sendViaTwilio(
  toPhone: string,
  message: string
): Promise<string | null> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!
    const authToken = process.env.TWILIO_AUTH_TOKEN!
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER! // whatsapp:+12184757450

    // Ensure numbers are in whatsapp: format
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`
    const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`

    const params = new URLSearchParams({ From: from, To: to, Body: message })

    const res = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      params.toString(),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )
    return res.data?.sid || null
  } catch (err: any) {
    console.error('Twilio send error:', err?.response?.data || err.message)
    return null
  }
}

// ─── MSG91 sender (WhatsApp Business API via MSG91 BSP) ───────────────────────
// Sends a free-text session reply (within the 24h window) through MSG91.
// integratedNumber = the business number that received the message (from webhook).
export async function sendViaMsg91(
  integratedNumber: string,
  toPhone: string,
  message: string
): Promise<string | null> {
  try {
    const authkey = process.env.MSG91_AUTHKEY
    if (!authkey) { console.error('MSG91 send: MSG91_AUTHKEY not set'); return null }
    const to = toPhone.replace(/^\+/, '')
    // NOTE: the /bulk/ variant of this endpoint accepts ONLY templates
    // ("for now, only template is supported for bulk"). Free-text session
    // replies (inside the 24h window) must use the non-bulk endpoint.
    const res = await axios.post(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/',
      {
        integrated_number: integratedNumber,
        content_type: 'text',
        recipient_number: to,
        payload: {
          to,
          type: 'text',
          text: { body: message },
          messaging_product: 'whatsapp'
        }
      },
      { headers: { authkey, 'Content-Type': 'application/json' } }
    )
    console.log('MSG91 send OK:', JSON.stringify(res.data).slice(0, 400))
    return res.data?.data?.[0]?.requestId || res.data?.requestId || res.data?.request_id || 'sent'
  } catch (err: any) {
    console.error('MSG91 send ERROR:', JSON.stringify(err?.response?.data || err?.message).slice(0, 600))
    return null
  }
}

// ─── Template message (Meta only — Twilio uses free-form for sandbox) ─────────
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<string | null> {
  if (PROVIDER === 'twilio') {
    // Twilio sandbox doesn't support templates — send plain text fallback
    console.log('Template send skipped (Twilio sandbox) — would send:', templateName)
    return null
  }

  try {
    const res = await axios.post(
      `${WA_BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return res.data?.messages?.[0]?.id || null
  } catch (err: any) {
    console.error('Meta template error:', err?.response?.data || err.message)
    return null
  }
}

// ─── Balance deduction ────────────────────────────────────────────────────────
export async function deductWABalance(
  agentId: string,
  amount: number,
  description: string,
  templateName?: string,
  leadId?: string
) {
  const { data: agent } = await supabase
    .from('agents')
    .select('wa_balance')
    .eq('id', agentId)
    .single()

  if (!agent) return

  const newBalance = Number(agent.wa_balance) - amount

  await supabase
    .from('agents')
    .update({ wa_balance: newBalance })
    .eq('id', agentId)

  await supabase.from('wa_transactions').insert({
    agent_id: agentId,
    type: 'deduction',
    amount,
    description,
    balance_after: newBalance,
    template_name: templateName,
    lead_id: leadId
  })
}

// ─── Templates ────────────────────────────────────────────────────────────────
export const TEMPLATES = {
  APPOINTMENT_REMINDER: 'leadnest_appointment_reminder',
  NURTURE_FOLLOWUP: 'leadnest_nurture_followup',
  REENGAGEMENT: 'leadnest_reengagement',
  KEEPALIVE: null
}

// ─── Appointment reminder ─────────────────────────────────────────────────────
export async function sendAppointmentReminder(
  agent: any,
  lead: any,
  appointment: any,
  property: any
) {
  if (PROVIDER === 'twilio') {
    const dateStr = new Date(appointment.scheduled_at).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long'
    })
    const timeStr = new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    })
    const message = `Hi ${lead.name || 'there'}! Reminder: your site visit for ${property?.title || 'the property'} is on ${dateStr} at ${timeStr}. See you there! 🏠`
    return sendViaTwilio(lead.phone, message)
  }

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: lead.name || 'there' },
        { type: 'text', text: property?.title || 'the property' },
        { type: 'text', text: new Date(appointment.scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) },
        { type: 'text', text: new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }
      ]
    }
  ]

  const waMessageId = await sendWhatsAppTemplate(
    agent.wa_phone_number_id,
    agent.wa_access_token,
    lead.phone,
    TEMPLATES.APPOINTMENT_REMINDER,
    'en',
    components
  )

  await deductWABalance(agent.id, 0.32, `Appointment reminder — ${lead.name}`, TEMPLATES.APPOINTMENT_REMINDER, lead.id)
  return waMessageId
}

// ─── 23-hour keepalive ────────────────────────────────────────────────────────
export async function sendWindowKeepalive(agent: any, lead: any) {
  const messages = [
    `Just checking in — did you get a chance to look at the property details I shared? 😊`,
    `Hi ${lead.name || 'there'}! Is there anything else you'd like to know about the property?`,
    `We have a few more options that just came in. Would you like me to share them?`,
    `${lead.name || 'Hi'}! Happy to answer any questions you might have before making a decision.`,
    `Hi ${lead.name || 'there'}! The property you liked is still available. Want to schedule a quick visit this week?`
  ]

  const message = messages[Math.floor(Math.random() * messages.length)]

  const waMessageId = await sendWhatsAppMessage(
    agent.wa_phone_number_id,
    agent.wa_access_token,
    lead.phone,
    message
  )

  await supabase
    .from('leads')
    .update({ window_keepalive_sent_at: new Date().toISOString() })
    .eq('id', lead.id)

  return waMessageId
}
