// ─── Property media helpers (pure, testable) ─────────────────────────────────
// Property photos are stored in `properties.features` as strings prefixed
// "media:<url>" (same convention the engine prompt reads to show "MEDIA
// AVAILABLE"). These helpers extract sendable image URLs and detect when a lead
// is asking for photos, so the webhook can actually send the images Convorian
// holds for that property.

// Extract sendable image URLs for a property (http/https only).
export function extractPropertyMedia(property: any): string[] {
  const feats: any[] = Array.isArray(property?.features) ? property.features : []
  return feats
    .filter((f) => typeof f === 'string' && f.startsWith('media:'))
    .map((f: string) => f.slice(6).trim())
    .filter((url) => /^https?:\/\//i.test(url))
}

// Detect a request for PHOTOS/IMAGES specifically (not floor plans/brochures,
// which the bot still cannot send). EN + romanized & Devanagari Hindi/Marathi.
const PHOTO_PATTERNS: RegExp[] = [
  /\b(photo|photos|pic|pics|picture|pictures|image|images|gallery|snap|snaps)\b/,
  /\b(tasveer|tasvir|tasviren|foto|fotos|photu)\b/,
  /(फोटो|फोटोज|तस्वीर|तस्वीरें|छायाचित्र|फोटू)/,
]

export function wantsPhotos(text: string): boolean {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return false
  return PHOTO_PATTERNS.some((r) => r.test(t))
}

// A safe per-message cap so we never flood the lead's WhatsApp.
export const MAX_IMAGES_PER_SEND = 4
