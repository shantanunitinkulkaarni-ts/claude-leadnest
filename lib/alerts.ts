import { sendEmail } from './email'
import { sendWhatsAppMessage } from './whatsapp'

// ─── High-priority agent alerts: the trio ─────────────────────────────────────
// Founder rule (June 13): anything that directly affects ROI must reach the
// agent on EVERY channel we have — email + WhatsApp now, voice call later.
// WhatsApp goes via Meta Cloud API direct (the legacy provider fully removed). Out-of-window
// WhatsApp alerts will need an approved Meta alert template (follow-up); until
// then email is the guaranteed channel and the WhatsApp leg is best-effort.
//
// Every channel is best-effort: one failing must never block the others or
// the caller. Returns which channels actually went out.

export type AlertResult = { email: boolean; whatsapp: boolean }

export async function sendHighPriorityAlert(
  agent: any,
  opts: {
    subject: string
    html: string
    whatsappText: string
  }
): Promise<AlertResult> {
  const result: AlertResult = { email: false, whatsapp: false }

  // 1) Email
  try {
    if (agent.email) {
      const r = await sendEmail({ to: agent.email, subject: opts.subject, html: opts.html })
      result.email = !!r.ok
    }
  } catch (e: any) {
    console.error('Alert email failed (non-critical):', e?.message)
  }

  // 2) WhatsApp — to the agent's own phone, via Meta Cloud API direct.
  // A session (free-text) message from the agent's own TING number; the
  // 24h window applies. Out-of-window delivery will need an approved Meta alert
  // template (follow-up) — email above is the guaranteed channel meanwhile.
  try {
    const agentPhone = String(agent.phone || '').replace(/\D/g, '')
    if (agentPhone && agent.wa_phone_number_id && agent.wa_access_token) {
      const waId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, agentPhone, opts.whatsappText)
      result.whatsapp = !!waId
    }
  } catch (e: any) {
    console.error('Alert WhatsApp failed (non-critical):', e?.message)
  }

  // 3) Voice call — not yet. Keep the trio shape ready for a future provider.

  console.log(`High-priority alert sent — email: ${result.email}, whatsapp: ${result.whatsapp} (agent ${agent.id})`)
  return result
}
