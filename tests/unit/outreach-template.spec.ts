import { test, expect } from '@playwright/test'
import { renderTemplate, pickTemplate, decideOutreach } from '../../lib/outreach'

// ─── renderTemplate ───────────────────────────────────────────────────────────

test.describe('renderTemplate', () => {
  test('fills all named variables correctly', () => {
    const result = renderTemplate('lead_new_match', 'en', [
      { name: 'customer_name', value: 'Rahul' },
      { name: 'agency_name', value: 'SK Properties' },
      { name: 'area', value: 'Baner' },
      { name: 'property_type', value: '2BHK' },
    ])
    expect(result).toContain('Rahul')
    expect(result).toContain('SK Properties')
    expect(result).toContain('Baner')
    expect(result).toContain('2BHK')
    expect(result).not.toContain('{{')
  })

  test('falls back to English if language not found', () => {
    const result = renderTemplate('lead_visit_invite', 'mr', [
      { name: 'customer_name', value: 'Priya' },
      { name: 'agency_name', value: 'Test Agency' },
      { name: 'property', value: '2BHK flat' },
    ])
    // mr not approved for visit_invite, falls back to en body
    expect(result).toContain('Priya')
    expect(result).not.toContain('{{')
  })

  test('returns [name] when template not found', () => {
    const result = renderTemplate('unknown_template', 'en', [])
    expect(result).toBe('[unknown_template]')
  })
})

// ─── pickTemplate ─────────────────────────────────────────────────────────────

test.describe('pickTemplate', () => {
  const agent = { agency_name: 'SK Properties', areas: ['Baner'], outreach_intensity: 'balanced' }

  test('new lead → lead_new_match', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 0, preferred_areas: ['Baner'], intent: 'buy', language: 'en' }
    const tmpl = pickTemplate(lead, agent, 'en')
    expect(tmpl?.name).toBe('lead_new_match')
    expect(tmpl?.language).toBe('en')
  })

  test('qualified lead → lead_visit_invite', () => {
    const lead = { status: 'qualified', ai_score: 7, template_touches: 0, preferred_areas: ['Baner'], intent: 'buy' }
    const tmpl = pickTemplate(lead, agent, 'en')
    expect(tmpl?.name).toBe('lead_visit_invite')
  })

  test('3rd touch with balanced (5 max) → still new_match, not yet farewell', () => {
    // Bug fixed: old code fired lead_final_touch at touch ≥ 2 regardless of intensity.
    // With balanced (5 max), touch 3 (index 2) is NOT the last — only touch 5 (index 4) is.
    const lead = { status: 'new', ai_score: 2, template_touches: 2, preferred_areas: ['Baner'], intent: 'rent' }
    const tmpl = pickTemplate(lead, { ...agent, outreach_intensity: 'balanced' }, 'en')
    expect(tmpl?.name).toBe('lead_new_match')
  })

  test('5th touch with balanced (5 max) → lead_final_touch', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 4, preferred_areas: ['Baner'], intent: 'rent' }
    const tmpl = pickTemplate(lead, { ...agent, outreach_intensity: 'balanced' }, 'en')
    expect(tmpl?.name).toBe('lead_final_touch')
  })

  test('3rd touch with gentle (3 max) → lead_final_touch', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 2, preferred_areas: ['Baner'], intent: 'rent' }
    const tmpl = pickTemplate(lead, { ...agent, outreach_intensity: 'gentle' }, 'en')
    expect(tmpl?.name).toBe('lead_final_touch')
  })

  test('8th touch with persistent (8 max) → lead_final_touch', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 7, preferred_areas: ['Baner'], intent: 'buy' }
    const tmpl = pickTemplate(lead, { ...agent, outreach_intensity: 'persistent' }, 'en')
    expect(tmpl?.name).toBe('lead_final_touch')
  })

  test('4th touch with persistent (8 max) → still lead_new_match', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 3, preferred_areas: ['Baner'], intent: 'buy' }
    const tmpl = pickTemplate(lead, { ...agent, outreach_intensity: 'persistent' }, 'en')
    expect(tmpl?.name).toBe('lead_new_match')
  })

  test('Hindi lead gets hi template', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 0, preferred_areas: ['Baner'], intent: 'buy' }
    const tmpl = pickTemplate(lead, agent, 'hi')
    expect(tmpl?.language).toBe('hi')
  })

  test('values include no whitespace-only strings', () => {
    const lead = { status: 'new', ai_score: 2, template_touches: 0, intent: 'buy' }
    const tmpl = pickTemplate(lead, agent, 'en')
    for (const v of (tmpl?.values || [])) {
      expect(v.value.trim()).not.toBe('')
    }
  })
})

// ─── decideOutreach ───────────────────────────────────────────────────────────

test.describe('decideOutreach', () => {
  const DAY = 24 * 60 * 60 * 1000
  const NOW = new Date('2026-06-14T11:00:00+05:30').getTime() // 11 AM IST weekday

  const freshLead = { temperature: 'warm', ai_score: 5, status: 'new', last_message_at: new Date(NOW - 2 * DAY).toISOString(), template_touches: 0, last_template_at: null, created_at: new Date(NOW - 2 * DAY).toISOString() }
  const agent = { outreach_intensity: 'balanced' }

  test('lead not quiet long enough → no send', () => {
    const lead = { ...freshLead, last_message_at: new Date(NOW - 1 * DAY).toISOString() }
    const d = decideOutreach(lead, agent, NOW)
    expect(d.send).toBe(false)
  })

  test('qualified lead gets sent after enough gap', () => {
    const lead = { ...freshLead, temperature: 'hot', ai_score: 8, status: 'qualified', last_message_at: new Date(NOW - 3 * DAY).toISOString() }
    const d = decideOutreach(lead, agent, NOW)
    expect(d.send).toBe(true)
  })

  test('max touches reached → dormant', () => {
    const lead = { ...freshLead, template_touches: 5, last_template_at: new Date(NOW - 30 * DAY).toISOString() }
    const d = decideOutreach(lead, agent, NOW)
    expect(d.send).toBe(false)
    expect((d as any).dormant).toBe(true)
  })

  test('middle of night IST → no send', () => {
    const midnight = new Date('2026-06-14T02:00:00+05:30').getTime()
    const d = decideOutreach({ ...freshLead, last_message_at: new Date(midnight - 3 * DAY).toISOString() }, agent, midnight)
    expect(d.send).toBe(false)
  })
})
