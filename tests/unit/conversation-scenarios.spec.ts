/**
 * Indian real-estate conversation scenario tests.
 *
 * Tests pure signal-detection, stage-routing, and language-detection functions
 * against realistic WhatsApp messages from Indian RE buyers. These are the
 * scenarios most likely to trip up the bot — edge cases that generic training
 * data doesn't cover well.
 *
 * Run: BASE_URL=http://localhost:3003 npx playwright test tests/unit/conversation-scenarios.spec.ts
 */
import { test, expect } from '@playwright/test'
import { detectInboundSignals, topSignal } from '../../lib/intentSignals'
import { detectStage } from '../../lib/gemini'
import { detectMessageLanguage } from '../../lib/gemini'

// ─── VERY_INTERESTED — Indian RE-specific buying signals ──────────────────────

test.describe('very_interested — token / bayana / payment intent', () => {
  const tokenMessages = [
    'token dena hai, kaise karun?',
    'token dena chahta hun',
    'token bharna hai abhi',
    'bayana kitna hai?',
    'bayana dena hai property ka',
    'advance kitna dena hai?',
    'advance bharna hai',
  ]
  for (const m of tokenMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('very_interested')
    })
  }
})

test.describe('very_interested — agreement / registration', () => {
  const agreementMessages = [
    'agreement sign karte hain kab?',
    'agreement karna hai',
    'registry kab hogi?',
    'registration kab karein?',
    'loan sanction ho gaya, aage kya karna hai?',
  ]
  for (const m of agreementMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('very_interested')
    })
  }
})

test.describe('very_interested — English commitment phrases', () => {
  const commitMessages = [
    'where do I pay the token amount?',
    'let\'s finalize the deal',
    "I'll take it",
    'book it now',
    'deal pakki',
    'ready to buy',
  ]
  for (const m of commitMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('very_interested')
    })
  }
})

// ─── CALL_REQUEST — Indian phrases ───────────────────────────────────────────

test.describe('call_request — Hindi / Hinglish', () => {
  const callMessages = [
    'call lagao bhai',
    'call lagwao please',
    'call laga do',
    'phone karo mujhe',
    'baat karni hai phone pe',
    'phone par baat karein',
    'please call me',
    'can you call me?',
    'call karo',
  ]
  for (const m of callMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('call_request')
    })
  }
})

// ─── HUMAN_REQUEST ────────────────────────────────────────────────────────────

test.describe('human_request — wants agent / person', () => {
  const humanMessages = [
    'kisi se baat karni hai',
    'agent ka number do',
    'I want to talk to a person',
    'can I speak with an agent',
    'connect me with a real person',
  ]
  for (const m of humanMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('human_request')
    })
  }
})

// ─── VISIT_NOW ────────────────────────────────────────────────────────────────

test.describe('visit_now — arriving imminently', () => {
  const arrivingMessages = [
    "I'm on my way",
    'coming now',
    'reaching in 10 mins',
    'I am outside the property',
    'main aa raha hu',
    'aa raha hun abhi',
    'nikal gaya hun',
    'मी येतोय',
  ]
  for (const m of arrivingMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('visit_now')
    })
  }
})

// ─── COMPETITOR ───────────────────────────────────────────────────────────────

test.describe('competitor — broker / CRM probing', () => {
  const competitorMessages = [
    "I'm also a broker",
    'which CRM do you use?',
    'what software are you using',
    'I deal in real estate too',
    'channel partner',
    'commission split kitna hai?',
  ]
  for (const m of competitorMessages) {
    test(`"${m}"`, () => {
      expect(detectInboundSignals(m).priorities).toContain('competitor')
    })
  }
})

// ─── NO FALSE POSITIVES — normal Indian RE buyer messages ─────────────────────

test.describe('no false positives — typical buyer messages', () => {
  const normalMessages = [
    // Price & budget queries (not commitment)
    'what is the price of the 2BHK in Baner?',
    'budget 1.2 crore hai mera',
    'kya ₹80L mein kuch milega?',
    'EMI kitni hogi 80 lakh pe?',
    'home loan milega kya?',
    // Vastu & amenities (common Indian concerns, not signals)
    'east facing hai kya?',
    'vastu theek hai?',
    'society mein pool hai?',
    'gym aur parking hai?',
    'maintenance charges kitne hain?',
    // Area / property queries
    'Hinjewadi se kita door hai?',
    'school nearby hai kya?',
    'builder kaun hai?',
    'RERA registered hai?',
    'possession kab milegi?',
    // Casual / exploratory
    'just looking',
    'share details please',
    'abhi decide nahi kiya hai',
    'wife ko bhi dikhana hai',
    'family se baat karni hai',
    'thoda sochna hai',
    // Discount query (not very_interested — just price objection)
    'discount milega kya?',
    '5 lakh kam ho sakta hai?',
  ]
  for (const m of normalMessages) {
    test(`clean: "${m}"`, () => {
      const r = detectInboundSignals(m)
      expect(r.guardrail).toBeNull()
      // These are genuine buyer messages — no high-priority signal expected
      // (note: some agents may occasionally fire, but these shouldn't)
      const noSignals = ['visit_now', 'very_interested', 'competitor'] as const
      for (const sig of noSignals) {
        expect(r.priorities).not.toContain(sig)
      }
    })
  }
})

// ─── topSignal urgency ordering ───────────────────────────────────────────────

test.describe('topSignal — urgency order', () => {
  test('visit_now beats very_interested', () => {
    expect(topSignal(['very_interested', 'visit_now'])).toBe('visit_now')
  })
  test('very_interested beats call_request', () => {
    expect(topSignal(['call_request', 'very_interested'])).toBe('very_interested')
  })
  test('call_request beats human_request', () => {
    expect(topSignal(['human_request', 'call_request'])).toBe('call_request')
  })
  test('human_request beats competitor', () => {
    expect(topSignal(['competitor', 'human_request'])).toBe('human_request')
  })
  test('empty → null', () => {
    expect(topSignal([])).toBeNull()
  })
})

// ─── detectStage — Indian lead profiles ──────────────────────────────────────

test.describe('detectStage — Indian RE lead profiles', () => {
  test('first message → greeting', () => {
    expect(detectStage({}, 1)).toBe('greeting')
  })

  test('NRI buyer: has name+intent+budget but no visit status → presentation', () => {
    // NRI leads often send all info upfront; with score 5 they jump to presentation
    expect(detectStage({
      name: 'Suresh Iyer', intent: 'buy', preferred_areas: ['Hinjewadi'],
      budget_min: 8000000, budget_max: 15000000, ai_score: 5,
    }, 3)).toBe('presentation')
  })

  test('rental lead: just entered intent → discovery still needed', () => {
    expect(detectStage({ intent: 'rent' }, 2)).toBe('discovery')
  })

  test('qualified rental lead → presentation', () => {
    expect(detectStage({
      name: 'Priya Joshi', intent: 'rent', preferred_areas: ['Kothrud'],
      budget_min: 25000, ai_score: 5,
    }, 5)).toBe('presentation')
  })

  test('walk-in visitor (post_visit_result set) → post_visit immediately', () => {
    // Agent logs visit outcome even before chat — stage must reflect that
    expect(detectStage({
      name: 'Amit Shah', post_visit_result: 'interested',
    }, 2)).toBe('post_visit')
  })

  test('visit_done status → post_visit', () => {
    expect(detectStage({ name: 'Rahul', status: 'visit_done', intent: 'buy' }, 8)).toBe('post_visit')
  })

  test('hot qualified lead (score 8, qualified) → commitment', () => {
    expect(detectStage({
      name: 'Kiran Desai', intent: 'buy', preferred_areas: ['Baner'],
      budget_min: 7000000, ai_score: 8, status: 'qualified',
    }, 6)).toBe('commitment')
  })

  test('visit_booked status → commitment (keep them committed)', () => {
    expect(detectStage({ name: 'Neha', status: 'visit_booked', intent: 'buy' }, 5)).toBe('commitment')
  })

  test('closed_won → closed', () => {
    expect(detectStage({ status: 'closed_won', name: 'Ravi' }, 15)).toBe('closed')
  })

  test('closed_lost → closed', () => {
    expect(detectStage({ status: 'closed_lost', name: 'Meera' }, 12)).toBe('closed')
  })

  test('cold low-score lead with 8 msgs → presentation (bot keeps showing properties)', () => {
    // Note: nurture stage requires cold temp + msgCount>6, but the presentation
    // shortcut (msgCount>=5 && hasAnyCriteria) fires first. The bot stays in
    // presentation for these leads; agent should nurture manually via outreach.
    expect(detectStage({
      name: 'Suresh', intent: 'buy', preferred_areas: ['Wakad'],
      budget_min: 6000000, temperature: 'cold', ai_score: 2,
    }, 8)).toBe('presentation')
  })

  test('no name yet at msg 4 → discovery (name capture first)', () => {
    expect(detectStage({ intent: 'buy', preferred_areas: ['Baner'] }, 3)).toBe('discovery')
  })

  test('message 5+ with some criteria → presentation (never drag discovery)', () => {
    expect(detectStage({ intent: 'buy', preferred_areas: ['Baner'] }, 5)).toBe('presentation')
  })
})

// ─── detectMessageLanguage — realistic Indian messages ───────────────────────

test.describe('detectMessageLanguage — Marathi (Latin script)', () => {
  const marathiLatinMessages = [
    ['mala 3bhk pahije hinjewadi madhe', 'mr'],
    ['amhi satha baghayla yeto', 'mr'],
    ['budget 1.5 crore aahe', 'mr'],
    ['nako, amhala hinjewadi nako aahe', 'mr'],
    ['tumhi price sangu shakata ka?', 'mr'],
    ['mala east facing flat pahije', 'mr'],
  ] as const
  for (const [msg, lang] of marathiLatinMessages) {
    test(`"${msg}" → ${lang}`, () => {
      expect(detectMessageLanguage(msg)).toBe(lang)
    })
  }
})

test.describe('detectMessageLanguage — Devanagari Marathi', () => {
  const marathiDevMessages = [
    ['मला बाणेरमध्ये 2bhk हवंय', 'mr'],
    ['आम्हाला लवकर ताबा हवा आहे', 'mr'],
    ['नाही, हे आम्हाला नको आहे', 'mr'],
  ] as const
  for (const [msg, lang] of marathiDevMessages) {
    test(`"${msg}" → ${lang}`, () => {
      expect(detectMessageLanguage(msg)).toBe(lang)
    })
  }
})

test.describe('detectMessageLanguage — Hindi (Hinglish / Latin)', () => {
  const hindiMessages = [
    ['bhaiya 3BHK chahiye hinjewadi mein 1.5 crore mein', 'hi'],
    ['mujhe ek acchi property chahiye', 'hi'],
    ['theek hai, haan site dekhte hain', 'hi'],
    ['bahut zyada lag raha hai price', 'hi'],
    ['jaldi chahiye, kya available hai?', 'hi'],
    ['bilkul, aapko call karta hun', 'hi'],
  ] as const
  for (const [msg, lang] of hindiMessages) {
    test(`"${msg}" → ${lang}`, () => {
      expect(detectMessageLanguage(msg)).toBe(lang)
    })
  }
})

test.describe('detectMessageLanguage — Devanagari Hindi', () => {
  const hindiDevMessages = [
    ['मुझे बाणेर में 2bhk चाहिए', 'hi'],
    ['क्या यह RERA पंजीकृत है?', 'hi'],
    ['बहुत महंगा है, कुछ कम होगा?', 'hi'],
  ] as const
  for (const [msg, lang] of hindiDevMessages) {
    test(`"${msg}" → ${lang}`, () => {
      expect(detectMessageLanguage(msg)).toBe(lang)
    })
  }
})

test.describe('detectMessageLanguage — English / ambiguous', () => {
  test('"Hi" → null (ambiguous short greeting)', () => {
    expect(detectMessageLanguage('Hi')).toBeNull()
  })
  test('"ok" → null (too short)', () => {
    expect(detectMessageLanguage('ok')).toBeNull()
  })
  test('"I am looking for a 2BHK in Baner" → null (English, no stored lang needed)', () => {
    expect(detectMessageLanguage('I am looking for a 2BHK in Baner')).toBeNull()
  })
})

test.describe('detectMessageLanguage — stored language fallback', () => {
  test('short "ok" with stored mr → mr', () => {
    expect(detectMessageLanguage('ok', 'mr')).toBe('mr')
  })
  test('short "yes" with stored hi → hi', () => {
    expect(detectMessageLanguage('yes', 'hi')).toBe('hi')
  })
  test('clear Hindi signal overrides stored mr', () => {
    expect(detectMessageLanguage('mujhe chahiye', 'mr')).toBe('hi')
  })
  test('clear Marathi signal overrides stored hi', () => {
    expect(detectMessageLanguage('mala pahije', 'hi')).toBe('mr')
  })
})
