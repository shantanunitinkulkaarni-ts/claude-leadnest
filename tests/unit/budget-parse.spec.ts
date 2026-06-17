import { test, expect } from '@playwright/test'
import { parseBudgetRupees, isGrosslyOffBudget } from '../../lib/budgetParse'

test.describe('parseBudgetRupees', () => {
  test('lakh variants', () => {
    expect(parseBudgetRupees('around 50 lakh')).toBe(5000000)
    expect(parseBudgetRupees('50lakh')).toBe(5000000)
    expect(parseBudgetRupees('budget 95 lac')).toBe(9500000)
    expect(parseBudgetRupees('50L')).toBe(5000000)
    expect(parseBudgetRupees('20,00,000 nahi, 50 lakhs')).toBe(5000000)
  })
  test('crore variants (preferred over lakh)', () => {
    expect(parseBudgetRupees('1.2 crore')).toBe(12000000)
    expect(parseBudgetRupees('1.5cr budget')).toBe(15000000)
  })
  test('ranges take the upper figure', () => {
    expect(parseBudgetRupees('50-60 lakh')).toBe(6000000)
    expect(parseBudgetRupees('1 to 1.2 crore')).toBe(12000000)
  })
  test('no figure → null', () => {
    expect(parseBudgetRupees('2BHK in Baner')).toBe(null)
    expect(parseBudgetRupees('')).toBe(null)
    expect(parseBudgetRupees('looking to buy soon')).toBe(null)
  })
})

test.describe('isGrosslyOffBudget', () => {
  test('flags 10x mis-scale and missing values', () => {
    expect(isGrosslyOffBudget(500000, 5000000)).toBe(true)  // "50 lakh" stored as 5L
    expect(isGrosslyOffBudget(null, 5000000)).toBe(true)
    expect(isGrosslyOffBudget(undefined, 5000000)).toBe(true)
  })
  test('accepts reasonable values (no false correction)', () => {
    expect(isGrosslyOffBudget(5000000, 5000000)).toBe(false)
    expect(isGrosslyOffBudget(6000000, 5000000)).toBe(false) // a range upper bound
    expect(isGrosslyOffBudget(4000000, 5000000)).toBe(false)
  })
})
