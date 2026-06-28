import { test, expect } from '@playwright/test'
import { isFreePlan } from '../../lib/planLimits'

test.describe('isFreePlan', () => {
  test('free plan stays free before payment', () => {
    expect(isFreePlan({ plan: 'free', plan_status: 'free' })).toBe(true)
  })

  test('active paid plan unlocks caps even if the plan label is still free', () => {
    expect(isFreePlan({ plan: 'free', plan_status: 'active' })).toBe(false)
  })

  test('cancelled paid plan still unlocks caps during the paid period', () => {
    expect(isFreePlan({ plan: 'free', plan_status: 'cancelled' })).toBe(false)
  })
})
