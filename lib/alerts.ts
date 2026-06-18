import { sendEmail } from './email'
import { sendWhatsAppMessage, sendViaMsg91, sendViaMsg91Template } from './whatsapp'

// ─── High-priority agent alerts: the trio ─────────────────────────────────────
// Founder rule (June 13): anything that directly affects ROI must reach the
// agent on EVERY channel we have — email + WhatsApp now, voice call later
// (MSG91 supports calls; revisit when/if we stay with them — Meta App Review
// approval may retire MSG91 entirely, which is why routing stays per-agent).
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
    // Values for the approved MSG91 alert template's {{1}}, {{2}}, … slots —
    // used when sending from Convorian's master number (CONVORIAN_WA_NUMBER).
    templateValues?: string[]
    // The business number that received the current inbound (webhook context).
    // Used for MSG91 routing when the agent record has no number of its own.
    msg91IntegratedNumber?: string
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

  // 2) WhatsApp — to the agent's own phone.
  // Preferred route: a TEMPLATE from Convorian's official master number
  // (works outside the 24h window — set CONVORIAN_WA_NUMBER + the approved
  // MSG91_ALERT_TEMPLATE name in env to activate). Fallback: a session message
  // from the agent's own Convorian number (24h window applies).
  try {
    const agentPhone = String(agent.phone || '').replace(/\D/g, '')
    if (agentPhone) {
      let waId: string | null = null

      const masterNumber = String(process.env.CONVORIAN_WA_NUMBER || '').replace(/\D/g, '')
      const alertTemplate = process.env.MSG91_ALERT_TEMPLATE || ''
      if (masterNumber && alertTemplate && opts.templateValues?.length) {
        waId = await sendViaMsg91Template(masterNumber, agentPhone, alertTemplate, opts.templateValues)
      }

      if (!waId) {
        const integrated = String(agent.msg91_integrated_number || opts.msg91IntegratedNumber || '').replace(/\D/g, '')
        if (integrated) {
          waId = (await sendViaMsg91(integrated, agentPhone, opts.whatsappText)).id
        } else if (agent.wa_phone_number_id && agent.wa_access_token) {
          waId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, agentPhone, opts.whatsappText)
        }
      }
      result.whatsapp = !!waId
    }
  } catch (e: any) {
    console.error('Alert WhatsApp failed (non-critical):', e?.message)
  }

  // 3) Voice call — not yet. MSG91 offers calling APIs; add here if we stay
  // with them past Meta App Review. Keep the trio shape ready.

  console.log(`High-priority alert sent — email: ${result.email}, whatsapp: ${result.whatsapp} (agent ${agent.id})`)
  return result
}
