import { test, expect } from '@playwright/test'
import { verifySharedSecret } from '../../lib/webhookAuth'

test.describe('verifySharedSecret — constant-time token comparison', () => {
  const secret = 'a'.repeat(64) // 64-char hex-style secret

  test('matching token returns true', () => {
    expect(verifySharedSecret(secret, secret)).toBe(true)
  })

  test('wrong token returns false', () => {
    expect(verifySharedSecret('wrong', secret)).toBe(false)
  })

  test('empty incoming returns false', () => {
    expect(verifySharedSecret('', secret)).toBe(false)
    expect(verifySharedSecret(null, secret)).toBe(false)
    expect(verifySharedSecret(undefined, secret)).toBe(false)
  })

  test('empty expected returns false (env var not set)', () => {
    expect(verifySharedSecret(secret, '')).toBe(false)
    expect(verifySharedSecret(secret, null)).toBe(false)
    expect(verifySharedSecret(secret, undefined)).toBe(false)
  })

  test('both empty returns false', () => {
    expect(verifySharedSecret('', '')).toBe(false)
  })

  test('different-length tokens return false without throwing', () => {
    expect(verifySharedSecret('short', secret)).toBe(false)
    expect(verifySharedSecret(secret, 'short')).toBe(false)
  })

  test('one-char difference returns false', () => {
    const almostRight = secret.slice(0, -1) + 'b'
    expect(verifySharedSecret(almostRight, secret)).toBe(false)
  })

  test('real 64-char hex secrets match correctly', () => {
    const hex = '3d9e2f1a8b4c7e0f5a2d6c9b1e4f8a3c7d0e5b2f9a6c3d1e8b5f2a0c7d4e9b1f'
    expect(verifySharedSecret(hex, hex)).toBe(true)
    expect(verifySharedSecret(hex + '0', hex)).toBe(false)
  })
})
