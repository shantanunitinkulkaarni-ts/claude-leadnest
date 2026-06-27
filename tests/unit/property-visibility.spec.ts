import { test, expect } from '@playwright/test'
import { excludeSampleProperties } from '../../lib/propertyVisibility'

test.describe('excludeSampleProperties', () => {
  test('removes onboarding sample rows from customer-facing property lists', () => {
    const rows = [
      { id: 'real-1', title: 'Real Property', is_sample: false },
      { id: 'sample-1', title: 'Sample Property', is_sample: true },
      { id: 'real-2', title: 'Another Real Property' },
    ]

    const filtered = excludeSampleProperties(rows as any)

    expect(filtered.map(r => r.id)).toEqual(['real-1', 'real-2'])
  })
})
