import axios from 'axios'
// Use the service-role client: these helpers run server-side (webhook/cron) with
// no logged-in user. The anon client is subject to RLS (agents/wa_transactions
// are tenant-scoped to authenticated team_members), so it silently writes
// NOTHING here — balance never deducts, no transaction logs. supabaseAdmin
// bypasses RLS, which is correct for trusted server code.
import { supabaseAdmin } from './supabase'

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
        // Non-bulk session API expects `text` at the top level
        // (returns "text not found in request" when nested under payload).
        text: message,
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

// ─── MSG91 image/media session message (within the 24h window) ────────────────
// Sends an image by URL through MSG91. NOTE: MSG91's media payload shape isn't
// documented identically across accounts — this follows the session-message
// pattern (type:image, media link top-level + nested payload, like the text
// sender). Verify once with POST /api/admin/test-media before enabling broadly
// (gated by MSG91_MEDIA_LIVE). Logs the full response so the first real send
// reveals the exact accepted shape. Best-effort: returns null on any failure.
export async function sendViaMsg91Media(
  integratedNumber: string,
  toPhone: string,
  mediaUrl: string,
  caption?: string
): Promise<string | null> {
  try {
    const authkey = process.env.MSG91_AUTHKEY
    if (!authkey) { console.error('MSG91 media: MSG91_AUTHKEY not set'); return null }
    if (!/^https?:\/\//i.test(mediaUrl)) { console.error('MSG91 media: invalid url', mediaUrl); return null }
    const to = toPhone.replace(/^\+/, '')
    const res = await axios.post(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/',
      {
        integrated_number: integratedNumber,
        content_type: 'media',
        recipient_number: to,
        media: { type: 'image', url: mediaUrl, ...(caption ? { caption } : {}) },
        payload: {
          to,
          type: 'image',
          image: { link: mediaUrl, ...(caption ? { caption } : {}) },
          messaging_product: 'whatsapp',
        },
      },
      { headers: { authkey, 'Content-Type': 'application/json' } }
    )
    console.log('MSG91 media OK:', JSON.stringify(res.data).slice(0, 400))
    return res.data?.data?.[0]?.requestId || res.data?.requestId || res.data?.request_id || 'sent'
  } catch (err: any) {
    console.error('MSG91 media ERROR:', JSON.stringify(err?.response?.data || err?.message).slice(0, 600))
    return null
  }
}

// ─── Meta image message (within the 24h window) ──────────────────────────────
export async function sendMetaImage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  mediaUrl: string,
  caption?: string
): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(mediaUrl)) return null
    const res = await axios.post(
      `${WA_BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'image',
        image: { link: mediaUrl, ...(caption ? { caption } : {}) },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    )
    return res.data?.messages?.[0]?.id || null
  } catch (err: any) {
    console.error('Meta image error:', err?.response?.data || err.message)
    return null
  }
}

// ─── MSG91 template message ───────────────────────────────────────────────────
// Templates work OUTSIDE the 24h session window (proactive re-engagement +
// agent alerts). The template must be approved in MSG91 first.
// `bodyValues` accepts (positional, in template-variable order):
//   - string[]                 → numbered templates ({{1}},{{2}}…): body_N = value
//   - { name, value }[]        → NAMED templates ({{customer_name}}…): each body_N
//                                also carries parameter_name (Meta requires this
//                                for named-parameter templates).
type TemplateVar = { name: string; value: string }
export async function sendViaMsg91Template(
  integratedNumber: string,
  toPhone: string,
  templateName: string,
  bodyValues: string[] | TemplateVar[],
  languageCode = 'en'
): Promise<string | null> {
  try {
    const authkey = process.env.MSG91_AUTHKEY
    if (!authkey) { console.error('MSG91 template send: MSG91_AUTHKEY not set'); return null }
    const to = toPhone.replace(/^\+/, '')
    const components: Record<string, any> = {}
    bodyValues.forEach((v, i) => {
      if (typeof v === 'string') {
        // Numbered templates use {{1}}, {{2}}… — parameter_name must match the var name
        components[`body_${i + 1}`] = { type: 'text', value: v, parameter_name: String(i + 1) }
      } else {
        components[`body_${i + 1}`] = { type: 'text', value: v.value, parameter_name: v.name }
      }
    })
    const res = await axios.post(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
      {
        integrated_number: integratedNumber.replace(/\D/g, ''),
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode, policy: 'deterministic' },
            to_and_components: [{ to: [to], components }],
          },
        },
      },
      { headers: { authkey, 'Content-Type': 'application/json' } }
    )
    console.log('MSG91 template send OK:', JSON.stringify(res.data).slice(0, 500))
    return res.data?.data?.[0]?.requestId || res.data?.requestId || res.data?.request_id || 'sent'
  } catch (err: any) {
    console.error('MSG91 template send ERROR:', JSON.stringify(err?.response?.data || err?.message).slice(0, 500))
    return null
  }
}

// ─── Provider-aware free-text send to a lead ─────────────────────────────────
// Picks the right channel for an agent automatically: MSG91 if the agent has an
// integrated number (current primary BSP), else Meta Cloud API. Used by the
// nurture cron + reminders so follow-ups work regardless of provider. Free-text
// = only valid inside the lead's 24h window (caller must check).
export async function sendToLead(agent: any, lead: any, message: string): Promise<string | null> {
  const integrated = String(agent?.msg91_integrated_number || '').replace(/\D/g, '')
  if (integrated) {
    return sendViaMsg91(integrated, lead.phone, message)
  }
  if (agent?.wa_phone_number_id && agent?.wa_access_token) {
    return sendViaMeta(agent.wa_phone_number_id, agent.wa_access_token, lead.phone, message)
  }
  console.warn('sendToLead: agent has no MSG91 or Meta credentials', agent?.id)
  return null
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
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('wa_balance')
    .eq('id', agentId)
    .single()

  if (!agent) return

  const newBalance = Number(agent.wa_balance) - amount

  await supabaseAdmin
    .from('agents')
    .update({ wa_balance: newBalance })
    .eq('id', agentId)

  await supabaseAdmin.from('wa_transactions').insert({
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

  await supabaseAdmin
    .from('leads')
    .update({ window_keepalive_sent_at: new Date().toISOString() })
    .eq('id', lead.id)

  return waMessageId
}
