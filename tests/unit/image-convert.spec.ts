import { test, expect } from '@playwright/test'
import { needsWhatsAppConversion, toWhatsAppJpeg, WA_MAX_DIMENSION } from '../../lib/imageConvert'
import sharp from 'sharp'

// WhatsApp only delivers JPEG/PNG; everything else must be converted. These guard
// the rule that decides which stored media URLs need re-encoding.
test.describe('needsWhatsAppConversion', () => {
  const convert = [
    'https://x.co/a.avif',
    'https://x.co/a.webp',
    'https://x.co/a.heic',
    'https://x.co/a.png',
    'https://x.co/a.gif',
    'https://x.co/photo',                 // no extension
    'https://x.co/a.AVIF',                // case-insensitive
    'https://x.co/a.avif?token=123',      // query string ignored
  ]
  for (const u of convert) test(`converts: ${u}`, () => expect(needsWhatsAppConversion(u)).toBe(true))

  const keep = [
    'https://x.co/a.jpg',
    'https://x.co/a.jpeg',
    'https://x.co/a.JPG',
    'https://x.co/a.jpg?width=200',
  ]
  for (const u of keep) test(`keeps: ${u}`, () => expect(needsWhatsAppConversion(u)).toBe(false))
})

test.describe('toWhatsAppJpeg', () => {
  test('converts an AVIF buffer into a JPEG within size bounds', async () => {
    // Build a 2000x2000 AVIF in-memory, then convert it.
    const avif = await sharp({ create: { width: 2000, height: 2000, channels: 3, background: { r: 10, g: 120, b: 200 } } })
      .avif({ quality: 50 })
      .toBuffer()

    const jpeg = await toWhatsAppJpeg(avif)
    const meta = await sharp(jpeg).metadata()

    expect(meta.format).toBe('jpeg')
    // Long edge downscaled to the WhatsApp cap.
    expect(Math.max(meta.width || 0, meta.height || 0)).toBeLessThanOrEqual(WA_MAX_DIMENSION)
    // Comfortably under WhatsApp's 5MB image limit.
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024)
  })

  test('flattens transparency (PNG with alpha) to JPEG', async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    const jpeg = await toWhatsAppJpeg(png)
    expect((await sharp(jpeg).metadata()).format).toBe('jpeg')
  })

  test('rejects an undecodable buffer', async () => {
    await expect(toWhatsAppJpeg(Buffer.from('not an image'))).rejects.toThrow()
  })
})
