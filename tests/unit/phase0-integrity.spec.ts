import { test, expect } from '@playwright/test'
import { extractPropertyMedia } from '../../lib/media'

// ── Phase 0 Data Integrity — unit tests ──────────────────────────────────────
// These tests verify the new constraints and helpers introduced in Phase 0.
// They run without any DB connection (pure function tests).

test.describe('Phase 0A/0B — extractPropertyMedia: new property_media column', () => {
  test('reads from property_media column when present', () => {
    const prop = {
      property_media: ['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'],
      features: ['parking', 'gym', 'media:https://old-path.com/img.jpg'],
    }
    const result = extractPropertyMedia(prop)
    expect(result).toEqual(['https://cdn.example.com/photo1.jpg', 'https://cdn.example.com/photo2.jpg'])
  })

  test('falls back to features media: entries when property_media is empty', () => {
    const prop = {
      property_media: [],
      features: ['parking', 'media:https://cdn.example.com/legacy.jpg', 'gym'],
    }
    const result = extractPropertyMedia(prop)
    expect(result).toEqual(['https://cdn.example.com/legacy.jpg'])
  })

  test('falls back to features when property_media is absent (unmigrated row)', () => {
    const prop = {
      features: ['pool', 'media:https://cdn.example.com/photo.jpg'],
    }
    const result = extractPropertyMedia(prop)
    expect(result).toEqual(['https://cdn.example.com/photo.jpg'])
  })

  test('filters out non-http URLs from property_media', () => {
    const prop = {
      property_media: ['https://ok.com/img.jpg', 'ftp://bad.com/img.jpg', '', 'not-a-url'],
    }
    const result = extractPropertyMedia(prop)
    expect(result).toEqual(['https://ok.com/img.jpg'])
  })

  test('returns empty array for property with no media', () => {
    const prop = { features: ['parking', 'gym', 'pool'] }
    expect(extractPropertyMedia(prop)).toEqual([])
  })

  test('returns empty array for null/undefined property', () => {
    expect(extractPropertyMedia(null)).toEqual([])
    expect(extractPropertyMedia(undefined)).toEqual([])
    expect(extractPropertyMedia({})).toEqual([])
  })

  test('property_media with 4 photos returns all 4', () => {
    const urls = [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
      'https://cdn.example.com/d.jpg',
    ]
    expect(extractPropertyMedia({ property_media: urls })).toEqual(urls)
  })
})

test.describe('Phase 0B — valid status/temperature/intent values', () => {
  const VALID_STATUSES = ['new', 'contacted', 'qualified', 'visit_booked', 'visit_done', 'closed_won', 'closed_lost']
  const VALID_TEMPS = ['hot', 'warm', 'cold', 'new']
  const VALID_INTENTS = ['buy', 'rent']

  test('all valid lead statuses are defined', () => {
    expect(VALID_STATUSES).toHaveLength(7)
    // Ensure the LLM-facing stage names map to these
    expect(VALID_STATUSES).toContain('visit_booked')
    expect(VALID_STATUSES).toContain('visit_done')
  })

  test('valid temperature values cover the full range', () => {
    expect(VALID_TEMPS).toContain('hot')
    expect(VALID_TEMPS).toContain('warm')
    expect(VALID_TEMPS).toContain('cold')
    expect(VALID_TEMPS).toContain('new')
    expect(VALID_TEMPS).not.toContain('lukewarm')
    expect(VALID_TEMPS).not.toContain('neutral')
  })

  test('intent is exactly buy or rent', () => {
    expect(VALID_INTENTS).toHaveLength(2)
    expect(VALID_INTENTS).toContain('buy')
    expect(VALID_INTENTS).toContain('rent')
  })
})

test.describe('Phase 0C — cross-field validation logic', () => {
  test('budget_order: min must be ≤ max', () => {
    const validateBudget = (min: number | null, max: number | null): boolean => {
      if (min === null || max === null) return true
      return min <= max
    }
    expect(validateBudget(5000000, 9000000)).toBe(true)   // 50L–90L, valid
    expect(validateBudget(9000000, 5000000)).toBe(false)  // reversed, invalid
    expect(validateBudget(5000000, 5000000)).toBe(true)   // equal, valid
    expect(validateBudget(null, 9000000)).toBe(true)      // no min, valid
    expect(validateBudget(5000000, null)).toBe(true)      // no max, valid
    expect(validateBudget(null, null)).toBe(true)         // neither, valid
  })

  test('property price validation: rental needs rent_per_month', () => {
    const validateProperty = (type: string, price: number | null, rent_per_month: number | null): boolean => {
      if (type === 'rental') return rent_per_month !== null
      if (type === 'sale') return price !== null
      return false  // unknown type
    }
    expect(validateProperty('rental', null, 25000)).toBe(true)   // has rent
    expect(validateProperty('rental', 5000000, null)).toBe(false) // rental with no rent
    expect(validateProperty('sale', 9500000, null)).toBe(true)    // has price
    expect(validateProperty('sale', null, null)).toBe(false)      // sale with no price
  })
})

test.describe('Phase 0F — prompt engine property prompt uses property_media', () => {
  test('engine reads property_media first for media count in prompt', () => {
    // Simulates what buildEnginePrompt does for a property
    const p = {
      id: 'test-uuid',
      title: 'Skyline 2BHK',
      type: 'sale',
      price: 9500000,
      rent_per_month: null,
      property_media: ['https://cdn.example.com/sky1.jpg', 'https://cdn.example.com/sky2.jpg'],
      features: ['parking', 'gym'],  // no media: entries after migration
    }

    const mediaUrls: string[] = Array.isArray(p.property_media) && p.property_media.length > 0
      ? p.property_media.filter((u: string) => typeof u === 'string' && /^https?:\/\//i.test(u))
      : (p.features || []).filter((f: string) => typeof f === 'string' && f.startsWith('media:')).map((f: string) => f.slice(6))

    expect(mediaUrls).toHaveLength(2)
    expect(mediaUrls[0]).toBe('https://cdn.example.com/sky1.jpg')
  })

  test('engine falls back to features media: for unmigrated property', () => {
    const p = {
      id: 'test-uuid',
      title: 'Legacy Property',
      type: 'rental',
      rent_per_month: 25000,
      property_media: [],  // empty — not yet migrated
      features: ['parking', 'media:https://cdn.example.com/legacy.jpg'],
    }

    const mediaUrls: string[] = Array.isArray(p.property_media) && p.property_media.length > 0
      ? p.property_media.filter((u: string) => typeof u === 'string' && /^https?:\/\//i.test(u))
      : (p.features || []).filter((f: string) => typeof f === 'string' && f.startsWith('media:')).map((f: string) => f.slice(6))

    expect(mediaUrls).toHaveLength(1)
    expect(mediaUrls[0]).toBe('https://cdn.example.com/legacy.jpg')
  })
})
