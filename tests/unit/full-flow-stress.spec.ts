import { test, expect } from '@playwright/test'
import { parseTimeString, bookingTimeIssue, formatIST } from '../../lib/timeParser'
import { aiDecoder, aiComposeReply } from '../../lib/bot/aiDecoder'
import { runConversationFlowStep } from '../../lib/bot/flowRunner'
import { leadToFlowLead, agentToFlowSettings, shouldUseConversationFlow } from '../../lib/bot/flowDecisionAdapter'
import { buildPostPropertyDecision } from '../../lib/bot/postPropertyDecision'
import { prepareLeadUpdates } from '../../lib/bot/leadUpdates'
import {
  buildCancelReply,
  buildReschedulePrompt,
  buildTrollHaltReply,
  buildDoubleBookReply,
  buildMissingDataAlert,
  buildSuccessReply,
  shouldAllowReschedule,
  resolveBookingData,
} from '../../lib/bot/booking_pure'
import { isConfirmationReply, isPendingAppointmentExpired } from '../../lib/appointmentConfirmation'
import { searchPropertiesByFallbackChain, type PropertyRow } from '../../lib/propertySearch'
import { presentProperties, noMatchText } from '../../lib/propertyPresenter'
import type { ExtractedIntent } from '../../lib/intentExtractor'
import type { AIDecision } from '../../lib/bot/types'

const NOW_MS = Date.parse('2026-07-05T06:30:00.000Z') // 12:00 IST
const NOW = new Date(NOW_MS)

const agent = {
  agency_name: 'Rakesh Builders',
  name: 'Rakesh Builders',
  languages: ['English', 'Hindi', 'Marathi'],
  property_types: ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot'],
  deal_types: ['buy', 'rent'] as const,
  office_open: '09:00',
  office_close: '19:00',
  weekly_off: 'Sunday',
}

const flowAgent = agentToFlowSettings(agent)

const inventory: PropertyRow[] = [
  {
    id: 'p1',
    agent_id: 'agent-1',
    type: 'sale',
    location: 'Baner',
    title: 'Skyline Residency',
    price: 9_500_000,
    bhk: '3BHK',
    size_sqft: 1450,
    status: 'active',
    possession_status: 'ready_to_move',
    features: ['east-facing', 'gym', 'pool', '2 covered parking'],
  },
  {
    id: 'p2',
    agent_id: 'agent-1',
    type: 'sale',
    location: 'Baner',
    title: 'Sunrise Park',
    price: 7_900_000,
    bhk: '2BHK',
    size_sqft: 1080,
    status: 'active',
    possession_status: 'ready_to_move',
    features: ['east-facing', 'gym', 'clubhouse'],
  },
  {
    id: 'p3',
    agent_id: 'agent-1',
    type: 'rental',
    location: 'Wakad',
    title: 'Green Valley',
    rent_per_month: 18_000,
    deposit: 50_000,
    bhk: '2BHK',
    size_sqft: 1050,
    status: 'active',
    possession_status: 'ready_to_move',
    features: ['lift', 'rera registered'],
  },
  {
    id: 'p4',
    agent_id: 'agent-1',
    type: 'sale',
    location: 'Wakad',
    title: 'Green Valley Sale',
    price: 7_200_000,
    bhk: '2BHK',
    size_sqft: 1050,
    status: 'active',
    possession_status: 'ready_to_move',
    features: ['rera registered'],
  },
]

type DiscoveryScenario = {
  kind: 'discovery'
  name: string
  lead: any
  message: string
  extracted: Partial<ExtractedIntent>
}

type BookingScenario = {
  kind: 'booking'
  name: string
  lead: any
  message: string
  extracted: Partial<ExtractedIntent>
  mode: 'valid' | 'blocked' | 'invalid'
  expected: 'booked' | 'pending_email' | 'ask_time' | 'double_book'
  existingAppointment?: any
}

type ConfirmationScenario = {
  kind: 'confirmation'
  name: string
  lead: any
  message: string
  pendingAppointmentTime?: string | null
  pendingSetAt?: string | null
  expectConfirm: boolean
}

type AdjustmentScenario = {
  kind: 'adjustment'
  name: string
  action: 'reschedule_visit' | 'cancel_visit'
  lead: any
  message: string
  existingAppointment: any
  replyMode: 'success' | 'prompt' | 'blocked' | 'double_book' | 'cancel'
  decision: AIDecision
}

type Scenario = DiscoveryScenario | BookingScenario | ConfirmationScenario | AdjustmentScenario

function fakeDecoderLLM(payload: any) {
  return async () => JSON.stringify(payload)
}

function fakeReplyLLM() {
  return async (messages: any[]) => {
    const user = messages.find(m => m.role === 'user')?.content || ''
    const match = user.match(/Brief \(facts to convey[^:]*\):\s*([\s\S]*)$/)
    const reply = match ? match[1].trim() : user.trim()
    return JSON.stringify({ reply })
  }
}

const VALID_BOOKING_ISO = '2026-07-06T14:00:00+05:30'
const BLOCKED_BOOKING_ISO = '2026-07-06T07:00:00+05:30'

function fakeTimeLLMFor(_text: string, mode: 'valid' | 'blocked' | 'invalid') {
  return async () => {
    if (mode === 'valid') {
      return JSON.stringify({ ok: true, iso: VALID_BOOKING_ISO, language: 'hindi' })
    }
    if (mode === 'blocked') {
      return JSON.stringify({ ok: true, iso: BLOCKED_BOOKING_ISO, language: 'hindi' })
    }
    return JSON.stringify({ ok: false, reason: 'missing_time', language: 'hindi' })
  }
}

function fakeInvalidTimeLLM() {
  return async () => JSON.stringify({ ok: false, reason: 'missing_time', language: 'hindi' })
}

function currentLeadBase() {
  return {
    engagement: {},
    last_outbound_at: '2026-07-05T05:30:00.000Z',
    consent_tier: null,
  }
}

function withLead(base: Record<string, any>) {
  return { ...currentLeadBase(), ...base }
}

function discoveryLeads(): Record<string, any> {
  return {
    ask_language: withLead({}),
    ask_name: withLead({ language: 'English' }),
    ask_property_type: withLead({ language: 'English', name: 'Rahul' }),
    ask_intent: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment' }),
    ask_area: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent' }),
    ask_budget: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent', preferred_areas: ['Baner'] }),
    ask_size: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent', preferred_areas: ['Baner'], budget_max: 30000 }),
    ready_to_search: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'buy', preferred_areas: ['Baner'], budget_max: 10_000_000, bhk: '2BHK' }),
  }
}

function discoveryVariants() {
  return {
    ask_language: ['Hi', 'hello', 'namaste', 'hii', 'hey there', 'नमस्ते', 'marathi me bolo', 'English please'],
    ask_name: ['English please', 'Hindi me bolo', 'Marathi', 'continue in English', 'hindi', 'marathi please', 'eng', 'mr'],
    ask_property_type: ['2BHK', 'flat', 'apartment', 'house', 'row house', 'shop', 'plot', 'office'],
    ask_intent: ['rent', 'buy', 'for rent', 'for sale', 'buy karna hai', 'rental chahiye', 'lease', 'purchase'],
    ask_area: ['Baner', 'bnaer', 'Wakad', 'Hinjewadi', 'Kothrud', 'banr', 'west pune', 'near Baner'],
    ask_budget: ['30k', '20-30k', '80 lakh', '1 crore', '45k', '18k', '90L', '1.2 cr'],
    ask_size: ['2BHK', '3BHK', 'no pref', 'anything', '1 bhk', '4BHK', 'no preference', 'any size'],
    ready_to_search: [
      'Baner 2BHK under 80L',
      'Baner 3BHK under 1cr',
      'Wakad 2BHK rent 18k',
      'Wakad 2BHK under 80L',
      'Pashan 2BHK under 80L',
      'Baner flat ready to move',
      'Baner no pref under 1cr',
      'Balewadi 2BHK under 1cr',
    ],
  }
}

function bookingPhrases() {
  return [
    { text: 'kal 2 baje', mode: 'valid' as const },
    { text: 'kal subah 10 baje', mode: 'valid' as const },
    { text: 'kal shaam 5 baje', mode: 'valid' as const },
    { text: 'parson 11 baje', mode: 'valid' as const },
    { text: 'agale hafte somvar 2 baje', mode: 'valid' as const },
    { text: 'tomorrow 5 pm', mode: 'valid' as const },
    { text: 'Sunday 11 AM', mode: 'blocked' as const },
    { text: 'next week monday 3 pm', mode: 'valid' as const },
    { text: 'somwar 2 baje', mode: 'valid' as const },
    { text: 'som 2 baje', mode: 'valid' as const },
    { text: 'monday 2 pm', mode: 'valid' as const },
    { text: 'udya sakali 9', mode: 'valid' as const },
    { text: 'parva sakali 10', mode: 'valid' as const },
    { text: 'ratri 7 baje', mode: 'blocked' as const },
    { text: 'aaj 7 baje', mode: 'blocked' as const },
    { text: 'eve 5 pm', mode: 'valid' as const },
    { text: 'evnining 5 pm', mode: 'valid' as const },
    { text: 'kabhi bhi', mode: 'invalid' as const },
    { text: 'kab aa sakte hai?', mode: 'invalid' as const },
    { text: 'next week', mode: 'invalid' as const },
  ]
}

function confirmationTokens() {
  return [
    'yes',
    'confirm',
    'pakka',
    'bilkul',
    'haan',
    'haan ji',
    'ok',
    'sure',
    'theek hai',
    'barobar',
    'done',
    'chalega',
    'हो',
    'हाँ',
    'ठीक है',
    'बरोबर',
  ]
}

function adjustmentPhrases() {
  return [
    'tomorrow 3 pm',
    'kal 11 baje',
    'parson 2 baje',
    'Sunday 11 AM',
    'next week monday 4 pm',
    'kal subah 7 baje',
    'now',
    'please reschedule',
    'cancel it',
    'please cancel',
    'nako cancel',
    'radd karo',
    'theek hai, cancel',
    'lets shift it',
    'change to next week',
    'not coming',
  ]
}

function makeDiscoveryScenarios(): DiscoveryScenario[] {
  const scenarios: DiscoveryScenario[] = []
  const leads = discoveryLeads()
  const variants = discoveryVariants()
  for (const stage of Object.keys(variants) as Array<keyof typeof variants>) {
    for (const message of variants[stage]) {
      const lead = { ...leads[stage] }
      const extracted: Partial<ExtractedIntent> = {}
      if (stage === 'ask_language') {
        extracted.message_type = 'greeting'
        extracted.language = 'english'
      } else if (stage === 'ask_name') {
        extracted.language = 'english'
      } else if (stage === 'ask_property_type') {
        extracted.name = 'Rahul'
      } else if (stage === 'ask_intent') {
        extracted.property_category = 'apartment'
      } else if (stage === 'ask_area') {
        extracted.intent = 'rent'
      } else if (stage === 'ask_budget') {
        extracted.areas = ['Baner']
      } else if (stage === 'ask_size') {
        extracted.budget_max = 30000
      } else if (stage === 'ready_to_search') {
        extracted.bhk = /no pref|any|anything/i.test(message) ? 'no_preference' : '2BHK'
      }
      scenarios.push({
        kind: 'discovery',
        name: `${stage} :: ${message}`,
        lead,
        message,
        extracted,
      })
    }
  }
  return scenarios
}

function makeBookingLeadContext(kind: 'immediate' | 'ask_email' | 'followup_email' | 'double_book', phrase: string, mode: 'valid' | 'blocked' | 'invalid') {
  const base = {
    language: 'English',
    name: 'Rahul',
    property_category: 'apartment',
    intent: 'buy' as const,
    preferred_areas: ['Baner'],
    matched_property_id: 'p2',
  }
  if (kind === 'immediate') {
    return withLead({ ...base, email: 'rahul@example.com' })
  }
  if (kind === 'ask_email') {
    return withLead(base)
  }
  if (kind === 'followup_email') {
    return withLead({
      ...base,
      pending_appointment_time: mode === 'invalid' ? undefined : (mode === 'blocked' ? BLOCKED_BOOKING_ISO : VALID_BOOKING_ISO),
      pending_appointment_set_at: '2026-07-05T06:00:00.000Z',
    })
  }
  return withLead({
    ...base,
    email: 'rahul@example.com',
    pending_appointment_time: mode === 'blocked' ? BLOCKED_BOOKING_ISO : VALID_BOOKING_ISO,
    pending_appointment_set_at: '2026-07-05T06:00:00.000Z',
  })
}

function makeBookingScenarios(): BookingScenario[] {
  const scenarios: BookingScenario[] = []
  for (const { text: phrase, mode } of bookingPhrases()) {
    const extractedBase: Partial<ExtractedIntent> = {
      message_type: 'booking_request',
      visit_time_text: mode === 'invalid' ? null : phrase,
      language: 'english',
    }
    scenarios.push({
      kind: 'booking',
      name: `book now :: ${phrase} :: email in message`,
      lead: makeBookingLeadContext('immediate', phrase, mode),
      message: mode === 'invalid' ? phrase : `${phrase} rahul@example.com`,
      extracted: { ...extractedBase, email: 'rahul@example.com' },
      mode,
      expected: mode === 'invalid' ? 'ask_time' : (mode === 'blocked' ? 'blocked' : 'booked'),
    })
    scenarios.push({
      kind: 'booking',
      name: `book later :: ${phrase} :: ask email`,
      lead: makeBookingLeadContext('ask_email', phrase, mode),
      message: phrase,
      extracted: extractedBase,
      mode,
      expected: mode === 'invalid' ? 'ask_time' : 'pending_email',
    })
    if (mode !== 'invalid') {
      scenarios.push({
        kind: 'booking',
        name: `book from pending :: ${phrase} :: email follow-up`,
        lead: makeBookingLeadContext('followup_email', phrase, mode),
        message: 'rahul@example.com',
        extracted: { email: 'rahul@example.com', language: 'english' },
        mode,
        expected: mode === 'blocked' ? 'blocked' : 'booked',
      })
    }
    scenarios.push({
      kind: 'booking',
      name: `book duplicate :: ${phrase}`,
      lead: makeBookingLeadContext('double_book', phrase, mode),
      message: mode === 'invalid' ? phrase : `${phrase} rahul@example.com`,
      extracted: extractedBase,
      mode,
      expected: 'double_book',
      existingAppointment: { id: 'appt-99', scheduled_at: '2026-07-06T11:00:00+05:30', status: 'upcoming', property_id: 'p2' },
    })
  }
  return scenarios
}

function makeConfirmationScenarios(): ConfirmationScenario[] {
  const tokens = confirmationTokens()
  const freshTime = '2026-07-06T14:00:00+05:30'
  return tokens.flatMap((token, index) => {
    const freshSetAt = '2026-07-05T05:45:00.000Z'
    return [
      {
        kind: 'confirmation' as const,
        name: `confirm fresh :: ${token}`,
        lead: withLead({ name: 'Rahul', email: 'rahul@example.com', pending_appointment_time: freshTime }),
        message: token,
        pendingAppointmentTime: freshTime,
        pendingSetAt: freshSetAt,
        expectConfirm: true,
      },
      {
        kind: 'confirmation' as const,
        name: `confirm expired :: ${token}`,
        lead: withLead({ name: 'Rahul', email: 'rahul@example.com', pending_appointment_time: freshTime }),
        message: token,
        pendingAppointmentTime: freshTime,
        pendingSetAt: '2026-07-05T00:00:00.000Z',
        expectConfirm: false,
      },
    ]
  })
}

function makeAdjustmentScenarios(): AdjustmentScenario[] {
  const phrases = adjustmentPhrases()
  const scenarios: AdjustmentScenario[] = []

  phrases.forEach((phrase, index) => {
    const rescheduleLead = withLead({
      name: 'Rahul',
      email: 'rahul@example.com',
      pending_appointment_time: parseTimeString('2026-07-06 11:00') || '2026-07-06T05:30:00.000Z',
      pending_appointment_set_at: '2026-07-05T05:30:00.000Z',
      matched_property_id: 'p2',
    })
    const cancelLead = withLead({
      name: 'Rahul',
      email: 'rahul@example.com',
      matched_property_id: 'p2',
    })
    scenarios.push({
      kind: 'adjustment',
      name: `reschedule :: ${phrase} :: allowed`,
      action: 'reschedule_visit',
      lead: rescheduleLead,
      message: phrase,
      existingAppointment: { id: 'appt-1', scheduled_at: '2026-07-06T11:00:00+05:30', status: 'upcoming', property_id: 'p2' },
      replyMode: index % 4 === 0 ? 'prompt' : (index % 4 === 1 ? 'blocked' : 'success'),
      decision: {
        stage: 'awaiting_visit_time',
        reply: index % 4 === 0 ? buildReschedulePrompt() : 'Thanks. I am booking the site visit now.',
        action: 'reschedule_visit',
        updates: index % 4 === 0 ? {} : { visit_time: phrase, email: 'rahul@example.com' },
      },
    })
    scenarios.push({
      kind: 'adjustment',
      name: `cancel :: ${phrase} :: with appointment`,
      action: 'cancel_visit',
      lead: cancelLead,
      message: phrase,
      existingAppointment: { id: 'appt-2', scheduled_at: '2026-07-06T11:00:00+05:30', status: 'upcoming', property_id: 'p2' },
      replyMode: 'cancel',
      decision: {
        stage: 'visit_confirmed',
        reply: buildCancelReply({ id: 'appt-2', scheduled_at: '2026-07-06T11:00:00+05:30', status: 'upcoming', property_id: 'p2' }),
        action: 'cancel_visit',
        updates: {},
      },
    })
  })

  return scenarios
}

const scenarios: Scenario[] = [
  ...makeDiscoveryScenarios(),
  ...makeBookingScenarios(),
  ...makeConfirmationScenarios(),
  ...makeAdjustmentScenarios(),
]

function fakeSearchDraft(lead: any): string {
  const result = searchPropertiesByFallbackChain(inventory, {
    intent: lead.intent,
    preferred_areas: Array.isArray(lead.preferred_areas) ? lead.preferred_areas : [],
    budget_max: lead.budget_max || null,
    budget_min: lead.budget_min || null,
  })

  if (!result.properties.length) {
    return noMatchText()
  }

  return presentProperties(result.properties).text
}

function extractFirstTitle(text: string): string | null {
  const m = text.match(/^Property - ([^\n(]+)(?:\s*\(|$)/m)
  return m ? m[1].trim() : null
}

async function runDiscoveryScenario(s: DiscoveryScenario) {
  const decoded = await aiDecoder(s.message, {}, { llm: fakeDecoderLLM(s.extracted) as any })
  const result = await runConversationFlowStep({
    agent: flowAgent,
    lead: leadToFlowLead(s.lead),
    message: s.message,
    recent: [],
  }, {
    decoder: async () => decoded,
  })

  expect(result.decision.nextStep).toBe(stageToExpectedNextStep(decoded, s.lead))
  expect(result.decision.reply.length).toBeGreaterThan(0)

  let draft = result.decision.reply
  if (result.decision.readyToSearch) {
    const leadAfter = { ...s.lead, ...result.decision.updates }
    draft = fakeSearchDraft(leadAfter)
    expect(draft).toBeTruthy()
  }

  const finalReply = await aiComposeReply(draft, { language: decoded.language || 'english' }, { llm: fakeReplyLLM() as any })
  expect(finalReply).toBeTruthy()
  if (result.decision.readyToSearch) {
    const title = extractFirstTitle(finalReply)
    expect(title).toBeTruthy()
  }
}

function stageToExpectedNextStep(decoded: ExtractedIntent, lead: any) {
  const merged = { ...lead }
  if (decoded.language) merged.language = decoded.language
  if (decoded.name) merged.name = decoded.name
  if (decoded.property_category) merged.property_category = decoded.property_category
  if (decoded.intent) merged.intent = decoded.intent
  if (decoded.areas?.length) merged.preferred_areas = decoded.areas
  if (decoded.budget_min) merged.budget_min = decoded.budget_min
  if (decoded.budget_max) merged.budget_max = decoded.budget_max
  if (decoded.bhk) merged.bhk = decoded.bhk

  if (!merged.language) return 'ask_language'
  if (!merged.name) return 'ask_name'
  if (!merged.property_category) return 'ask_property_type'
  if (!merged.intent && merged.property_category !== 'plot') return 'ask_intent'
  if (!Array.isArray(merged.preferred_areas) || !merged.preferred_areas.length) return 'ask_area'
  if (!merged.budget_min && !merged.budget_max) return 'ask_budget'
  if (!merged.no_size_preference && !merged.bhk && !merged.size_preference && !merged.sqft_preference) return 'ask_size'
  return 'ready_to_search'
}

async function runBookingScenario(s: BookingScenario) {
  const decoded = await aiDecoder(s.message, {}, { llm: fakeDecoderLLM(s.extracted) as any })
  const flowShouldHandle = shouldUseConversationFlow({
    lead: s.lead,
    extractedMessageType: decoded.message_type,
  })
  expect(flowShouldHandle).toBe(false)

  const decision = buildPostPropertyDecision({
    decoded: { ...decoded, raw_message: s.message },
    lead: s.lead,
  })
  expect(decision).toBeTruthy()
  if (!decision) return

  if (s.expected === 'double_book') {
    const duplicateReply = buildDoubleBookReply(s.existingAppointment)
    const finalDuplicate = await aiComposeReply(duplicateReply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() as any })
    expect(finalDuplicate).toContain('already have a site visit')
    return
  }

  const { leadUpdates, newTime } = await prepareLeadUpdates({
    decision,
    lead: s.lead,
    message: s.message,
    currentStage: decision.stage,
    forcedLang: null,
  }, {
    llm: (s.mode === 'invalid' ? fakeInvalidTimeLLM() : fakeTimeLLMFor(s.message, s.mode)) as any,
    now: NOW,
  })

  const customerEmail = leadUpdates.email || s.lead.email
  const bookingLeadState = {
    pending_appointment_time: leadUpdates.pending_appointment_time || s.lead.pending_appointment_time || null,
    pending_appointment_set_at: leadUpdates.pending_appointment_set_at || s.lead.pending_appointment_set_at || null,
    matched_property_id: s.lead.matched_property_id || null,
    email: customerEmail || null,
    language: leadUpdates.language || s.lead.language || null,
    name: leadUpdates.name || s.lead.name || null,
  }

  let draft = decision.reply
  if (decision.action === 'book_visit') {
    const { visitTime, propertyId } = resolveBookingData(newTime, bookingLeadState, s.lead, s.lead.matched_property_id || null, s.existingAppointment || null)
    if (!customerEmail) {
      draft = 'Please share your email address so I can send the visit confirmation.'
      expect(s.expected).toBe('pending_email')
    } else if (!visitTime || !propertyId) {
      const alert = buildMissingDataAlert(leadUpdates.name || s.lead.name || 'Guest', '9999999999', customerEmail || undefined, visitTime, propertyId)
      draft = alert.reply
      expect(draft).toContain('team will reach out')
    } else if (bookingTimeIssue(visitTime, agent)) {
      draft = bookingTimeIssue(visitTime, agent)!
      expect(s.mode).toBe('blocked')
    } else {
      draft = buildSuccessReply(visitTime, customerEmail || undefined, leadUpdates.name || s.lead.name || 'Guest')
      expect(s.expected).toBe('booked')
    }
  } else {
    if (decision.updates?.visit_time && !customerEmail) {
      expect(s.expected).toBe('pending_email')
    }
    if (!decision.updates?.visit_time) {
      expect(s.expected).toBe('ask_time')
    }
  }

  const finalReply = await aiComposeReply(draft, { language: leadUpdates.language || s.lead.language || 'english' }, { llm: fakeReplyLLM() as any })
  expect(finalReply).toBeTruthy()
}

async function runConfirmationScenario(s: ConfirmationScenario) {
  const expired = isPendingAppointmentExpired(s.pendingSetAt, NOW_MS)
  const shortcut = !!s.pendingAppointmentTime && !expired && isConfirmationReply(s.message)
  expect(shortcut).toBe(s.expectConfirm)

  if (!shortcut) {
    expect(expired || !s.pendingAppointmentTime).toBe(true)
    return
  }

  const reply = buildSuccessReply(s.pendingAppointmentTime!, s.lead.email, s.lead.name || 'Guest')
  const finalReply = await aiComposeReply(reply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() as any })
  expect(finalReply).toContain('confirmed')
  expect(finalReply).toContain(formatIST(s.pendingAppointmentTime!))
}

async function runAdjustmentScenario(s: AdjustmentScenario) {
  if (s.action === 'cancel_visit') {
    const reply = buildCancelReply(s.existingAppointment)
    const finalReply = await aiComposeReply(reply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() as any })
    expect(finalReply).toContain('cancelled')
    return
  }

  const decision = s.decision
  const { leadUpdates, newTime } = await prepareLeadUpdates({
    decision,
    lead: s.lead,
    message: s.message,
    currentStage: decision.stage,
    forcedLang: null,
  }, {
    llm: fakeTimeLLMFor(s.message, s.replyMode === 'blocked' ? 'blocked' : 'valid') as any,
    now: NOW,
  })

  const email = leadUpdates.email || s.lead.email
  const bookingLeadState = {
    pending_appointment_time: leadUpdates.pending_appointment_time || s.lead.pending_appointment_time || null,
    pending_appointment_set_at: leadUpdates.pending_appointment_set_at || s.lead.pending_appointment_set_at || null,
    matched_property_id: s.lead.matched_property_id || s.existingAppointment?.property_id || null,
    email: email || null,
    language: leadUpdates.language || s.lead.language || null,
    name: leadUpdates.name || s.lead.name || null,
  }

  let draft = decision.reply
  if (decision.action === 'reschedule_visit') {
    const apptCount = s.replyMode === 'blocked' ? 999 : 1
    if (!shouldAllowReschedule(apptCount)) {
      draft = buildTrollHaltReply()
    } else if (!newTime) {
      draft = buildReschedulePrompt()
    } else if (bookingTimeIssue(newTime, agent)) {
      draft = bookingTimeIssue(newTime, agent)!
    } else {
      const { visitTime, propertyId } = resolveBookingData(newTime, bookingLeadState, s.lead, s.existingAppointment?.property_id || null, s.existingAppointment)
      if (!visitTime || !propertyId) {
        draft = buildMissingDataAlert(leadUpdates.name || s.lead.name || 'Guest', '9999999999', email || undefined, visitTime, propertyId).reply
      } else {
        draft = buildSuccessReply(visitTime, email || undefined, leadUpdates.name || s.lead.name || 'Guest')
      }
    }
  }

  const finalReply = await aiComposeReply(draft, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() as any })
  expect(finalReply).toBeTruthy()
}

test.describe('full flow pressure test', () => {
  test('generates at least 200 scenarios', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(200)
  })

  for (const scenario of scenarios) {
    test(scenario.name, async () => {
      if (scenario.kind === 'discovery') {
        await runDiscoveryScenario(scenario)
      } else if (scenario.kind === 'booking') {
        await runBookingScenario(scenario)
      } else if (scenario.kind === 'confirmation') {
        await runConfirmationScenario(scenario)
      } else {
        await runAdjustmentScenario(scenario)
      }
    })
  }
})
