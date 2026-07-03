import type { PrioritySignal, Guardrail } from './intentSignals'

// ─── Alert content + guardrail replies (pure, testable) ──────────────────────
// Builds the agent-facing alert (email + WhatsApp) for each high-priority signal,
// and the lead-facing deflection text for each guardrail. Kept pure so the copy
// is unit-tested; the webhook handles dedup + actual sending.

export type AlertContent = {
  subject: string
  html: string
  whatsappText: string
  templateValues: string[]
}

const esc = (s: string) => String(s || '').replace(/[<>]/g, '')

export function buildAlertContent(
  sig: PrioritySignal,
  opts: { leadName?: string | null; leadPhone: string; agentName?: string | null; lastMessage?: string | null; botReply?: string | null }
): AlertContent {
  const name = esc(opts.leadName || 'A lead')
  const phone = esc(opts.leadPhone)
  const msg = esc((opts.lastMessage || '').slice(0, 200))
  const bot = esc((opts.botReply || '').slice(0, 200))
  const hi = `Hi ${esc(opts.agentName || '')},`.replace('Hi ,', 'Hi,')

  // Per-signal: headline emoji + reason + recommended action.
  const specs: Record<PrioritySignal, { emoji: string; reason: string; action: string }> = {
    visit_booked: {
      emoji: '✅',
      reason: `${name} just booked a site visit.`,
      action: 'Confirm the slot and prepare for the visit.',
    },
    visit_now: {
      emoji: '🔴',
      reason: `${name} is arriving NOW / on the way for a visit.`,
      action: 'Be ready or call them immediately — they are en route.',
    },
    call_request: {
      emoji: '📞',
      reason: `${name} asked for a phone call.`,
      action: `Call them now: ${phone}.`,
    },
    human_request: {
      emoji: '🙋',
      reason: `${name} wants to talk to a real person.`,
      action: `Reach out personally: ${phone}.`,
    },
    very_interested: {
      emoji: '🔥',
      reason: `${name} is showing strong buying intent.`,
      action: `Strike while hot — call them: ${phone}.`,
    },
    knowledge_gap: {
      emoji: '❓',
      reason: `The assistant couldn't fully answer ${name}'s question.`,
      action: 'Send the missing detail or follow up directly.',
    },
    competitor: {
      emoji: '⚠️',
      reason: `Possible competitor/broker probing as ${name}.`,
      action: 'Review before sharing pricing or full inventory.',
    },
  }
  const spec = specs[sig]

  const reasonLine = msg ? `${spec.reason} They said: "${msg}"` : spec.reason

  // For knowledge_gap, also show what the bot deferred — agent needs to know
  // WHAT info is missing (possession date? floor plan? RERA?) so they can fill it.
  const botReplyLine = sig === 'knowledge_gap' && bot
    ? `Bot replied: "${bot}"`
    : null

  const subject = `${spec.emoji} ${name} — ${labelShort(sig)} (${phone})`
  const html =
    `<p>${hi}</p>` +
    `<p><strong>${spec.emoji} ${reasonLine}</strong></p>` +
    (botReplyLine ? `<p style="color:#555;font-size:13px;background:#f5f5f5;padding:8px;border-left:3px solid #ccc">${botReplyLine}</p>` : '') +
    `<p>${spec.action}</p>` +
    `<p style="color:#666;font-size:13px">Lead: ${name} · ${phone}</p>`
  const whatsappText =
    `${spec.emoji} TING alert\n\n${reasonLine}` +
    (botReplyLine ? `\n\n${botReplyLine}` : '') +
    `\n\n👉 ${spec.action}`

  const templateValues = [name, phone, (bot || msg || spec.action).slice(0, 200)]

  return { subject, html, whatsappText, templateValues }
}

function labelShort(sig: PrioritySignal): string {
  switch (sig) {
    case 'visit_booked': return 'visit booked'
    case 'visit_now': return 'arriving now'
    case 'call_request': return 'wants a call'
    case 'human_request': return 'wants a person'
    case 'very_interested': return 'very interested'
    case 'knowledge_gap': return 'needs info'
    case 'competitor': return 'competitor?'
  }
}

// Lead-facing deflection for a guardrail trip — polite, in-role, never engages.
export function guardrailReply(g: Exclude<Guardrail, null>): string {
  switch (g) {
    case 'sexual':
      return "I'm here to help with property and home enquiries only. If you're looking for a home, tell me your preferred area and budget and I'll be glad to help. 🙏"
    case 'spam_scam':
      return "I can only help with genuine property enquiries here. If you're looking to buy or rent, let me know your preferred area and budget and I'll help you find the right place."
    case 'injection':
      return "I'm your property assistant — happy to help with your home search! Which area and budget are you looking at?"
  }
}
