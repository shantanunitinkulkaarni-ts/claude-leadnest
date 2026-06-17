import { test, expect } from '@playwright/test'
import { buildAlertContent, guardrailReply } from '../../lib/priorityAlerts'

const base = { leadName: 'Rahul', leadPhone: '+916393260332', agentName: 'Shantanu', lastMessage: 'I am on my way now' }

test.describe('buildAlertContent', () => {
  test('visit_now: urgent headline, name + phone in subject, action in whatsapp', () => {
    const c = buildAlertContent('visit_now', base)
    expect(c.subject).toContain('Rahul')
    expect(c.subject).toContain('+916393260332')
    expect(c.whatsappText).toContain('🔴')
    expect(c.whatsappText.toLowerCase()).toContain('on the way')
    expect(c.templateValues).toHaveLength(3)
    expect(c.templateValues[1]).toBe('+916393260332')
  })

  test('call_request: action includes the phone to call', () => {
    const c = buildAlertContent('call_request', base)
    expect(c.whatsappText).toContain('+916393260332')
    expect(c.html).toContain('+916393260332')
  })

  test('knowledge_gap: quotes the lead message', () => {
    const c = buildAlertContent('knowledge_gap', { ...base, lastMessage: 'what is the possession date?' })
    expect(c.whatsappText).toContain('possession date')
  })

  test('knowledge_gap: includes bot reply snippet so agent knows what was deferred', () => {
    const c = buildAlertContent('knowledge_gap', {
      ...base,
      lastMessage: 'when is possession date?',
      botReply: "Let me check with the team and get back to you on the exact possession date.",
    })
    expect(c.whatsappText).toContain('Bot replied:')
    expect(c.whatsappText).toContain('possession date')
    expect(c.html).toContain('Bot replied:')
    // templateValues still capped at 200 chars
    expect(c.templateValues[2].length).toBeLessThanOrEqual(200)
  })

  test('knowledge_gap: no botReply → no "Bot replied:" line (no regression for other signals)', () => {
    const c = buildAlertContent('knowledge_gap', { ...base, lastMessage: 'floor plan available?' })
    expect(c.whatsappText).not.toContain('Bot replied:')
  })

  test('visit_now: botReply is irrelevant — not shown (only knowledge_gap uses it)', () => {
    const c = buildAlertContent('visit_now', { ...base, botReply: 'I am here to help!' })
    expect(c.whatsappText).not.toContain('Bot replied:')
  })

  test('competitor: cautionary copy', () => {
    const c = buildAlertContent('competitor', base)
    expect(c.whatsappText).toContain('⚠️')
    expect(c.html.toLowerCase()).toContain('review before sharing')
  })

  test('visit_booked: positive confirmation copy', () => {
    const c = buildAlertContent('visit_booked', base)
    expect(c.whatsappText).toContain('✅')
    expect(c.subject.toLowerCase()).toContain('visit booked')
  })

  test('strips angle brackets from injected names (no HTML injection)', () => {
    const c = buildAlertContent('visit_now', { ...base, leadName: '<script>x</script>' })
    expect(c.html).not.toContain('<script>')
  })

  test('handles missing optional fields gracefully', () => {
    const c = buildAlertContent('human_request', { leadPhone: '+910000000000' })
    expect(c.subject).toContain('A lead')
    expect(c.html).toContain('Hi,')
  })
})

test.describe('guardrailReply', () => {
  test('sexual deflection stays in-role', () => {
    expect(guardrailReply('sexual').toLowerCase()).toContain('property')
  })
  test('spam_scam deflection', () => {
    expect(guardrailReply('spam_scam').toLowerCase()).toContain('genuine property')
  })
  test('injection deflection does not reveal anything', () => {
    const r = guardrailReply('injection').toLowerCase()
    expect(r).toContain('property assistant')
    expect(r).not.toContain('prompt')
  })
})
