import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractPropertyMedia, wantsPhotos, botPromisedPhotos } from '../../lib/media'

// Regression guard (June 2026): Phase 0F moved property photos out of the
// `features` array into a dedicated `property_media` column. The webhook's
// property search feeds getPropertyPhotos (which reads property_media + features),
// so that query MUST pull property_media. It currently uses `.select('*')`
// (pulls every column); these tests fail loudly if anyone narrows it to an
// explicit column list that omits property_media.
test.describe('webhook property search pulls property_media (Phase 0F regression)', () => {
  const src = readFileSync(join(__dirname, '../../app/api/webhook/route.ts'), 'utf8')
  // Each `from('properties').select(...)` that can feed photos must select '*'
  // (all columns) or explicitly include property_media.
  const propSelects = src.match(/from\(['"`]properties['"`]\)[\s\S]*?\.select\([^)]*\)/g) || []
  test('found the property search select', () => expect(propSelects.length).toBeGreaterThan(0))
  propSelects.forEach((s, i) => {
    test(`property search #${i + 1} pulls property_media (or *)`, () =>
      expect(s.includes("'*'") || s.includes('"*"') || s.includes('property_media')).toBe(true))
  })
})

test.describe('extractPropertyMedia', () => {
  test('extracts http(s) media URLs, strips prefix', () => {
    const p = { features: ['east-facing', 'media:https://cdn.x/a.jpg', 'gym', 'media:https://cdn.x/b.png'] }
    expect(extractPropertyMedia(p)).toEqual(['https://cdn.x/a.jpg', 'https://cdn.x/b.png'])
  })
  test('ignores non-media features and non-http media', () => {
    const p = { features: ['media:not-a-url', 'media:ftp://x/y.jpg', 'pool'] }
    expect(extractPropertyMedia(p)).toEqual([])
  })
  test('handles missing/garbage features', () => {
    expect(extractPropertyMedia({})).toEqual([])
    expect(extractPropertyMedia(null)).toEqual([])
    expect(extractPropertyMedia({ features: 'nope' })).toEqual([])
  })
})

test.describe('wantsPhotos', () => {
  const yes = [
    'can you send me photos?',
    'show me some pics',
    'I want to see pictures of the flat',
    'koi image hai?',
    'photo bhejo',
    'फोटो भेजो',
    'तस्वीर दिखाओ',
    'gallery?',
    'dikhao property',
    'photos bhej do',
    'share karo photos',
  ]
  for (const m of yes) {
    test(`yes: "${m}"`, () => expect(wantsPhotos(m)).toBe(true))
  }

  const no = [
    'what is the price?',
    'is it ready to move in',
    'can you email the floor plan', // floor plan is not a photo — bot still cannot send
    'where is the office',
    '',
    'share',  // too vague — could mean anything
  ]
  for (const m of no) {
    test(`no: "${m}"`, () => expect(wantsPhotos(m)).toBe(false))
  }
})

test.describe('botPromisedPhotos', () => {
  const yes = [
    'Sure! Let me share the photos with you right now.',
    'The photos should be arriving in your chat shortly.',
    'Haan, photos bhejta hun!',
    'Sure, sharing the photos now.',
    'Let me send the photos to you.',
    'Sending the images right away!',
  ]
  for (const r of yes) {
    test(`yes: "${r}"`, () => expect(botPromisedPhotos(r)).toBe(true))
  }

  const no = [
    'Would you like to see photos?',
    'Happy to set up a visit for you!',
    'Great choice — this property is in Baner.',
    '',
  ]
  for (const r of no) {
    test(`no: "${r}"`, () => expect(botPromisedPhotos(r)).toBe(false))
  }
})
