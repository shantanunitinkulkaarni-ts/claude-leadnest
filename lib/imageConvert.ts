import sharp from 'sharp'

// ─── WhatsApp-safe image conversion (shared by upload + backfill) ─────────────
// WhatsApp/Meta only deliver JPEG/PNG images and silently drop others (AVIF,
// HEIC, TIFF…) even when WhatsApp returns "success" — this was why property photos
// never arrived. Re-encode every image to a small JPEG so it always delivers.

export const WA_MAX_DIMENSION = 1600 // long-edge cap; plenty sharp on a phone
export const WA_JPEG_QUALITY = 82    // keeps converted JPEGs well under WhatsApp's 5MB

// Convert any decodable image buffer into a WhatsApp-deliverable JPEG:
// auto-rotate (EXIF), downscale to fit, flatten alpha onto white, encode JPEG.
// Throws if the buffer can't be decoded so callers can return a clear error.
export async function toWhatsAppJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: WA_MAX_DIMENSION, height: WA_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: WA_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
}

// True when a stored media URL is NOT already a safe JPEG and should be
// converted (covers avif/webp/heic/png/gif/tiff and extension-less URLs).
export function needsWhatsAppConversion(url: string): boolean {
  const u = (url || '').toLowerCase().split('?')[0]
  return !/\.(jpe?g)$/.test(u)
}
