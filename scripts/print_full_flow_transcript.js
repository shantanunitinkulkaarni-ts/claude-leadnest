const fs = require('fs')
const path = require('path')
const createJiti = require('jiti')

const jiti = createJiti(__filename)
const root = process.cwd()

const { parseTimeString, bookingTimeIssue, formatIST } = jiti(path.join(root, 'lib/timeParser.ts'))
const { aiDecoder, aiComposeReply } = jiti(path.join(root, 'lib/bot/aiDecoder.ts'))
const { runConversationFlowStep } = jiti(path.join(root, 'lib/bot/flowRunner.ts'))
const { leadToFlowLead, agentToFlowSettings, shouldUseConversationFlow } = jiti(path.join(root, 'lib/bot/flowDecisionAdapter.ts'))
const { buildPostPropertyDecision } = jiti(path.join(root, 'lib/bot/postPropertyDecision.ts'))
const { prepareLeadUpdates } = jiti(path.join(root, 'lib/bot/leadUpdates.ts'))
const {
  buildCancelReply,
  buildReschedulePrompt,
  buildTrollHaltReply,
  buildDoubleBookReply,
  buildMissingDataAlert,
  buildSuccessReply,
  shouldAllowReschedule,
  resolveBookingData,
} = jiti(path.join(root, 'lib/bot/booking_pure.ts'))
const { isConfirmationReply, isPendingAppointmentExpired } = jiti(path.join(root, 'lib/appointmentConfirmation.ts'))
const { searchPropertiesByFallbackChain } = jiti(path.join(root, 'lib/propertySearch.ts'))
const { presentProperties, noMatchText } = jiti(path.join(root, 'lib/propertyPresenter.ts'))

const NOW_MS = Date.parse('2026-07-05T06:30:00.000Z')
const NOW = new Date(NOW_MS)
const VALID_BOOKING_ISO = '2026-07-06T14:00:00+05:30'
const BLOCKED_BOOKING_ISO = '2026-07-06T07:00:00+05:30'

const agent = {
  agency_name: 'Rakesh Builders',
  name: 'Rakesh Builders',
  languages: ['English', 'Hindi', 'Marathi'],
  property_types: ['Apartment', 'Independent house', 'Row house', 'Office', 'Shop', 'Plot'],
  deal_types: ['buy', 'rent'],
  office_open: '09:00',
  office_close: '19:00',
  weekly_off: 'Sunday',
}

const flowAgent = agentToFlowSettings(agent)

const inventory = [
  {
    id: 'p1',
    agent_id: 'agent-1',
    type: 'sale',
    location: 'Baner',
    title: 'Skyline Residency',
    price: 9500000,
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
    price: 7900000,
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
    rent_per_month: 18000,
    deposit: 50000,
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
    price: 7200000,
    bhk: '2BHK',
    size_sqft: 1050,
    status: 'active',
    possession_status: 'ready_to_move',
    features: ['rera registered'],
  },
]

function fakeDecoderLLM(payload) {
  return async () => JSON.stringify(payload)
}

function fakeReplyLLM() {
  return async messages => {
    const user = messages.find(m => m.role === 'user')?.content || ''
    const match = user.match(/Brief \(facts to convey[^:]*\):\s*([\s\S]*)$/)
    const reply = match ? match[1].trim() : user.trim()
    return JSON.stringify({ reply })
  }
}

function fakeTimeLLMFor(_text, mode) {
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

function withLead(base) {
  return { ...currentLeadBase(), ...base }
}

function discoveryLeads() {
  return {
    ask_language: withLead({}),
    ask_name: withLead({ language: 'English' }),
    ask_property_type: withLead({ language: 'English', name: 'Rahul' }),
    ask_intent: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment' }),
    ask_area: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent' }),
    ask_budget: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent', preferred_areas: ['Baner'] }),
    ask_size: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'rent', preferred_areas: ['Baner'], budget_max: 30000 }),
    ready_to_search: withLead({ language: 'English', name: 'Rahul', property_category: 'apartment', intent: 'buy', preferred_areas: ['Baner'], budget_max: 10000000, bhk: '2BHK' }),
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
    { text: 'kal 2 baje', mode: 'valid' },
    { text: 'kal subah 10 baje', mode: 'valid' },
    { text: 'kal shaam 5 baje', mode: 'valid' },
    { text: 'parson 11 baje', mode: 'valid' },
    { text: 'agale hafte somvar 2 baje', mode: 'valid' },
    { text: 'tomorrow 5 pm', mode: 'valid' },
    { text: 'Sunday 11 AM', mode: 'blocked' },
    { text: 'next week monday 3 pm', mode: 'valid' },
    { text: 'somwar 2 baje', mode: 'valid' },
    { text: 'som 2 baje', mode: 'valid' },
    { text: 'monday 2 pm', mode: 'valid' },
    { text: 'udya sakali 9', mode: 'valid' },
    { text: 'parva sakali 10', mode: 'valid' },
    { text: 'ratri 7 baje', mode: 'blocked' },
    { text: 'aaj 7 baje', mode: 'blocked' },
    { text: 'eve 5 pm', mode: 'valid' },
    { text: 'evnining 5 pm', mode: 'valid' },
    { text: 'kabhi bhi', mode: 'invalid' },
    { text: 'kab aa sakte hai?', mode: 'invalid' },
    { text: 'next week', mode: 'invalid' },
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

function makeDiscoveryScenarios() {
  const scenarios = []
  const leads = discoveryLeads()
  const variants = discoveryVariants()
  for (const stage of Object.keys(variants)) {
    for (const message of variants[stage]) {
      const lead = { ...leads[stage] }
      const extracted = {}
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

function makeBookingLeadContext(kind, phrase, mode) {
  const base = {
    language: 'English',
    name: 'Rahul',
    property_category: 'apartment',
    intent: 'buy',
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
      pending_appointment_time: mode === 'blocked' ? BLOCKED_BOOKING_ISO : VALID_BOOKING_ISO,
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

function makeBookingScenarios() {
  const scenarios = []
  for (const { text: phrase, mode } of bookingPhrases()) {
    const extractedBase = {
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

function makeConfirmationScenarios() {
  const tokens = confirmationTokens()
  const freshTime = '2026-07-06T14:00:00+05:30'
  return tokens.flatMap(token => ([
    {
      kind: 'confirmation',
      name: `confirm fresh :: ${token}`,
      lead: withLead({ name: 'Rahul', email: 'rahul@example.com', pending_appointment_time: freshTime }),
      message: token,
      pendingAppointmentTime: freshTime,
      pendingSetAt: '2026-07-05T05:45:00.000Z',
      expectConfirm: true,
    },
    {
      kind: 'confirmation',
      name: `confirm expired :: ${token}`,
      lead: withLead({ name: 'Rahul', email: 'rahul@example.com', pending_appointment_time: freshTime }),
      message: token,
      pendingAppointmentTime: freshTime,
      pendingSetAt: '2026-07-05T00:00:00.000Z',
      expectConfirm: false,
    },
  ]))
}

function makeAdjustmentScenarios() {
  const phrases = adjustmentPhrases()
  const scenarios = []
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

const scenarios = [
  ...makeDiscoveryScenarios(),
  ...makeBookingScenarios(),
  ...makeConfirmationScenarios(),
  ...makeAdjustmentScenarios(),
]

function fakeSearchDraft(lead) {
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

async function runDiscoveryScenario(s) {
  const decoded = await aiDecoder(s.message, {}, { llm: fakeDecoderLLM(s.extracted) })
  const result = await runConversationFlowStep({
    agent: flowAgent,
    lead: leadToFlowLead(s.lead),
    message: s.message,
    recent: [],
  }, {
    decoder: async () => decoded,
  })

  let draft = result.decision.reply
  if (result.decision.readyToSearch) {
    const leadAfter = { ...s.lead, ...result.decision.updates }
    draft = fakeSearchDraft(leadAfter)
  }

  const finalReply = await aiComposeReply(draft, { language: decoded.language || 'english' }, { llm: fakeReplyLLM() })
  return `Customer: ${s.message}\nAssistant: ${finalReply}`
}

async function runBookingScenario(s) {
  const decoded = await aiDecoder(s.message, {}, { llm: fakeDecoderLLM(s.extracted) })
  const flowShouldHandle = shouldUseConversationFlow({
    lead: s.lead,
    extractedMessageType: decoded.message_type,
  })
  if (flowShouldHandle) {
    throw new Error(`Booking scenario incorrectly routed to conversation flow: ${s.name}`)
  }

  const decision = buildPostPropertyDecision({
    decoded: { ...decoded, raw_message: s.message },
    lead: s.lead,
  })
  if (!decision) {
    throw new Error(`No booking decision for: ${s.name}`)
  }

  if (s.expected === 'double_book') {
    const duplicateReply = buildDoubleBookReply(s.existingAppointment)
    const finalDuplicate = await aiComposeReply(duplicateReply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() })
    return `Customer: ${s.message}\nAssistant: ${finalDuplicate}`
  }

  const { leadUpdates, newTime } = await prepareLeadUpdates({
    decision,
    lead: s.lead,
    message: s.message,
    currentStage: decision.stage,
    forcedLang: null,
  }, {
    llm: (s.mode === 'invalid' ? fakeInvalidTimeLLM() : fakeTimeLLMFor(s.message, s.mode)),
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
    } else if (!visitTime || !propertyId) {
      draft = buildMissingDataAlert(leadUpdates.name || s.lead.name || 'Guest', '9999999999', customerEmail || undefined, visitTime, propertyId).reply
    } else if (bookingTimeIssue(visitTime, agent)) {
      draft = bookingTimeIssue(visitTime, agent)
    } else {
      draft = buildSuccessReply(visitTime, customerEmail || undefined, leadUpdates.name || s.lead.name || 'Guest')
    }
  } else {
    if (decision.updates?.visit_time && !customerEmail) {
      draft = 'Please share your email address so I can send the visit confirmation.'
    }
    if (!decision.updates?.visit_time) {
      draft = 'Please share the preferred date and time again so I can lock the visit.'
    }
  }

  const finalReply = await aiComposeReply(draft, { language: leadUpdates.language || s.lead.language || 'english' }, { llm: fakeReplyLLM() })
  return `Customer: ${s.message}\nAssistant: ${finalReply}`
}

async function runConfirmationScenario(s) {
  const expired = isPendingAppointmentExpired(s.pendingSetAt, NOW_MS)
  const shortcut = !!s.pendingAppointmentTime && !expired && isConfirmationReply(s.message)
  if (!shortcut) {
    return `Customer: ${s.message}\nAssistant: The pending visit is stale, so the app falls back to the normal booking flow.`
  }

  const reply = buildSuccessReply(s.pendingAppointmentTime, s.lead.email, s.lead.name || 'Guest')
  const finalReply = await aiComposeReply(reply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() })
  return `Customer: ${s.message}\nAssistant: ${finalReply}`
}

async function runAdjustmentScenario(s) {
  if (s.action === 'cancel_visit') {
    const reply = buildCancelReply(s.existingAppointment)
    const finalReply = await aiComposeReply(reply, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() })
    return `Customer: ${s.message}\nAssistant: ${finalReply}`
  }

  const decision = s.decision
  const { leadUpdates, newTime } = await prepareLeadUpdates({
    decision,
    lead: s.lead,
    message: s.message,
    currentStage: decision.stage,
    forcedLang: null,
  }, {
    llm: fakeTimeLLMFor(s.message, s.replyMode === 'blocked' ? 'blocked' : 'valid'),
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
      draft = bookingTimeIssue(newTime, agent)
    } else {
      const { visitTime, propertyId } = resolveBookingData(newTime, bookingLeadState, s.lead, s.existingAppointment?.property_id || null, s.existingAppointment)
      if (!visitTime || !propertyId) {
        draft = buildMissingDataAlert(leadUpdates.name || s.lead.name || 'Guest', '9999999999', email || undefined, visitTime, propertyId).reply
      } else {
        draft = buildSuccessReply(visitTime, email || undefined, leadUpdates.name || s.lead.name || 'Guest')
      }
    }
  }

  const finalReply = await aiComposeReply(draft, { language: s.lead.language || 'english' }, { llm: fakeReplyLLM() })
  return `Customer: ${s.message}\nAssistant: ${finalReply}`
}

async function main() {
  const lines = []
  lines.push(`Full flow transcript`)
  lines.push(`Scenarios: ${scenarios.length}`)
  lines.push('')

  for (const scenario of scenarios) {
    let block = ''
    if (scenario.kind === 'discovery') {
      block = await runDiscoveryScenario(scenario)
    } else if (scenario.kind === 'booking') {
      block = await runBookingScenario(scenario)
    } else if (scenario.kind === 'confirmation') {
      block = await runConfirmationScenario(scenario)
    } else {
      block = await runAdjustmentScenario(scenario)
    }
    lines.push(`### ${scenario.name}`)
    lines.push(block)
    lines.push('')
  }

  const outDir = path.join(root, 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'full-flow-transcript.txt')
  fs.writeFileSync(outPath, lines.join('\r\n'), 'utf8')
  console.log(`Wrote ${outPath}`)
  console.log(`Scenarios: ${scenarios.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
