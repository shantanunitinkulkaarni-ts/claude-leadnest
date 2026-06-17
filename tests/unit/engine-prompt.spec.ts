import { test, expect } from '@playwright/test'
import { buildEnginePrompt } from '../../lib/gemini'

// Minimal context fixture for the prompt builder. Only the fields it reads
// are populated — the rest can be omitted because TypeScript is `any` here.
function baseCtx(overrides: any = {}): any {
  return {
    agent: {
      agency_name: 'SK Properties',
      name: 'Shantanu',
      phone: '+919999999999',
      areas: ['Baner', 'Wakad'],
      property_types: ['Apartment'],
      office_open: '09:00',
      office_close: '19:00',
      bot_tone: 'friendly',
      languages: ['English', 'Hindi', 'Marathi'],
    },
    lead: {
      name: 'Rahul',
      phone: '+918888888888',
      intent: 'buy',
      preferred_areas: ['Baner'],
      ai_score: 5,
      status: 'qualified',
      temperature: 'warm',
      language: null,
    },
    properties: [],
    totalActiveCount: 0,
    currentTime: '2026-06-17T10:00:00+05:30',
    canSendPhotos: false,
    incomingMessage: '',
    detectedLang: null,
    ...overrides,
  }
}

// ─── Language directive injection ──────────────────────────────────────────
test.describe('buildEnginePrompt — language directive', () => {
  test('no language directive for English leads', () => {
    const prompt = buildEnginePrompt(baseCtx(), 'discovery', 3)
    expect(prompt).not.toMatch(/MANDATORY LANGUAGE RULE/)
  })

  test('injects Marathi-Devanagari directive when lead writes Devanagari Marathi', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'मला बाणेरमध्ये २BHK हवंय' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/MANDATORY LANGUAGE RULE/)
    expect(prompt).toMatch(/MARATHI \(Devanagari\)/)
    expect(prompt).toMatch(/Marathi in Devanagari script/)
  })

  test('injects Marathi-Latin directive when lead writes romanized Marathi', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'mala baner madhe 2bhk pahije' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/MARATHI \(Latin-script/)
    expect(prompt).toMatch(/Latin-script Marathi/)
  })

  test('injects Hindi-Latin directive for Hinglish leads', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'mujhe baner mein 2bhk chahiye' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/HINDI \(Latin-script/)
  })

  test('injects Hindi-Devanagari directive for native Hindi script', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'मुझे बानेर में 3BHK चाहिए' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/HINDI \(Devanagari\)/)
  })
})

// ─── Closing language reminder (the new Phase B feature) ───────────────────
test.describe('buildEnginePrompt — closing language reminder', () => {
  test('no closing reminder for English leads', () => {
    const prompt = buildEnginePrompt(baseCtx(), 'discovery', 3)
    expect(prompt).not.toMatch(/Aathvan theva|लक्षात ठेवा|Yaad rahe|याद रहे/)
  })

  test('Marathi-Latin lead gets Marathi-Latin closing reminder', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'mala 2bhk pahije baner madhe' }),
      'presentation',
      4,
    )
    expect(prompt).toMatch(/Aathvan theva/)
    expect(prompt).toMatch(/Latin script madhe/)
  })

  test('Marathi-Devanagari lead gets Devanagari closing reminder', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'मला २BHK हवंय बाणेरमध्ये' }),
      'presentation',
      4,
    )
    expect(prompt).toMatch(/लक्षात ठेवा/)
    expect(prompt).toMatch(/मराठीत/)
  })

  test('Hindi-Latin (Hinglish) lead gets Hinglish closing reminder', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'mujhe 3bhk chahiye wakad mein' }),
      'presentation',
      4,
    )
    expect(prompt).toMatch(/Yaad rahe/)
    expect(prompt).toMatch(/Hinglish/)
  })

  test('Hindi-Devanagari lead gets Devanagari Hindi closing reminder', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'मुझे ३BHK चाहिए वाकड़ में' }),
      'presentation',
      4,
    )
    expect(prompt).toMatch(/याद रहे/)
    expect(prompt).toMatch(/देवनागरी/)
  })

  test('the closing reminder is placed AFTER the few-shot examples block', () => {
    // The reminder must come at the END of the prompt where the model's
    // last-token attention is strongest. The few-shot block is identified by
    // the "EXAMPLES (structure" header. The closing reminder must appear
    // after that header in the string.
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'mala pahije' }),
      'presentation',
      4,
    )
    const exampleIdx = prompt.indexOf('EXAMPLES (structure')
    const reminderIdx = prompt.indexOf('Aathvan theva')
    expect(exampleIdx).toBeGreaterThan(0)
    expect(reminderIdx).toBeGreaterThan(exampleIdx)
  })
})

// ─── Few-shot example selection (the bug fix) ──────────────────────────────
test.describe('buildEnginePrompt — language-specific few-shot examples', () => {
  test('Marathi-Latin lead gets the Latin Marathi example (NOT Devanagari)', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'mala 2bhk pahije baner madhe' }),
      'discovery',
      2,
    )
    // Latin example contains 'baghayla yeta ka', Devanagari example contains 'बघायला'.
    expect(prompt).toMatch(/baghayla yeta ka/)
    expect(prompt).not.toMatch(/बघायला/)
  })

  test('Marathi-Devanagari lead gets the Devanagari Marathi example', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'mr', incomingMessage: 'मला २BHK हवंय बाणेरमध्ये' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/बघायला येता का/)
    // Latin sample's tell-tale phrase must NOT appear (we serve only one).
    expect(prompt).not.toMatch(/baghayla yeta ka/)
  })

  test('Hindi-Latin lead gets the Hinglish example', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'mujhe 3bhk chahiye wakad mein' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/bhaiya 1\.5 crore/)
  })

  test('Hindi-Devanagari lead gets the Devanagari Hindi example', () => {
    const prompt = buildEnginePrompt(
      baseCtx({ detectedLang: 'hi', incomingMessage: 'मुझे ३BHK चाहिए' }),
      'discovery',
      2,
    )
    expect(prompt).toMatch(/१\.५ करोड़|1\.5 करोड़|वाकड़ में/)
  })
})

// ─── FAMILY APPROVAL de-duplication (Phase B refactor) ─────────────────────
test.describe('buildEnginePrompt — FAMILY APPROVAL guidance', () => {
  test('FAMILY APPROVAL guidance is present in the objection stage', () => {
    const prompt = buildEnginePrompt(baseCtx(), 'objection', 5)
    expect(prompt).toMatch(/FAMILY APPROVAL/i)
    expect(prompt).toMatch(/family ko saath laiye|saath aao/i)
  })

  test('FAMILY APPROVAL guidance is NOT duplicated as a global section', () => {
    // Before Phase B refactor, this paragraph existed both globally AND in
    // the objection stage. Now only the objection stage version should be
    // present, and only when the stage is `objection`.
    const greetingPrompt = buildEnginePrompt(baseCtx(), 'greeting', 1)
    expect(greetingPrompt).not.toMatch(/FAMILY APPROVAL/i)
  })
})
