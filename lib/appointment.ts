import * as chrono from 'chrono-node'

// ─── Robust appointment-time resolution ──────────────────────────────────────
// The engine returns an `appointment_booked_time`, but free-tier LLMs are not
// reliable about format: sometimes a clean ISO, sometimes no timezone, sometimes
// natural language, sometimes garbage. The OLD webhook code fell back to
// `now + 24h` on any parse failure — which silently booked "tomorrow at the
// current time" (the 6:58 PM bug when a lead asked for 11:30). And it only tried
// the reply-text fallback when the time was ABSENT, not when present-but-invalid.
//
// This resolver:
//  • Treats every wall-clock time as IST. Leads always mean IST, and the engine
//    is instructed to output IST wall-clock — trusting a stray 'Z' would shift a
//    visit by 5.5h. So we extract Y-M-D-H-M and rebuild the instant as IST.
//  • Falls back from the LLM's structured time → natural language in the LLM
//    field → natural language in the reply text the lead actually saw.
//  • Validates the result is a real near-future time. NEVER fabricates one — if
//    nothing parses, returns ok:false so the caller asks the lead to confirm
//    instead of booking a wrong slot.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type ApptResolution =
  | { ok: true; iso: string; source: 'llm-iso' | 'chrono-llm' | 'chrono-reply' }
  | { ok: false; reason: string }

type Parts = { y: number; mo: number; d: number; h: number; mi: number } // mo = 1-based

// Build a UTC ISO string from IST wall-clock components.
function istWallToIso(p: Parts): string {
  const utcMs = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, 0) - IST_OFFSET_MS
  return new Date(utcMs).toISOString()
}

// Extract IST wall-clock components from an ISO-like string, IGNORING any tz
// offset (see header — leads mean IST and the engine outputs IST wall-clock).
function fromIsoLike(s: string): Parts | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/)
  if (!m) return null
  const p: Parts = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31 || p.h > 23 || p.mi > 59) return null
  return p
}

// IST wall-clock Y-M-D for "now" — timezone-independent (getUTC* on the shifted
// instant reads the IST wall clock regardless of the host machine's timezone).
function istNowYmd(nowMs: number): { y: number; mo: number; d: number } {
  const d = new Date(nowMs + IST_OFFSET_MS)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

// Parse natural language ("tomorrow at 11:30", "Saturday 5pm") as IST wall-clock.
// Requires an explicit hour — a date with no time must NOT be turned into a
// booking (avoids aggressive/garbage bookings).
//
// IMPORTANT: we pass chrono an explicit IST reference ({ instant, timezone: 330 })
// rather than a shifted Date. chrono interprets a bare Date in the HOST machine's
// local timezone, which made "tomorrow" land a day off on non-UTC machines. The
// timezone-aware reference makes resolution identical everywhere (Vercel UTC,
// CI UTC, a dev's IST laptop) — this is correctness we can't leave to chance.
function fromNaturalLanguage(text: string, nowMs: number): Parts | null {
  let results: any[]
  try {
    results = chrono.parse(text, { instant: new Date(nowMs), timezone: 330 }, { forwardDate: true })
  } catch {
    return null
  }
  const now = istNowYmd(nowMs)
  for (const r of results) {
    const c = r.start
    if (!c.isCertain('hour')) continue // no explicit time → skip this match
    return {
      y: c.get('year') ?? now.y,
      mo: c.get('month') ?? now.mo,
      d: c.get('day') ?? now.d,
      h: c.get('hour') ?? 0,
      mi: c.get('minute') ?? 0,
    }
  }
  return null
}

export function resolveAppointmentTime(args: {
  llmTime?: string | null
  replyText?: string | null
  nowMs: number
}): ApptResolution {
  const { llmTime, replyText, nowMs } = args
  const candidates: Array<{ parts: Parts; source: 'llm-iso' | 'chrono-llm' | 'chrono-reply' }> = []

  if (llmTime && typeof llmTime === 'string') {
    const iso = fromIsoLike(llmTime)
    if (iso) candidates.push({ parts: iso, source: 'llm-iso' })
    else {
      const nl = fromNaturalLanguage(llmTime, nowMs)
      if (nl) candidates.push({ parts: nl, source: 'chrono-llm' })
    }
  }
  if (replyText && typeof replyText === 'string') {
    const nl = fromNaturalLanguage(replyText, nowMs)
    if (nl) candidates.push({ parts: nl, source: 'chrono-reply' })
  }

  for (const cand of candidates) {
    const iso = istWallToIso(cand.parts)
    const t = new Date(iso).getTime()
    if (isNaN(t)) continue
    if (t < nowMs - 5 * 60 * 1000) continue   // in the past (5-min grace)
    if (t > nowMs + 90 * DAY_MS) continue      // absurdly far out
    return { ok: true, iso, source: cand.source }
  }
  return {
    ok: false,
    reason: candidates.length ? 'time(s) parsed but failed sanity (past or >90d)' : 'no explicit time found',
  }
}

// Format a stored UTC ISO instant as an IST wall-clock string for agent-facing
// logs/UI (the instant is stored in UTC; humans here read IST).
export function formatIST(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}
