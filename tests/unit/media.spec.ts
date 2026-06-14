import { test, expect } from '@playwright/test'
import { extractPropertyMedia, wantsPhotos } from '../../lib/media'

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
  ]
  for (const m of no) {
    test(`no: "${m}"`, () => expect(wantsPhotos(m)).toBe(false))
  }
})
