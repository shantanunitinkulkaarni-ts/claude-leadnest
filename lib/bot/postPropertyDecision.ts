import type { ExtractedIntent } from '../intentExtractor'
import type { AIDecision } from './types'

export function buildPostPropertyDecision(args: {
  decoded: ExtractedIntent & { raw_message?: string }
  lead: any
}): AIDecision | null {
  const { decoded, lead } = args
  const email = decoded.email || extractEmail(decoded.raw_message || '')
  const visitTime = decoded.visit_time_text || null

  if (decoded.message_type === 'wants_photos') {
    return {
      stage: 'property_shown',
      reply: 'Sure, I will check the photos for this property.',
      action: 'send_photos',
      updates: {},
    }
  }

  if (decoded.message_type === 'booking_request' || (visitTime && lead.matched_property_id)) {
    if (visitTime && (email || lead.email)) {
      return {
        stage: 'awaiting_email',
        reply: email
          ? 'Thanks. I am booking the site visit now.'
          : 'Thanks. I am booking the site visit using the email already shared.',
        action: 'book_visit',
        updates: {
          visit_time: visitTime,
          ...(email ? { email } : {}),
        },
      }
    }

    if (visitTime) {
      return {
        stage: 'awaiting_email',
        reply: 'Please share your email address so I can send the visit confirmation.',
        action: null,
        updates: { visit_time: visitTime },
      }
    }

    return {
      stage: 'awaiting_visit_time',
      reply: 'Sure. What date and time would you prefer for the site visit?',
      action: null,
      updates: {},
    }
  }

  if (email && lead.pending_appointment_time) {
    return {
      stage: 'awaiting_email',
      reply: 'Thanks. I am booking the site visit now.',
      action: 'book_visit',
      updates: { email },
    }
  }

  return null
}

function extractEmail(text: string): string | null {
  const m = String(text || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/)
  return m ? m[0] : null
}
