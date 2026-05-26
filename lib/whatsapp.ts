import axios from 'axios'
import { supabaseAdmin } from './supabase'

const WA_API_VERSION = 'v19.0'
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`

// Send a plain text message
export async function sendWhatsAppMessage(
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
    console.error('WhatsApp send error:', err?.response?.data || err.message)
    return null
  }
}

// Send a template message (for outbound / marketing / reminders)
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
    console.error('WhatsApp template error:', err?.response?.data || err.message)
    return null
  }
}

// Deduct from agent WA balance and log transaction
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

// Pre-approved templates
export const TEMPLATES = {
  APPOINTMENT_REMINDER: 'leadnest_appointment_reminder',
  NURTURE_FOLLOWUP: 'leadnest_nurture_followup',
  REENGAGEMENT: 'leadnest_reengagement',
  KEEPALIVE: null // Uses free-form text (within 24h window)
}

// Appointment reminder template message
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

  // Deduct Meta charge (utility template ~₹0.32)
  await deductWABalance(agent.id, 0.32, `Appointment reminder — ${lead.name}`, TEMPLATES.APPOINTMENT_REMINDER, lead.id)

  return waMessageId
}

// 23-hour window keep-alive message (free — within session window)
export async function sendWindowKeepalive(
  agent: any,
  lead: any
) {
  const messages = [
    `Just checking in — did you get a chance to look at the property details I shared? 😊`,
    `Hi ${lead.name || 'there'}! Is there anything else you'd like to know about the property?`,
    `We have a few more options that just came in. Would you like me to share them?`,
    `${lead.name || 'Hi'}! Happy to answer any questions you might have before making a decision.`,
    `Hi ${lead.name || 'there'}! The property you liked is still available. Want to schedule a quick visit this week?`
  ]

  // Pick a random message
  const message = messages[Math.floor(Math.random() * messages.length)]

  const waMessageId = await sendWhatsAppMessage(
    agent.wa_phone_number_id,
    agent.wa_access_token,
    lead.phone,
    message
  )

  // Update keepalive timestamp
  await supabaseAdmin
    .from('leads')
    .update({ window_keepalive_sent_at: new Date().toISOString() })
    .eq('id', lead.id)

  return waMessageId
}
