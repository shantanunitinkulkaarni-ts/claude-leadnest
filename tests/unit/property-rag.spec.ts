import { test, expect } from '@playwright/test'
import { buildPropertyRagContext, selectPropertyRagProperties } from '../../lib/propertyRag'

test.describe('property RAG helpers', () => {
  test('selects relevant active properties and excludes sample rows', () => {
    const rows = [
      { id: 'real-baner', title: 'Real Baner Flat', type: 'rental', location: 'Baner', city: 'Pune', rent_per_month: 25000, status: 'active', is_sample: false },
      { id: 'sample-baner', title: 'Sample Flat', type: 'rental', location: 'Baner', city: 'Pune', rent_per_month: 20000, status: 'active', is_sample: true },
      { id: 'real-aundh', title: 'Real Aundh Flat', type: 'rental', location: 'Aundh', city: 'Pune', rent_per_month: 22000, status: 'active', is_sample: false },
    ]

    const selected = selectPropertyRagProperties(rows as any, { intent: 'rent', preferred_areas: ['Baner'], budget_max: 26000 }, 5)

    expect(selected.map(p => p.id)).toEqual(['real-baner'])
  })

  test('builds a compact markdown snapshot for the model', () => {
    const rows = [
      { id: 'real-1', title: 'Real Flat', type: 'sale', location: 'Wakad', city: 'Pune', price: 7500000, features: ['parking'], status: 'active', is_sample: false },
    ]

    const rag = buildPropertyRagContext(rows as any, { intent: 'buy', preferred_areas: ['Wakad'], budget_max: 8000000 }, { agencyName: 'Test Agency', limit: 3 })

    expect(rag).toContain('Property RAG Snapshot')
    expect(rag).toContain('Inventory: 1 active properties (0 rentals, 1 sales)')
    expect(rag).toContain('Real Flat')
    expect(rag).toContain('Sample listing: no')
  })
})
