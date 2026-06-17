import { test, expect } from '@playwright/test'
import { normalizeStatus, pick, extractEvents } from '../../lib/deliveryStatus'

test.describe('normalizeStatus', () => {
  const cases: [any, string | null][] = [
    ['delivered', 'delivered'],
    ['DELIVERED', 'delivered'],
    ['msg_delivered', 'delivered'],
    ['dlvrd', 'delivered'],
    ['read', 'read'],
    ['seen', 'read'],
    ['failed', 'failed'],
    ['FAILED', 'failed'],
    ['undelivered', 'failed'],
    ['rejected', 'failed'],
    ['bounced', 'failed'],
    ['error', 'failed'],
    ['sent', 'sent'],
    ['submitted', 'sent'],
    ['accepted', 'sent'],
    ['queued', 'sent'],
    ['', null],
    [null, null],
    [undefined, null],
  ]
  for (const [input, expected] of cases) {
    test(`"${String(input)}" → ${expected}`, () => {
      expect(normalizeStatus(input)).toBe(expected)
    })
  }

  test('unknown status is preserved verbatim (so we can learn the shape)', () => {
    expect(normalizeStatus('weird_new_state')).toBe('weird_new_state')
  })
})

test.describe('pick', () => {
  test('returns first non-empty string field in key order', () => {
    expect(pick({ a: '', b: 'x', c: 'y' }, ['a', 'b', 'c'])).toBe('x')
  })
  test('coerces numbers to strings', () => {
    expect(pick({ code: 408 }, ['code'])).toBe('408')
  })
  test('trims whitespace', () => {
    expect(pick({ id: '  abc  ' }, ['id'])).toBe('abc')
  })
  test('returns empty string when nothing matches or input is not an object', () => {
    expect(pick({ a: 'x' }, ['z'])).toBe('')
    expect(pick(null, ['a'])).toBe('')
    expect(pick('string', ['a'])).toBe('')
  })
})

test.describe('extractEvents', () => {
  test('single object with requestId + status', () => {
    const out = extractEvents({ requestId: 'abc123', status: 'delivered' })
    expect(out).toEqual([{ id: 'abc123', status: 'delivered', error: '' }])
  })

  test('data array of reports (common MSG91 bulk shape)', () => {
    const out = extractEvents({
      data: [
        { requestId: 'r1', status: 'delivered' },
        { requestId: 'r2', status: 'failed', error: 'invalid number' },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ id: 'r2', status: 'failed', error: 'invalid number' })
  })

  test('bare array', () => {
    const out = extractEvents([{ message_id: 'm9', eventType: 'READ' }])
    expect(out).toEqual([{ id: 'm9', status: 'read', error: '' }])
  })

  test('reports array variant', () => {
    const out = extractEvents({ reports: [{ msgId: 'k1', state: 'sent' }] })
    expect(out).toEqual([{ id: 'k1', status: 'sent', error: '' }])
  })

  test('alternative id + error field names', () => {
    const out = extractEvents({ uuid: 'u7', deliveryStatus: 'undelivered', failureReason: 'no whatsapp' })
    expect(out).toEqual([{ id: 'u7', status: 'failed', error: 'no whatsapp' }])
  })

  test('MSG91 media report keyed by message_uuid matches (the photo-delivery fix)', () => {
    const out = extractEvents({ data: [{ message_uuid: '7b4ba6f0', status: 'failed', reason: 'media download failed' }] })
    expect(out).toEqual([{ id: '7b4ba6f0', status: 'failed', error: 'media download failed' }])
  })

  test('numeric error code is captured as string', () => {
    const out = extractEvents({ id: 'x1', status: 'failed', error_code: 470 })
    expect(out[0]).toEqual({ id: 'x1', status: 'failed', error: '470' })
  })

  test('skips entries with neither id nor status', () => {
    const out = extractEvents({ data: [{ foo: 'bar' }, { id: 'good', status: 'sent' }] })
    expect(out).toEqual([{ id: 'good', status: 'sent', error: '' }])
  })

  test('status-only event (no id) is kept so failures still log', () => {
    const out = extractEvents({ status: 'failed', reason: 'template paused' })
    expect(out).toEqual([{ id: '', status: 'failed', error: 'template paused' }])
  })

  test('garbage / empty payloads produce no events', () => {
    expect(extractEvents(null)).toEqual([])
    expect(extractEvents(undefined)).toEqual([])
    expect(extractEvents('')).toEqual([])
    expect(extractEvents({})).toEqual([])
    expect(extractEvents([])).toEqual([])
  })
})
