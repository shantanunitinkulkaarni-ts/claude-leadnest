import { test, expect } from '@playwright/test'
import { parseEngineResponse } from '../../lib/gemini'

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
