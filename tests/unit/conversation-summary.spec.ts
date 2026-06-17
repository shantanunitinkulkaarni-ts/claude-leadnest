import { test, expect } from '@playwright/test'
import { shouldRefreshSummary } from '../../lib/conversationSummary'

/**
 * Pure trigger logic for the rolling conversation summary (Phase 4A).
 * Real production check (2026-06-16): 5 of 11 leads with any messages
 * already exceed 20 — long conversations are a real, current case, not
 * hypothetical, even pre-launch.
 */

test.describe('shouldRefreshSummary', () => {
  test('short conversation never triggers, regardless of last summarized count', () => {
    expect(shouldRefreshSummary(20, null)).toBe(false)
    expect(shouldRefreshSummary(5, 0)).toBe(false)
  })

  test('first refresh fires once past the trigger threshold', () => {
    expect(shouldRefreshSummary(21, null)).toBe(true)
    expect(shouldRefreshSummary(28, null)).toBe(true)
  })

  test('no refresh until 8 new messages have piled up since last summary', () => {
    expect(shouldRefreshSummary(25, 21)).toBe(false)
    expect(shouldRefreshSummary(28, 21)).toBe(false)
  })

  test('refresh fires again once 8+ new messages have piled up', () => {
    expect(shouldRefreshSummary(29, 21)).toBe(true)
    expect(shouldRefreshSummary(50, 21)).toBe(true)
  })

  test('exactly at the trigger threshold does not fire (boundary)', () => {
    expect(shouldRefreshSummary(20, null)).toBe(false)
  })

  test('exactly at the refresh-gap threshold fires (boundary)', () => {
    expect(shouldRefreshSummary(29, 21)).toBe(true)
    expect(shouldRefreshSummary(28, 21)).toBe(false)
  })
})
