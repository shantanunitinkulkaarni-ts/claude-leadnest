import axios from 'axios'
// Use the service-role client: these helpers run server-side (webhook/cron) with
// no logged-in user. The anon client is subject to RLS (agents/wa_transactions
// are tenant-scoped to authenticated team_members), so it silently writes
// NOTHING here — balance never deducts, no transaction logs. supabaseAdmin
// bypasses RLS, which is correct for trusted server code.
import { supabaseAdmin } from './supabase'

const WA_API_VERSION = 'v19.0'
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`

// Result of a send: the provider message id on success, or the failure reason on
// rejection (so a rejected reply isn't mistaken for a sent one). `retryable`
// marks failures worth retrying (momentary glitches).
export type SendOutcome = { id: string | null; error: string | null; retryable?: boolean }

// Is a failed send worth retrying? Only momentary glitches — NOT permanent
// rejections. A permanent 4xx (bad/blocked number, closed window, unapproved
// template) will fail identically on retry, so retrying just wastes time and
// risks a duplicate; we go straight to "inform" (item #4) for those.
//   • no HTTP response (network/DNS/timeout)  → retry
//   • 429 (rate limited) or 5xx (server)       → retry
//   • any other 4xx                            → don't retry (permanent)
export function isRetryableSendError(err: any): boolean {
  const status = err?.response?.status
  if (status === undefined || status === null) return true
  if (status === 429 || status >= 500) return true
  return false
}

// Run a send up to `attempts` times, pausing `gapMs` between tries, but ONLY
// retrying momentary-glitch failures. Returns as soon as it succeeds, or on the
// first permanent failure. Pure/testable — the send fn is injected. Item #2.
export async function sendWithRetry(
  send: () => Promise<SendOutcome>,
  opts: { attempts?: number; gapMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<SendOutcome> {
  const attempts = opts.attempts ?? 3 // 1 initial + 2 retries
  const gapMs = opts.gapMs ?? 1200
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let last: SendOutcome = { id: null, error: 'not attempted' }
  for (let i = 0; i < attempts; i++) {
    last = await send()
    if (last.id) return last            // delivered to the provider — done
    if (last.retryable === false) return last // permanent — don't waste retries
    if (i < attempts - 1) await sleep(gapMs)
  }
  return last
}

// ─── Send plain text message ──────────────────────────────────────────────────
export async function sendWhatsAppMessage(
  phoneNumberId: string,  // Meta phone_number_id
  accessToken: string,    // Meta access token
  toPhone: string,
  message: string
): Promise<string | null> {
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

// ─── Reply channel (Meta Cloud API direct) ───────────────────────────────────
// A WaChannel carries the agent's Meta credentials so the bot can reply. We run
// Meta-direct only (Tech Provider) — the legacy provider has been removed from the live path.
export type WaChannel = { phoneNumberId: string; accessToken: string }

// Send free-text to a lead via Meta Cloud API. Normalised to a SendOutcome.
export async function waSendText(ch: WaChannel, toPhone: string, message: string): Promise<SendOutcome> {
  const id = await sendViaMeta(ch.phoneNumberId, ch.accessToken, toPhone.replace(/^\+/, ''), message)
  return { id, error: id ? null : 'meta send failed', retryable: !id }
}

// Send an image to a lead via Meta Cloud API.
export async function waSendMedia(ch: WaChannel, toPhone: string, mediaUrl: string, caption?: string): Promise<SendOutcome> {
  const id = await sendMetaImage(ch.phoneNumberId, ch.accessToken, toPhone.replace(/^\+/, ''), mediaUrl, caption)
  return { id, error: id ? null : 'meta media failed', retryable: !id }
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


// ─── Free-text send to a lead (Meta Cloud API) ───────────────────────────────
// Used by the nurture cron + reminders. Free-text = only valid inside the lead's
// 24h window (caller must check).
export async function sendToLead(agent: any, lead: any, message: string): Promise<string | null> {
  if (agent?.wa_phone_number_id && agent?.wa_access_token) {
    return sendViaMeta(agent.wa_phone_number_id, agent.wa_access_token, lead.phone, message)
  }
  console.warn('sendToLead: agent has no Meta credentials', agent?.id)
  return null
}

// ─── Template message (Meta Cloud API) ───────────────────────────────────────
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<string | null> {
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
  APPOINTMENT_REMINDER: 'visit_reminder', // Meta-approved (Utility): customer_name, agency_name, property, visit_date, visit_time
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
  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'customer_name', text: lead.name || 'there' },
        { type: 'text', parameter_name: 'agency_name', text: agent?.agency_name || 'your property advisor' },
        { type: 'text', parameter_name: 'property', text: property?.title || 'the property' },
        { type: 'text', parameter_name: 'visit_date', text: new Date(appointment.scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) },
        { type: 'text', parameter_name: 'visit_time', text: new Date(appointment.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) }
      ]
    }
  ]

  // visit_reminder is approved in en/hi/mr (same named params) — send in the
  // lead's chat language; fall back to English for anything else.
  const reminderLang = ['en', 'hi', 'mr'].includes(lead.language) ? lead.language : 'en'

  const waMessageId = await sendWhatsAppTemplate(
    agent.wa_phone_number_id,
    agent.wa_access_token,
    lead.phone,
    TEMPLATES.APPOINTMENT_REMINDER,
    reminderLang,
    components
  )

  // Meta-direct: the agent pays Meta directly — no wallet deduction.
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
