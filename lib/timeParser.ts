// lib/timeParser.ts
// Pure time/date parsing functions extracted from ai-bot.ts.
// All functions are deterministic and have no side effects.
// Supports Indian time expressions (IST), Hindi/Marathi time words,
// and common Indian date formats (dd-mm, "kal", "kal subah", etc.)

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // India is UTC+5:30

// ─── IST Formatting ──────────────────────────────────────────────────────────

// Human-friendly India-time label, e.g. "Mon, 23 Jun, 03:00 PM". Always renders
// in IST regardless of the server timezone, so the bot and emails agree.
export function formatIST(isoTime: string): string {
  try {
    return new Date(isoTime).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return isoTime
  }
}

// The IST hour (0-23) of a visit time built by parseTimeString (always +05:30).
export function visitHourIST(isoTime: string): number {
  const m = (isoTime || '').match(/T(\d{2}):/)
  return m ? parseInt(m[1]) : -1
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
  try {
    return new Date(isoTime).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })
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

  // Replace Hindi time words with English equivalents
  for (const [hindi, english] of Object.entries(HINDI_TIME_WORDS)) {
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${hindi}\\b`, 'gi')
    if (regex.test(t)) {
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

  // Work entirely in IST. The server runs on UTC, so we shift "now" by +5:30
  // and read the UTC fields — that gives us today's date AS IT IS IN INDIA,
  // which is what "today"/"tomorrow" must be relative to.
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  let year = istNow.getUTCFullYear()
  let month = istNow.getUTCMonth() // 0-based
  let day = istNow.getUTCDate()

  if (t.includes('tomorrow') || t.includes('next day')) {
    day += 1
  } else if (t.match(/today|this\s+morning|this\s+afternoon/)) {
    // keep today's IST date
  } else if (t.match(/day\s+after\s+tomorrow|in\s+2\s+days?/)) {
    day += 2
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