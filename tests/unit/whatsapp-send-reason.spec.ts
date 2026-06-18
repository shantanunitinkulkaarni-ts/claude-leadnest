import { test, expect } from '@playwright/test'
import { msg91ErrorReason } from '../../lib/whatsapp'

// Item #1 of messaging reliability: when a send is rejected, we must capture
// the REAL reason (not throw it away). msg91ErrorReason turns an axios/MSG91
// error into a short, storable reason string.
test.describe('msg91ErrorReason', () => {
  test('uses MSG91 response message when present', () => {
    const err = { response: { data: { message: 'recipient number not in allowed list' } } }
    expect(msg91ErrorReason(err)).toBe('recipient number not in allowed list')
  })

  test('uses response.error field when there is no message', () => {
    const err = { response: { data: { error: 'template not approved' } } }
    expect(msg91ErrorReason(err)).toBe('template not approved')
  })

  test('handles a plain string response body', () => {
    const err = { response: { data: 'Bad Request' } }
    expect(msg91ErrorReason(err)).toBe('Bad Request')
  })

  test('serializes an unexpected object body so nothing is lost', () => {
    const err = { response: { data: { code: 400, hint: 'window closed' } } }
    const r = msg91ErrorReason(err)
    expect(r).toContain('window closed')
  })

  test('falls back to the error message when there is no response body', () => {
    expect(msg91ErrorReason({ message: 'socket hang up' })).toBe('socket hang up')
  })

  test('never returns empty — unknown errors get a placeholder', () => {
    expect(msg91ErrorReason({})).toBe('unknown send error')
  })

  test('caps very long reasons to a storable length', () => {
    const err = { response: { data: 'x'.repeat(5000) } }
    expect(msg91ErrorReason(err).length).toBeLessThanOrEqual(300)
  })
})
