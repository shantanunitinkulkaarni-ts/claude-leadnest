import type { AIDecision } from './types'

export function cleanBookingAction(args: {
  decision: AIDecision
  leadUpdates: Record<string, any>
  existingAppointment: any
  newTime?: string
  proposedEmail?: string
  emailIsValid: boolean
  finalReply: string
}) {
  const {
    decision,
    leadUpdates,
    existingAppointment,
    newTime,
    proposedEmail,
    emailIsValid,
  } = args
  let finalReply = args.finalReply

  if (!decision.action) {
    if (existingAppointment && newTime) {
      decision.action = 'reschedule_visit'
    } else if (leadUpdates.email && newTime && emailIsValid) {
      decision.action = 'book_visit'
    }
  }

  if (decision.action === 'book_visit' && existingAppointment && newTime) {
    decision.action = 'reschedule_visit'
  }

  if (decision.action === 'reschedule_visit' && !existingAppointment) {
    decision.action = 'book_visit'
  }

  if (proposedEmail && !emailIsValid) {
    decision.action = null
    finalReply = 'Please share a valid email address like name@example.com so I can confirm your visit.'
  }

  return finalReply
}
