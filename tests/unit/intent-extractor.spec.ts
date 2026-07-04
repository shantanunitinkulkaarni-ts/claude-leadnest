import { test, expect } from '@playwright/test'
import { parseExtractedIntent, parseBudgetText, defaultIntent, extractIntent } from '../../lib/intentExtractor'

test.describe('parseBudgetText — robust budgets (sale + rental)', () => {
  test('lakh / crore', () => {
    expect(parseBudgetText('50 lakh')).toBe(5_000_000)
    expect(parseBudgetText('1.2 cr')).toBe(12_000_000)
  })
  test('rental forms: 20k, ₹18,000, bare number', () => {
    expect(parseBudgetText('20k')).toBe(20_000)
    expect(parseBudgetText('₹18,000')).toBe(18_000)
    expect(parseBudgetText('18000')).toBe(18_000)
  })
  test('plain number value', () => expect(parseBudgetText(7_500_000)).toBe(7_500_000))
  test('garbage → null', () => {
    expect(parseBudgetText('soon')).toBeNull()
    expect(parseBudgetText(null)).toBeNull()
  })
})

test.describe('parseExtractedIntent — validates whatever the model returns', () => {
  test('clean JSON', () => {
    const r = parseExtractedIntent('{"name":"Rahul","intent":"rent","areas":["Baner"],"bhk":"2","budget":"20k","message_type":"property_request","language":"english"}')
    expect(r.name).toBe('Rahul')
    expect(r.intent).toBe('rent')
    expect(r.areas).toEqual(['Baner'])
    expect(r.bhk).toBe('2BHK')
    expect(r.budget_max).toBe(20_000)
    expect(r.message_type).toBe('property_request')
  })

  test('JSON wrapped in code fences + prose is still parsed', () => {
    const raw = 'Sure, here:\n```json\n{"intent":"buy","budget":"90 lakh","areas":["Wakad"]}\n```\nhope that helps'
    const r = parseExtractedIntent(raw)
    expect(r.intent).toBe('buy')
    expect(r.budget_max).toBe(9_000_000)
    expect(r.areas).toEqual(['Wakad'])
  })

  test('garbage / non-JSON → safe default (message_type other), never crashes', () => {
    expect(parseExtractedIntent('I think they want a flat')).toEqual(defaultIntent())
    expect(parseExtractedIntent('')).toEqual(defaultIntent())
    expect(parseExtractedIntent('{broken json').message_type).toBe('other')
  })

  test('invalid enum values are rejected, not trusted', () => {
    const r = parseExtractedIntent('{"intent":"maybe","message_type":"flirting"}')
    expect(r.intent).toBeNull()           // only buy/rent allowed
    expect(r.message_type).toBe('other')  // unknown type → other
  })

  test('areas accepts a single string too', () => {
    expect(parseExtractedIntent('{"areas":"Hinjewadi"}').areas).toEqual(['Hinjewadi'])
  })

  test('bhk normalized; null-ish strings become null', () => {
    expect(parseExtractedIntent('{"bhk":"3 bhk"}').bhk).toBe('3BHK')
    expect(parseExtractedIntent('{"property_category":"null","bhk":"none"}').property_category).toBeNull()
  })

  test('no bedroom preference is normalized', () => {
    expect(parseExtractedIntent('{"bhk":"no preference"}').bhk).toBe('no_preference')
  })

  test('language normalized from partial words', () => {
    expect(parseExtractedIntent('{"language":"Marathi"}').language).toBe('marathi')
    expect(parseExtractedIntent('{"language":"hin"}').language).toBe('hindi')
  })

  test('Hinglish example: "Baner me 2bhk rent chahiye 20k tak"', () => {
    // What a correct model extraction would look like for a Hinglish message.
    const r = parseExtractedIntent('{"intent":"rent","areas":["Baner"],"bhk":"2BHK","budget":"20k","message_type":"property_request","language":"hindi"}')
    expect(r).toMatchObject({ intent: 'rent', bhk: '2BHK', budget_max: 20_000, language: 'hindi' })
  })

  test('AI-provided budget_min and budget_max are trusted before older budget text', () => {
    const r = parseExtractedIntent('{"budget":"20-30k","budget_min":20000,"budget_max":30000,"message_type":"qualifying_answer"}')
    expect(r.budget_min).toBe(20_000)
    expect(r.budget_max).toBe(30_000)
  })

  test('email from AI output is carried through for visit confirmation', () => {
    const r = parseExtractedIntent('{"message_type":"qualifying_answer","email":"me@example.com"}')
    expect(r.email).toBe('me@example.com')
  })
})

test.describe('extractIntent — model call wrapper (mocked)', () => {
  test('parses a good model response', async () => {
    const fakeLLM = async () => '{"intent":"buy","areas":["Baner"],"budget":"90 lakh","message_type":"property_request"}'
    const r = await extractIntent('I want to buy in Baner around 90 lakh', {}, { llm: fakeLLM as any })
    expect(r.intent).toBe('buy')
    expect(r.budget_max).toBe(9_000_000)
  })

  test('model throwing → safe default (never throws up to caller)', async () => {
    const boom = async () => { throw new Error('GLM down') }
    const r = await extractIntent('hi', {}, { llm: boom as any })
    expect(r).toEqual(defaultIntent())
  })
})
