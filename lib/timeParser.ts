// lib/timeParser.ts
// Pure time/date parsing functions extracted from ai-bot.ts.
// All functions are deterministic and have no side effects.
// Supports Indian time expressions (IST), Hindi/Marathi time words,
// and common Indian date formats (dd-mm, "kal", "kal subah", etc.)

import { callLLM, type ChatMessage } from './llm'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // India is UTC+5:30

// ─── IST Formatting ──────────────────────────────────────────────────────────

// Human-friendly India-time label, e.g. "Mon, 23 Jun, 03:00 PM". Always renders
// in IST regardless of the server timezone, so the bot and emails agree.
export function formatIST(isoTime: string): string {
  const d = new Date(isoTime)
  if (isNaN(d.getTime())) return isoTime
  try {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoTime
  }
}

// The IST hour (0-23) of a visit time. Appointment times may be stored as UTC
// instants, so always convert through Date instead of reading the text hour.
export function visitHourIST(isoTime: string): number {
  const d = new Date(isoTime)
  if (isNaN(d.getTime())) return -1
  try {
    const hour = d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    })
    return parseInt(hour, 10)
  } catch {
    return -1
  }
}

// Parse an hours label like "09:00", "9:00 AM", "7 PM" → hour 0-23.
export function parseHourLabel(label: string): number | null {
  const m = (label || '').trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let h = parseInt(m[1])
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h
}

// Turn a stored label like "09:00" / "19:00" into human "9 AM" / "7 PM".
export function humanizeTimeLabel(label: string): string {
  const m = (label || '').trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return label
  let h = parseInt(m[1])
  const min = m[2] ? parseInt(m[2]) : 0
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return min ? `${h12}:${String(min).padStart(2, '0')} ${period}` : `${h12} ${period}`
}

// The IST weekday name ("Sunday") of a visit time.
export function visitWeekdayIST(isoTime: string): string {
  const d = new Date(isoTime)
  if (isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })
  } catch {
    return ''
  }
}

// If the requested visit is outside office hours OR on the agent's weekly day
// off, returns a friendly message asking for a better slot; otherwise null.
export function bookingTimeIssue(visitTime: string, agent: any): string | null {
  // Weekly day off (e.g. "Sunday") — only checked if the agent set one.
  if (agent.weekly_off) {
    const wd = visitWeekdayIST(visitTime)
    if (wd && wd.toLowerCase() === String(agent.weekly_off).toLowerCase()) {
      return `We're closed on ${agent.weekly_off}s. Could you pick another day? 😊`
    }
  }
  const holidayIssue = bookingHolidayIssue(visitTime, agent?.holidays)
  if (holidayIssue) return holidayIssue
  // Office hours.
  const openLabel = humanizeTimeLabel(agent.office_open || '09:00')
  const closeLabel = humanizeTimeLabel(agent.office_close || '19:00')
  const openH = parseHourLabel(agent.office_open || '09:00') ?? 9
  const closeH = parseHourLabel(agent.office_close || '19:00') ?? 19
  const h = visitHourIST(visitTime)
  if (h >= 0 && (h < openH || h >= closeH)) {
    return `Our site visits are between ${openLabel} and ${closeLabel}. Could you pick a time within those hours? 😊`
  }
  return null
}

function bookingHolidayIssue(visitTime: string, holidays?: string | null): string | null {
  const policy = String(holidays || '').trim()
  if (!policy) return null

  const date = new Date(visitTime)
  if (isNaN(date.getTime())) return null

  const istDate = date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parsedHolidayDates = parseHolidayDateHints(policy)
  if (parsedHolidayDates.some(h => h === istDate)) {
    return `We're closed on ${prettyHolidayDate(istDate)}. Could you pick another day? 😊`
  }

  if (/public holiday/i.test(policy) && isCommonIndianPublicHoliday(istDate)) {
    return `We're closed on public holidays. Could you pick another day? 😊`
  }

  return null
}

function parseHolidayDateHints(text: string): string[] {
  const values = new Set<string>()
  const input = String(text || '')

  const isoLike = input.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g) || []
  for (const token of isoLike) {
    const m = token.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!m) continue
    values.add(`${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`)
  }

  const slashLike = input.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?\b/g) || []
  for (const token of slashLike) {
    const m = token.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/)
    if (!m) continue
    const day = String(Number(m[1])).padStart(2, '0')
    const month = String(Number(m[2])).padStart(2, '0')
    const year = m[3] ? String(Number(m[3])) : ''
    if (year) values.add(`${year}-${month}-${day}`)
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  }
  const textTokens = input.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?\b/g) || []
  for (const token of textTokens) {
    const m = token.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?\b/)
    if (!m) continue
    const day = Number(m[1])
    const month = monthNames[m[2].slice(0, 3).toLowerCase()] || monthNames[m[2].toLowerCase()]
    const year = m[3] ? Number(m[3]) : null
    if (!month || !day) continue
    if (year) {
      values.add(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
  }

  return Array.from(values)
}

function prettyHolidayDate(istDate: string): string {
  const d = new Date(`${istDate}T00:00:00+05:30`)
  if (isNaN(d.getTime())) return istDate
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function isCommonIndianPublicHoliday(istDate: string): boolean {
  const mmdd = istDate.slice(5)
  return ['01-01', '01-26', '08-15', '10-02', '12-25'].includes(mmdd)
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())
}

// ─── Hindi / Indian Language Time Words ──────────────────────────────────────
// Maps common Hindi time words to their English equivalents for parsing.
const HINDI_TIME_WORDS: Record<string, string> = {
  'kal': 'tomorrow',
  'kal subah': 'tomorrow morning',
  'kal shaam': 'tomorrow evening',
  'kal raat': 'tomorrow night',
  'kal dopahar': 'tomorrow afternoon',
  'parson': 'day after tomorrow',
  'aaj': 'today',
  'aaj subah': 'today morning',
  'aaj shaam': 'today evening',
  'aaj raat': 'today night',
  'narson': 'day after day after tomorrow',
  'agale hafte': 'next week',
  'agle hafte': 'next week',
  'agale mahine': 'next month',
  'agle mahine': 'next month',
  'subah': 'morning',
  'shaam': 'evening',
  'dopahar': 'afternoon',
  'raat': 'night',
  'aadhi raat': 'midnight',
}

// Normalize common Hinglish/Hindi time phrases to English.
function normalizeHindiTimePhrases(text: string): string {
  let t = text.toLowerCase().trim()

  // Sort by key length DESCENDING so multi-word phrases replace first
  const sortedWords = Object.entries(HINDI_TIME_WORDS).sort((a, b) => b[0].length - a[0].length)
  // Replace Hindi time words with English equivalents
  for (const [hindi, english] of sortedWords) {
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${hindi}\\b`, 'gi')
        if (t.includes(hindi)) {
      t = t.replace(regex, english)
    }
  }

  // Handle "baje" (o'clock) — "3 baje" → "3 o'clock"
  t = t.replace(/(\d+)\s+baje\b/gi, '$1 o\'clock')

  // Handle "bajkar" (past the hour) — "3 bajkar 30" → "3:30"
  t = t.replace(/(\d+)\s+bajkar\s+(\d+)\b/gi, '$1:$2')

  // Handle "se" (from) and "tak" (until) — these are range indicators
  t = t.replace(/\bse\b/gi, '')
  t = t.replace(/\btak\b/gi, '')

  // Attach AM/PM to a bare o'clock hour when a time-of-day word is present,
  // so "5 o'clock evening" resolves to 5 PM instead of 05:00 (ambiguous).
  if (/\b(morning|subah)\b/i.test(t)) {
        t = t.replace(/(\d{1,2})\s*o'?clock\b(?!\s*(am|pm))/gi, "$1 AM")
  }
  // "midnight" forces AM regardless of hour — 12 o'clock midnight = 00:00.
  if (/\bmidnight\b/i.test(t)) {
    t = t.replace(/(\d{1,2})\s*o'?clock\b(?!\s*(am|pm))/gi, "$1 AM")
  } else
  if (/\b(evening|afternoon|night|shaam|dopahar|raat|midnight)\b/i.test(t)) {
        t = t.replace(/(\d{1,2})\s*o'?clock\b(?!\s*(am|pm))/gi, "$1 PM")
  }

  // Handle "saade" (half past) — "saade 3" → "3:30"
  t = t.replace(/saade\s+(\d+)\b/gi, (_, h) => `${parseInt(h)}:30`)

  // Handle "sava" (quarter past) — "sava 3" → "3:15"
  t = t.replace(/sava\s+(\d+)\b/gi, (_, h) => `${parseInt(h)}:15`)

  // Handle "paune" (quarter to) — "paune 3" → "2:45"
  t = t.replace(/paune\s+(\d+)\b/gi, (_, h) => {
    const hour = parseInt(h)
    const prevHour = hour === 1 ? 12 : hour - 1
    return `${prevHour}:45`
  })

  // Handle "dhai" (half past, lit. 2.5) — "dhai 3" → "3:30" (regional variant)
  t = t.replace(/dhai\s+(\d+)\b/gi, (_, h) => `${parseInt(h)}:30`)

  // Handle "pavne" (quarter to, regional variant)
  t = t.replace(/pavne\s+(\d+)\b/gi, (_, h) => {
    const hour = parseInt(h)
    const prevHour = hour === 1 ? 12 : hour - 1
    return `${prevHour}:45`
  })

  return t
}

// ─── Core Time String Parser ─────────────────────────────────────────────────

export function parseTimeString(timeStr: string): string | null {
  if (!timeStr) return null

  // First, normalize Hindi/Hinglish time phrases to English
  const normalized = normalizeHindiTimePhrases(timeStr)
  const t = normalized.toLowerCase().trim()

  // FIRST: if a full ISO-style date is present (e.g. "2026-06-22" or
  // "2026-06-22 11:00" or "2026-06-22T11:00"), read it exactly. This MUST run
  // before the loose patterns below — otherwise the "2026" year gets misread
  // (the old code grabbed "26" as the day, turning the 22nd into the 26th).
  const isoMatch = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s]+(\d{1,2}):(\d{2}))?/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1])
    const mo = parseInt(isoMatch[2]) - 1
    const d = parseInt(isoMatch[3])
    let h = isoMatch[4] != null ? parseInt(isoMatch[4]) : 11 // default 11 AM if no time given
    // If no HH:MM captured, try to read a bare hour with am/pm (e.g. "2026-06-22 3 pm")
    if (isoMatch[4] == null) {
      const bareHourAp = t.match(/\b(\d{1,2})\s*(am|pm)\b/i)
            if (bareHourAp) { h = parseInt(bareHourAp[1]) }
    }
    let mi = isoMatch[5] != null ? parseInt(isoMatch[5]) : 0
    // Honour an am/pm that may appear after the time (e.g. "2026-06-22 3 pm")
    const ap = t.match(/(am|pm)/)
    if (ap) {
      if (ap[1] === 'pm' && h < 12) h += 12
      if (ap[1] === 'am' && h === 12) h = 0
    }
    const cal = new Date(Date.UTC(y, mo, d))
    const yyyy = String(cal.getUTCFullYear())
    const mm = String(cal.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(cal.getUTCDate()).padStart(2, '0')
    const hh = String(h).padStart(2, '0')
    const min = String(mi).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`
  }

  // Extract time. Prefer an explicit am/pm time, then HH:MM, then a bare hour —
  // so a day-of-month number ("5th") is never mistaken for the hour.
  let hours = 0
  let mins = 0
  const ampmMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  const colonMatch = t.match(/\b(\d{1,2}):(\d{2})\b/)
  const bareMatch = t.match(/\b(\d{1,2})\s*o'?clock\b/i)
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1]); mins = ampmMatch[2] ? parseInt(ampmMatch[2]) : 0
    const ampm = ampmMatch[3].toLowerCase()
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
  } else if (colonMatch) {
    hours = parseInt(colonMatch[1]); mins = parseInt(colonMatch[2])
  } else if (bareMatch) {
    hours = parseInt(bareMatch[1])
  } else {
    return null // No usable time found — caller will ask again
  }

  // Indian convention: Hindi "baje" (o'clock) without a time-of-day word
  // implies daytime (PM) for hours 1-7. English "o'clock" stays ambiguous.
  if (!ampmMatch && /\bbaje|bajkar\b/i.test(timeStr) && hours >= 1 && hours <= 7) {
    hours += 12
  }

  // Work entirely in IST. The server runs on UTC, so we shift "now" by +5:30
  // and read the UTC fields — that gives us today's date AS IT IS IN INDIA,
  // which is what "today"/"tomorrow" must be relative to.
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  let year = istNow.getUTCFullYear()
  let month = istNow.getUTCMonth() // 0-based
  let day = istNow.getUTCDate()

  if (t.match(/day\s+after\s+tomorrow|in\s+2\s+days?/)) {
    day += 2
  } else if (t.includes('tomorrow') || t.includes('next day')) {
    day += 1
  } else if (t.match(/today|this\s+morning|this\s+afternoon/)) {
    // keep today's IST date
  } else if (t.match(/next\s+week/)) {
    day += 7
  } else if (t.match(/\b(\d{1,2})[-/](\d{1,2})\b/)) {
    // Explicit short date like "22-6" or "22/6" — assume dd-mm (common in India)
    const parts = t.match(/\b(\d{1,2})[-/](\d{1,2})\b/)
    if (parts) {
      day = parseInt(parts[1])
      month = parseInt(parts[2]) - 1
    }
  } else if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) {
    // Month-name date: "5 july", "5th july", "july 5". The day is the number NOT
    // followed by am/pm (so "1pm" isn't read as the day). If the date is already
    // past this year, assume next year.
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mName = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
    const dNum = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*[ap]\.?m)/i)
    if (mName && dNum) {
      month = months.indexOf(mName[1].toLowerCase())
      day = parseInt(dNum[1])
      const todayUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate())
      if (Date.UTC(year, month, day) < todayUtc) year += 1
    }
  }

  // Normalise (handles day/month roll-over like 31 + 1) using a UTC date as a
  // pure calendar calculator — no timezone shifting happens here.
  const cal = new Date(Date.UTC(year, month, day))
  year = cal.getUTCFullYear()
  month = cal.getUTCMonth()
  day = cal.getUTCDate()

  // Format as ISO8601 with IST timezone (+05:30) — the time the user intended.
  const yyyy = String(year)
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const hh = String(hours).padStart(2, '0')
  const min = String(mins).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`
}

// ─── Language Switch Detection ───────────────────────────────────────────────

// Detect an explicit request to switch chat language (e.g. "english please",
// "talk in hindi", "मराठीत बोला"). The LLM over-sticks to the stored language and
// refuses to switch, so we honor the request deterministically in code instead.
// AI-assisted time decoder. The AI only translates customer wording into the
// app's timestamp format. The app still validates and books the visit.
export type AITimeDecodeResult =
  | {
      ok: true
      iso: string
      language?: string
      originalText: string
      bookable?: boolean
      reason?: string | null
      property_id?: string | null
      property_name?: string | null
      property_status?: string | null
    }
  | {
      ok: false
      reason: string
      language?: string
      originalText: string
      bookable?: boolean
      property_id?: string | null
      property_name?: string | null
      property_status?: string | null
    }

function extractJsonObject(raw: string): any | null {
  const text = (raw || '').trim()
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function isISTIso(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+05:30$/.test(iso || '')
}

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi',
  marathi: 'Marathi',
  hinglish: 'Hinglish',
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
  or: 'Odia',
  ur: 'Urdu',
  as: 'Assamese',
}

function displayLanguageName(language?: string): string {
  const key = (language || '').trim().toLowerCase()
  return LANGUAGE_DISPLAY_NAMES[key] || (language || 'same as customer')
}

export async function decodeVisitTimeWithAI(
  customerText: string,
  deps: {
    llm?: typeof callLLM
    now?: Date
    bookingKnowledge?: string
  } = {}
): Promise<AITimeDecodeResult> {
  const originalText = customerText || ''
  if (!originalText.trim()) return { ok: false, reason: 'empty_text', originalText }

  const llm = deps.llm ?? callLLM
  const now = deps.now ?? new Date()
  const nowIST = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a tiny time decoder for an Indian real-estate appointment app. ' +
        'Decode the customer message into exactly one India time appointment. ' +
        'Understand Indian languages, Hinglish, and regional wording such as "kal 2 baje". ' +
        'Return ONLY JSON. No prose. Schema: {"ok":true,"iso":"YYYY-MM-DDTHH:mm:00+05:30","bookable":true,"reason":null,"language":"hi","property_id":"...","property_name":"...","property_status":"active"} or {"ok":false,"reason":"missing_time","bookable":false,"language":"hi"}. ' +
        'Use Asia/Kolkata / IST only. If date or time is missing or ambiguous, return ok:false.',
    },
    ...(deps.bookingKnowledge
      ? [{
          role: 'system' as const,
          content:
            'Current booking knowledge pack (treat it as source of truth for availability):\n' +
            deps.bookingKnowledge +
            '\n\nUse this pack to decide whether the slot is bookable. If the slot is outside office hours, on the weekly off, on a blocked holiday, or the selected property is unavailable, mark the request as not bookable and explain why in one short phrase.',
        }]
      : []),
    {
      role: 'user',
      content: `Current India time: ${nowIST}\nCustomer message: ${originalText}`,
    },
  ]

  try {
    const raw = await llm(messages, { maxTokens: 120, temperature: 0, deadlineMs: 10000 })
    const decoded = extractJsonObject(raw)
    const language = typeof decoded?.language === 'string' ? decoded.language : undefined
    if (decoded?.ok === true && typeof decoded.iso === 'string' && isISTIso(decoded.iso) && decoded?.bookable !== false) {
      return {
        ok: true,
        iso: decoded.iso,
        language,
        originalText,
        bookable: true,
        reason: typeof decoded?.reason === 'string' ? decoded.reason : null,
        property_id: typeof decoded?.property_id === 'string' ? decoded.property_id : null,
        property_name: typeof decoded?.property_name === 'string' ? decoded.property_name : null,
        property_status: typeof decoded?.property_status === 'string' ? decoded.property_status : null,
      }
    }
    return {
      ok: false,
      reason: typeof decoded?.reason === 'string' ? decoded.reason : 'invalid_ai_time',
      language,
      originalText,
      bookable: false,
      property_id: typeof decoded?.property_id === 'string' ? decoded.property_id : null,
      property_name: typeof decoded?.property_name === 'string' ? decoded.property_name : null,
      property_status: typeof decoded?.property_status === 'string' ? decoded.property_status : null,
    }
  } catch {
    return { ok: false, reason: 'ai_failed', originalText }
  }
}

export async function formatVisitConfirmationWithAI(
  args: {
    scheduledIso: string
    customerText?: string
    language?: string
    leadName?: string
    customerEmail?: string
  },
  deps: { llm?: typeof callLLM } = {}
): Promise<string> {
  const fallback = `Your site visit is scheduled for ${formatIST(args.scheduledIso)}.`
  if (!isISTIso(args.scheduledIso) && isNaN(new Date(args.scheduledIso).getTime())) return fallback

  const llm = deps.llm ?? callLLM
  const requestedLanguage = displayLanguageName(args.language)
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You write WhatsApp confirmations for Indian real-estate site visits. ' +
        'Always write a full natural sentence, never a fragment, never a bare time, and never echo the customer text by itself. ' +
        'If the requested language is Hindi, Marathi, Hinglish, Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati, Punjabi, Odia, Urdu, Assamese, or English, write the entire confirmation in that language. ' +
        'Mention only the confirmed date and time supplied by the app. ' +
        (args.customerEmail ? 'If the confirmation email is provided, mention that it has been sent or is on the way. ' : '') +
        (args.leadName ? 'If the customer name is provided, use it naturally once. ' : '') +
        'Do not invent property, agent, price, address, or promises. Keep it neat and under 35 words.',
    },
    {
      role: 'user',
      content:
        `Confirmed visit time in India: ${formatIST(args.scheduledIso)}\n` +
        `Requested language: ${requestedLanguage}\n` +
        `${args.leadName ? `Lead name: ${args.leadName}\n` : ''}` +
        `${args.customerEmail ? `Confirmation email: ${args.customerEmail}\n` : ''}` +
        `Customer message: ${args.customerText || ''}`,
    },
  ]

  try {
    const out = (await llm(messages, { maxTokens: 100, temperature: 0, deadlineMs: 10000 }) || '').trim()
    return out || fallback
  } catch {
    return fallback
  }
}

// Detect an explicit request to switch chat language. The LLM over-sticks to the
// stored language, so we honor clear switch requests deterministically in code.
export function detectLanguageSwitchRequest(text: string): string | null {
  const t = (text || '').toLowerCase()
  if (/\bhinglish\b/.test(t)) return 'hinglish'
  if (/\b(english|englsih|inglish|angre[zj]i)\b/.test(t)) return 'en'
  if (/\bmarathi\b/.test(t) || /मराठी/.test(text)) return 'mr'
  if (/\bhindi\b/.test(t) || /हिंदी|हिन्दी/.test(text)) return 'hi'
  if (/\btamil\b/.test(t)) return 'ta'
  if (/\btelugu\b/.test(t)) return 'te'
  if (/\bkannada\b/.test(t)) return 'kn'
  if (/\bmalayalam\b/.test(t)) return 'ml'
  if (/\bbengali\b|\bbangla\b/.test(t)) return 'bn'
  if (/\bgujarati\b/.test(t)) return 'gu'
  if (/\bpunjabi\b|\bpanjabi\b/.test(t)) return 'pa'
  if (/\b(odia|oriya)\b/.test(t)) return 'or'
  if (/\burdu\b/.test(t)) return 'ur'
  if (/\bassamese\b/.test(t)) return 'as'
  return null
}
