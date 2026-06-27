// -----------------------------------------------------------------------------
// Appointment confirmation loop
//
// The old flow booked the moment the LLM thought it heard a time: lead says
// "Saturday morning works", the bot resolves a time and saves it straight to
// `appointments` in the same turn. If the LLM misheard ("4 o'clock" as 4 AM)
// or the time resolver guessed wrong, the wrong slot was already live with no
// human in the loop.
//
// New flow: a freshly resolved time is staged on `leads.pending_appointment_time`
// (NOT written to `appointments`). The bot asks the lead to explicitly confirm.
// Only when the lead's NEXT message is a recognizable confirmation - checked
// here, deterministically, server-side - does the webhook promote the pending
// time into a real appointment row.
// -----------------------------------------------------------------------------

// 2-hour TTL. Vercel Hobby cron is capped at once/day (see CLAUDE.md), so this
// is NOT enforced by a cron sweep - it's checked lazily, at the moment a
// confirmation reply would otherwise be accepted. A stale pending time is
// just treated as if none exists; the lead has to re-state the time to get a
// fresh confirmation prompt. The (low-traffic) daily cron also clears stale
// rows for hygiene, but correctness never depends on that running promptly.
const PENDING_APPOINTMENT_TTL_MS = 2 * 60 * 60 * 1000

export function isPendingAppointmentExpired(pendingSetAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!pendingSetAt) return true
  const setMs = new Date(pendingSetAt).getTime()
  if (isNaN(setMs)) return true
  return nowMs - setMs > PENDING_APPOINTMENT_TTL_MS
}

// Matches a short, affirmative lead reply in English/Hindi/Marathi (Latin or
// Devanagari). Anchored to the START of the (trimmed, lowercased) message -
// this only fires when the message OPENS with an affirmative token, so "no,
// change it to Sunday" or "not sure, what else do you have" never match. The
// caller must ALSO gate this on a pending_appointment_time actually existing
// - a bare "ok"/"haan" said for an unrelated reason must never book a visit.
const CONFIRM_RE =
  /^\s*(yes+|yeah+|yep|yup|confirm(ed)?|acknowledg(?:e|ed)|ok(ay)?|sure|sounds good|works(?: for me)?|done|pakka|bilkul|haan|han|haan\s*ji|ji\s*haan|ji|theek\s*hai|thik\s*hai|theek|thik|sahi\s*hai|barobar|chalega|chalo|chala|ho|hoy)\b|^\s*(हाँ|हां|हो|होय|जी|ठीक\s*है|ठीक|बरोबर|बरं|चालेल|चला|चल)/i

export function isConfirmationReply(text: string): boolean {
  return CONFIRM_RE.test((text || '').trim())
}
