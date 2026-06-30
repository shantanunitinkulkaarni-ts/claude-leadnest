// lib/translate.ts
// Provider-agnostic translation so the bot can REASON in English (where the LLM is
// strong) and SPEAK the lead's own language. Google Cloud Translation now; switch
// to Sarvam later by setting TRANSLATION_PROVIDER=sarvam — callers don't change.
//
// Best-effort by design: any failure returns the original text so a reply is never
// blocked by the translator being down.

// Major Indian languages we support speaking. code → English name (for prompts/logs).
export const INDIAN_LANGUAGES: Record<string, string> = {
  hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
  ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia',
  ur: 'Urdu', as: 'Assamese',
}

// The LLM writes English + Hindi/Hinglish acceptably on its own — those skip the
// translator. Everything else (incl. Marathi, which the LLM mangles) is translated.
const NATIVE_OK = new Set(['en', 'hinglish'])

export function needsTranslation(lang?: string | null): boolean {
  return !!lang && !NATIVE_OK.has(lang) && lang in INDIAN_LANGUAGES
}

// Translate `text` from `source` → `target` (BCP-47-ish codes: en, mr, ta, …).
export async function translateText(text: string, target: string, source = 'en'): Promise<string> {
  const t = (text || '').trim()
  if (!t || !target || target === source || NATIVE_OK.has(target)) return text
  const provider = process.env.TRANSLATION_PROVIDER || 'google'
  try {
    if (provider === 'sarvam') return await sarvamTranslate(text, target, source)
    return await googleTranslate(text, target, source)
  } catch (e: any) {
    console.error('[translate] failed, returning original:', e?.message)
    return text
  }
}

async function googleTranslate(text: string, target: string, source: string): Promise<string> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!key) { console.warn('[translate] GOOGLE_TRANSLATE_API_KEY not set'); return text }
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target, source, format: 'text' }),
  })
  const j: any = await res.json()
  if (j?.error) { console.error('[translate] google error:', JSON.stringify(j.error).slice(0, 200)); return text }
  return j?.data?.translations?.[0]?.translatedText || text
}

// Sarvam Mayura translate. Sarvam uses BCP-47 codes with an -IN suffix
// (mr-IN, ta-IN, en-IN; Odia is od-IN). Auto-detect source with "auto".
async function sarvamTranslate(text: string, target: string, source: string): Promise<string> {
  const key = process.env.SARVAM_API_KEY
  if (!key) { console.warn('[translate] SARVAM_API_KEY not set'); return text }
  const toSarvam = (c: string) => c === 'en' ? 'en-IN' : c === 'or' ? 'od-IN' : `${c}-IN`
  const res = await fetch('https://api.sarvam.ai/translate', {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, source_language_code: toSarvam(source), target_language_code: toSarvam(target) }),
  })
  const j: any = await res.json()
  if (j?.error) { console.error('[translate] sarvam error:', JSON.stringify(j.error).slice(0, 200)); return text }
  return j?.translated_text || text
}

// Script-based detection for major Indian languages written in their own script.
// Devanagari (hi/mr) is left to the existing detector; this covers the rest so the
// bot recognises a lead writing in Tamil/Telugu/Bengali/etc. Returns a code or null.
export function detectIndianScript(text: string): string | null {
  if (/[஀-௿]/.test(text)) return 'ta' // Tamil
  if (/[ఀ-౿]/.test(text)) return 'te' // Telugu
  if (/[ಀ-೿]/.test(text)) return 'kn' // Kannada
  if (/[ഀ-ൿ]/.test(text)) return 'ml' // Malayalam
  if (/[ঀ-৿]/.test(text)) return 'bn' // Bengali / Assamese
  if (/[઀-૿]/.test(text)) return 'gu' // Gujarati
  if (/[਀-੿]/.test(text)) return 'pa' // Gurmukhi (Punjabi)
  if (/[଀-୿]/.test(text)) return 'or' // Odia
  if (/[؀-ۿ]/.test(text)) return 'ur' // Arabic script (Urdu)
  return null
}
