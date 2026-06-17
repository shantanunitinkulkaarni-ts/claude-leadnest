// ─── Property media helpers (pure, testable) ─────────────────────────────────
// Property photos live in `properties.property_media` (text[] of bare URLs).
// Legacy: the old `features` array used "media:<url>" prefixed entries.
// extractPropertyMedia reads the new column first and falls back to parsing
// features so the bot continues to work on rows not yet migrated.

export function extractPropertyMedia(property: any): string[] {
  // New path: property_media is a clean URL array (Phase 0F migration)
  const mediaCol: any[] = Array.isArray(property?.property_media) ? property.property_media : []
  if (mediaCol.length > 0) {
    return mediaCol
      .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
  }
  // Legacy fallback: parse media: prefixed entries from features
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
  /\b(dikhao|dikha do|bhejo|bhej do|share karo|send karo)\b/,
]

export function wantsPhotos(text: string): boolean {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return false
  return PHOTO_PATTERNS.some((r) => r.test(t))
}

// Detect when the BOT's reply promises to send photos — used as a backup
// trigger for photo sending even when the inbound message doesn't explicitly
// say "photos" (e.g. lead says "share" or "haan bhejo" in context).
const BOT_PHOTO_PROMISE: RegExp[] = [
  /\b(shar(e|ing)\s+(the\s+)?photos?|send(ing)?\s+(the\s+)?photos?|photos?\s*bhej)/i,
  /\b(sharing\s+(the\s+)?images?|sending\s+(the\s+)?images?)/i,
  /(फोटो.*भेज|तस्वीर.*भेज|photos?\s+(should\s+be\s+)?arriv)/i,
]

export function botPromisedPhotos(replyText: string): boolean {
  const t = (replyText || '').toLowerCase()
  if (!t.trim()) return false
  return BOT_PHOTO_PROMISE.some((r) => r.test(t))
}

// A safe per-message cap so we never flood the lead's WhatsApp.
export const MAX_IMAGES_PER_SEND = 4
