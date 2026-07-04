import { test, expect } from '@playwright/test'
import { defaultIntent } from '../../lib/intentExtractor'
import { buildPostPropertyDecision } from '../../lib/bot/postPropertyDecision'

test.describe('post-property AI decision', () => {
  test('photo request becomes send photos, not site visit booking', () => {
    const decision = buildPostPropertyDecision({
      lead: { matched_property_id: 'prop-1' },
      decoded: {
        ...defaultIntent(),
        raw_message: 'share photos',
        message_type: 'wants_photos',
      },
    })

    expect(decision).toMatchObject({
      stage: 'property_shown',
      action: 'send_photos',
    })
  })

  test('site visit request asks for date and time when no time is given', () => {
    const decision = buildPostPropertyDecision({
      lead: { matched_property_id: 'prop-1' },
      decoded: {
        ...defaultIntent(),
        raw_message: 'book site visit',
        message_type: 'booking_request',
      },
    })

    expect(decision).toMatchObject({
      stage: 'awaiting_visit_time',
      action: null,
    })
    expect(decision?.reply.toLowerCase()).toContain('date and time')
  })

  test('visit time asks for email before booking', () => {
    const decision = buildPostPropertyDecision({
      lead: { matched_property_id: 'prop-1' },
      decoded: {
        ...defaultIntent(),
        raw_message: 'tomorrow 4pm',
        message_type: 'booking_request',
        visit_time_text: 'tomorrow 4pm',
      },
    })

    expect(decision).toMatchObject({
      stage: 'awaiting_email',
      action: null,
      updates: { visit_time: 'tomorrow 4pm' },
    })
    expect(decision?.reply.toLowerCase()).toContain('email')
  })

  test('visit time is accepted even when AI marks it as a normal answer', () => {
    const decision = buildPostPropertyDecision({
      lead: { matched_property_id: 'prop-1' },
      decoded: {
        ...defaultIntent(),
        raw_message: 'tomorrow 4pm',
        message_type: 'qualifying_answer',
        visit_time_text: 'tomorrow 4pm',
      },
    })

    expect(decision).toMatchObject({
      stage: 'awaiting_email',
      action: null,
      updates: { visit_time: 'tomorrow 4pm' },
    })
  })

  test('email after saved visit time triggers booking', () => {
    const decision = buildPostPropertyDecision({
      lead: {
        matched_property_id: 'prop-1',
        pending_appointment_time: '2026-07-05T10:30:00.000Z',
      },
      decoded: {
        ...defaultIntent(),
        raw_message: 'me@example.com',
        email: 'me@example.com',
      },
    })

    expect(decision).toMatchObject({
      stage: 'awaiting_email',
      action: 'book_visit',
      updates: { email: 'me@example.com' },
    })
  })

  test('visit time and email together can book immediately', () => {
    const decision = buildPostPropertyDecision({
      lead: { matched_property_id: 'prop-1' },
      decoded: {
        ...defaultIntent(),
        raw_message: 'tomorrow 4pm, me@example.com',
        message_type: 'booking_request',
        visit_time_text: 'tomorrow 4pm',
        email: 'me@example.com',
      },
    })

    expect(decision).toMatchObject({
      stage: 'awaiting_email',
      action: 'book_visit',
      updates: {
        visit_time: 'tomorrow 4pm',
        email: 'me@example.com',
      },
    })
  })
})
