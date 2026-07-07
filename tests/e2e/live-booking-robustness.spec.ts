import 'dotenv/config'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { newInboundLeadDefaults } from '../../lib/bot/newLeadDefaults'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AUTH_OPEN = process.env.SKIP_WEBHOOK_AUTH === 'true' || !!process.env.WEBHOOK_SIMULATE_SECRET
const CUSTOMER_EMAIL = 'shantanunitinkulkaarni@gmail.com'
const REPORT_DIR = join(process.cwd(), 'reports')
const REPORT_FILE = join(REPORT_DIR, 'live-booking-transcript.txt')

type ScenarioKind = 'book' | 'blocked' | 'ask_time' | 'confirm' | 'reschedule' | 'cancel'

type Scenario = {
  name: string
  kind: ScenarioKind
  steps: string[]
}

type AgentRow = {
  id: string
  name: string
  email: string
  wa_phone_number_id: string | null
}

type PropertyRow = {
  id: string
  title: string
  location: string | null
}

const scenarios: Scenario[] = [
  {
    name: 'book english :: time then email',
    kind: 'book',
    steps: [
      'I want to book a site visit',
      'Saturday at 11 am',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'book hindi :: kal 2 baje',
    kind: 'book',
    steps: [
      'I want to book a site visit',
      'kal 2 baje',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'book marathi :: udya sakali 10 vajta',
    kind: 'book',
    steps: [
      'I want to book a site visit',
      'udya sakali 10 vajta',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'book typo :: evnining 5 pm',
    kind: 'book',
    steps: [
      'I want to book a site visit',
      'evnining 5 pm',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'book weekday word :: somwar 2 baje',
    kind: 'book',
    steps: [
      'I want to book a site visit',
      'somwar 2 baje',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'blocked :: Sunday 11 AM',
    kind: 'blocked',
    steps: [
      'I want to book a site visit',
      'Sunday 11 AM',
      CUSTOMER_EMAIL,
    ],
  },
  {
    name: 'unclear :: kabhi bhi',
    kind: 'ask_time',
    steps: [
      'I want to book a site visit',
      'kabhi bhi',
    ],
  },
  {
    name: 'confirmation shortcut :: yes after time',
    kind: 'confirm',
    steps: [
      'I want to book a site visit',
      'kal 2 baje',
      CUSTOMER_EMAIL,
      'yes',
    ],
  },
  {
    name: 'reschedule :: existing appointment',
    kind: 'reschedule',
    steps: [
      'I want to book a site visit',
      'Saturday at 11 am',
      CUSTOMER_EMAIL,
      'please reschedule to tomorrow 3 pm',
    ],
  },
  {
    name: 'cancel :: existing appointment',
    kind: 'cancel',
    steps: [
      'I want to book a site visit',
      'Saturday at 11 am',
      CUSTOMER_EMAIL,
      'cancel it',
    ],
  },
]

test.describe('live booking robustness', () => {
  test('actual app booking and scheduling', async ({ request }) => {
    test.setTimeout(600000)
    test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Supabase env vars are required for the live booking check')
    test.skip(!AUTH_OPEN, 'Set SKIP_WEBHOOK_AUTH=true or WEBHOOK_SIMULATE_SECRET for the live webhook check')

    const db = createClient(SUPABASE_URL!, SERVICE_KEY!)

    const agent = await resolveAgent(db)
    const property = await resolveProperty(db, agent.id)
    const transcript: string[] = []
    const failures: Array<{ scenario: string; reason: string }> = []

    transcript.push(`Live booking robustness probe`)
    transcript.push(`Agent: ${agent.name} <${agent.email}>`)
    transcript.push(`Property: ${property.title} (${property.location || 'unknown'})`)
    transcript.push(`Customer email: ${CUSTOMER_EMAIL}`)
    transcript.push(`Scenarios: ${scenarios.length}`)
    transcript.push('')

    for (const [index, scenario] of scenarios.entries()) {
      const phone = `+91LIVE${Date.now()}${index}`
      const leadId = await seedLead(db, agent.id, phone, property.id)
      try {
        const lines: string[] = []
        lines.push(`### ${scenario.name}`)

        for (const [stepIndex, step] of scenario.steps.entries()) {
          const response = await request.post('/api/webhook', {
            form: {
              From: `whatsapp:${phone}`,
              Body: step,
              MessageSid: randomUUID(),
              AgentId: agent.id,
            },
          })
          const status = response.status()

          const snapshot = await readLeadSnapshot(db, leadId)
          const botReply = snapshot.latestOutbound || '(no outbound reply)'
          lines.push(`Webhook status: ${status}`)
          lines.push(`Customer: ${step}`)
          lines.push(`Bot: ${botReply}`)

          if (status !== 200) {
            failures.push({ scenario: scenario.name, reason: `webhook returned ${status} on step ${stepIndex + 1}` })
            break
          }

          await pause(7500)
        }

        const finalState = await readLeadSnapshot(db, leadId)
        const hadScenarioFailure = failures.some(f => f.scenario === scenario.name)
        const result = hadScenarioFailure
          ? { ok: false, reason: failures.find(f => f.scenario === scenario.name)?.reason || 'scenario aborted early' }
          : evaluateScenario(scenario, finalState)
        if (!result.ok && !hadScenarioFailure) failures.push({ scenario: scenario.name, reason: result.reason })

        lines.push(`Result: ${result.ok ? 'PASS' : 'FAIL'} — ${result.reason}`)
        lines.push(`Lead status: ${finalState.lead?.status || 'missing'}`)
        lines.push(`Pending appointment: ${finalState.lead?.pending_appointment_time || 'none'}`)
        lines.push(`Appointments: ${finalState.appointments.map(a => `${a.status}@${a.scheduled_at}`).join(' | ') || 'none'}`)
        lines.push('')

        transcript.push(...lines)
        await pause(10000)
      } finally {
        await cleanupLead(db, leadId)
      }
    }

    transcript.push('Summary')
    if (failures.length) {
      transcript.push(`Failures: ${failures.length}`)
      for (const failure of failures) {
        transcript.push(`- ${failure.scenario}: ${failure.reason}`)
      }
    } else {
      transcript.push('Failures: 0')
      transcript.push('All scenarios passed.')
    }

    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(REPORT_FILE, transcript.join('\r\n'), 'utf8')

    expect(failures, `live booking failures:\n${failures.map(f => `- ${f.scenario}: ${f.reason}`).join('\n')}`).toEqual([])
  })
})

async function resolveAgent(db: ReturnType<typeof createClient>): Promise<AgentRow> {
  const { data, error } = await db
    .from('agents')
    .select('id, name, email, wa_phone_number_id')
    .eq('name', 'Shantanu Kulkaarni')
    .eq('bot_active', true)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Could not find the live test agent: ${error?.message || 'no row found'}`)
  }

  return data as AgentRow
}

async function resolveProperty(db: ReturnType<typeof createClient>, agentId: string): Promise<PropertyRow> {
  const { data, error } = await db
    .from('properties')
    .select('id, title, location')
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Could not find an active property for the live test agent: ${error?.message || 'no row found'}`)
  }

  return data as PropertyRow
}

async function seedLead(db: ReturnType<typeof createClient>, agentId: string, phone: string, propertyId: string): Promise<string> {
  const nowIso = new Date().toISOString()
  const lead = {
    ...newInboundLeadDefaults(phone, nowIso),
    agent_id: agentId,
    name: 'Rahul',
    language: 'english',
    matched_property_id: propertyId,
    status: 'new',
    bot_stage: 'greeting',
    notes: null,
  }

  const { data, error } = await db.from('leads').insert(lead).select('id').single()
  if (error || !data) {
    throw new Error(`Lead seed failed: ${error?.message || 'no row returned'}`)
  }
  return data.id as string
}

async function cleanupLead(db: ReturnType<typeof createClient>, leadId: string) {
  await db.from('leads').delete().eq('id', leadId)
}

function pause(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function readLeadSnapshot(db: ReturnType<typeof createClient>, leadId: string) {
  const [{ data: lead }, { data: outbound }, { data: appointments }] = await Promise.all([
    db.from('leads').select('id, status, pending_appointment_time, pending_appointment_set_at, matched_property_id').eq('id', leadId).maybeSingle(),
    db.from('messages').select('content, created_at').eq('lead_id', leadId).eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('appointments').select('id, status, scheduled_at').eq('lead_id', leadId).order('created_at', { ascending: true }),
  ])

  return {
    lead,
    latestOutbound: outbound?.content || null,
    appointments: appointments || [],
  }
}

function evaluateScenario(scenario: Scenario, state: Awaited<ReturnType<typeof readLeadSnapshot>>): { ok: boolean; reason: string } {
  const upcoming = state.appointments.filter(a => a.status === 'upcoming')
  const cancelled = state.appointments.filter(a => a.status === 'cancelled')
  const reply = String(state.latestOutbound || '').toLowerCase()

  switch (scenario.kind) {
    case 'book':
      if (!upcoming.length) {
        return { ok: false, reason: 'no upcoming appointment row was written' }
      }
      if (state.lead?.status !== 'visit_booked') {
        return { ok: false, reason: `lead status stayed ${state.lead?.status || 'missing'} instead of visit_booked` }
      }
      if (!/confirm|book|scheduled|visit/i.test(state.latestOutbound || '')) {
        return { ok: false, reason: 'confirmation reply did not look like a booking confirmation' }
      }
      return { ok: true, reason: `appointment booked at ${upcoming[0].scheduled_at}` }

    case 'blocked':
      if (upcoming.length) {
        return { ok: false, reason: 'blocked time still created an upcoming appointment' }
      }
      if (!/request|connect|review|team/i.test(reply)) {
        return { ok: false, reason: 'reply did not clearly hand off the blocked request' }
      }
      return { ok: true, reason: 'blocked time was rejected without booking' }

    case 'ask_time':
      if (upcoming.length) {
        return { ok: false, reason: 'vague message still created an appointment' }
      }
      if (!/time|date|visit/i.test(reply)) {
        return { ok: false, reason: 'reply did not ask for a clearer time' }
      }
      return { ok: true, reason: 'vague request kept the bot in clarification mode' }

    case 'confirm':
      if (!upcoming.length) {
        return { ok: false, reason: 'confirmation shortcut did not promote the pending visit into an appointment row' }
      }
      return { ok: true, reason: `confirmation shortcut promoted booking at ${upcoming[0].scheduled_at}` }

    case 'reschedule':
      if (upcoming.length !== 1 || cancelled.length < 1) {
        return { ok: false, reason: `reschedule did not leave one upcoming and one cancelled appointment (upcoming=${upcoming.length}, cancelled=${cancelled.length})` }
      }
      if (!/resched|confirm|book/i.test(reply)) {
        return { ok: false, reason: 'reschedule reply did not read like a reschedule confirmation' }
      }
      return { ok: true, reason: `rescheduled to ${upcoming[0].scheduled_at}` }

    case 'cancel':
      if (!cancelled.length) {
        return { ok: false, reason: 'cancel request did not change the appointment to cancelled' }
      }
      if (upcoming.length) {
        return { ok: false, reason: 'cancel request still left an upcoming appointment behind' }
      }
      if (!/cancel/i.test(reply)) {
        return { ok: false, reason: 'cancel reply did not mention cancellation' }
      }
      return { ok: true, reason: 'appointment was cancelled' }
  }
}
