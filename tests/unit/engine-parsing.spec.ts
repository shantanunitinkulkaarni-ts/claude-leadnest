import { test, expect } from '@playwright/test'
import { parseEngineResponse, isMediaPlaceholder } from '../../lib/promptEngine'

// The engine asks the model for: reply text, then a metadata JSON object.
// Models drift on formatting (code fences, multi-line JSON, no JSON at all) —
// parsing must always preserve the reply and never throw the metadata away
// when it is recoverable.

test('reply + single-line JSON (the documented format)', () => {
  const out = parseEngineResponse(
    'Hi Rahul! Want to see it this weekend?\n{"score":7,"temperature":"warm","name":"Rahul"}',
    'commitment'
  )
  expect(out.reply).toBe('Hi Rahul! Want to see it this weekend?')
  expect(out.metadata.score).toBe(7)
  expect(out.metadata.name).toBe('Rahul')
  expect(out.metadata.stage).toBe('commitment')
})

test('JSON wrapped in markdown code fences (Gemini habit)', () => {
  const out = parseEngineResponse(
    'Sure, Saturday 11am works!\n```json\n{"score":8,"appointment_booked_time":"2026-06-13T11:00:00+05:30"}\n```',
    'commitment'
  )
  expect(out.reply).toBe('Sure, Saturday 11am works!')
  expect(out.metadata.appointment_booked_time).toBe('2026-06-13T11:00:00+05:30')
})

test('multi-line (pretty-printed) JSON still parses', () => {
  const out = parseEngineResponse(
    'Got it, noting your budget.\n{\n  "score": 5,\n  "budget_min": 5000000\n}',
    'qualification'
  )
  expect(out.reply).toBe('Got it, noting your budget.')
  expect(out.metadata.budget_min).toBe(5000000)
})

test('no JSON at all → reply kept, default metadata', () => {
  const out = parseEngineResponse('Hello! How can I help you today?', 'greeting')
  expect(out.reply).toBe('Hello! How can I help you today?')
  expect(out.metadata).toEqual({ stage: 'greeting' })
})

test('braces inside the reply text do not eat the message', () => {
  const out = parseEngineResponse(
    'The maintenance {society charges} are included.\n{"score":6}',
    'presentation'
  )
  expect(out.reply).toBe('The maintenance {society charges} are included.')
  expect(out.metadata.score).toBe(6)
})

test('reply that is only JSON does not loop or crash', () => {
  const out = parseEngineResponse('{"score":3', 'discovery')
  expect(out.reply).toBe('{"score":3')
  expect(out.metadata).toEqual({ stage: 'discovery' })
})

// ── Media placeholder leakage (the "[photo] Lodha [photo] Lodha" bug) ──
// The model sometimes echoes the "[photo] Title" markers we store for sent
// images. The real images go out separately; these markers must be stripped.

test('strips leaked [photo] Title placeholders from the reply', () => {
  const out = parseEngineResponse(
    'Sure, let me share the photos with you! [photo] Lodha [photo] Lodha [photo] Lodha\n{"score":7}',
    'commitment'
  )
  expect(out.reply).toBe('Sure, let me share the photos with you!')
  expect(out.metadata.score).toBe(7)
})

test('strips bare [image] / [video] placeholders', () => {
  const out = parseEngineResponse('Here you go [image] [video]\n{"score":5}', 'presentation')
  expect(out.reply).toBe('Here you go')
})

test('strips markdown image syntax', () => {
  const out = parseEngineResponse('Check this ![flat](https://x/y.jpg) out\n{"score":5}', 'presentation')
  expect(out.reply).toBe('Check this  out'.replace(/\s{2,}/g, ' '))
})

test('normal reply with square brackets that are not media is untouched', () => {
  const out = parseEngineResponse('The price [as discussed] is ₹95L.\n{"score":6}', 'presentation')
  expect(out.reply).toBe('The price [as discussed] is ₹95L.')
})

test.describe('isMediaPlaceholder', () => {
  const yes = ['[photo] Lodha', '[photo]', '  [image] Sunrise', '[video] tour', '[media]', '[attachment] file']
  for (const m of yes) test(`yes: "${m}"`, () => expect(isMediaPlaceholder(m)).toBe(true))

  const no = ['Sure, let me share the photos!', 'The [society] charges are extra', '', 'photos coming up']
  for (const m of no) test(`no: "${m}"`, () => expect(isMediaPlaceholder(m)).toBe(false))
})
