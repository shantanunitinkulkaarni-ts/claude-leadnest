// lib/botGuards.ts
// ─────────────────────────────────────────────────────────────────────────────
// TROLL KIT — abuse guards that run BEFORE the LLM call, so a spammer/troll
// can never run up message or token cost. Each guard is cheap (a count or a
// string check). If any guard trips, the bot sends a fixed reply and skips the
// expensive AI call entirely.
//
// Philosophy: be lenient with real customers (limits are generous), hard-stop
// only clear abuse. When we hard-stop, we hand the lead to a human rather than
// just going silent.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from './supabase'

export type GuardResult = {
  halt: boolean          // true = stop here, do NOT call the LLM
  reply?: string         // message to send the customer
  reason?: string        // internal label (logging / agent alert)
  notifyAgent?: boolean  // true = email the agent to take over
}

// Generous limits — a genuine customer won't hit these in normal use.
const PER_MINUTE_LIMIT = 12   // inbound messages in 60s → flooding
const PER_DAY_LIMIT = 80      // inbound messages in 24h → troll/abuse
const LOOP_REPEAT = 4         // identical message this many times → stuck loop
const MAX_LEN = 1500          // single message longer than this → junk/paste-bomb

const PASS: GuardResult = { halt: false }

// Cheap gibberish check: almost no letters but lots of characters, or the same
// character/emoji hammered over and over ("aaaaaaaa", "!!!!!!!!").
function looksLikeGibberish(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) return false // short msgs are fine ("hi", "ok", "2bhk")
  const letters = (t.match(/[a-zऀ-ॿ]/gi) || []).length // latin + devanagari
  const letterRatio = letters / t.length
  if (letterRatio < 0.2) return true // mostly symbols/numbers noise
  // one character repeated for most of the message
  const longRun = /(.)\1{9,}/.test(t)
  return longRun
}

/**
 * Run all abuse guards. Returns the first one that trips, else { halt:false }.
 * `history` is the lead's chat history INCLUDING the current inbound message.
 */
export async function checkAbuseGuards(
  leadId: string,
  message: string,
  history: { role: string; text: string }[]
): Promise<GuardResult> {
  const norm = (message || '').trim().toLowerCase()

  // 1. Empty / oversized / gibberish — don't waste an LLM call on junk.
  if (!norm) {
    return { halt: true, reply: "Sorry, I didn't catch that 🙏 Could you type your question?", reason: 'empty_message' }
  }
  if (message.length > MAX_LEN) {
    return { halt: true, reply: "That message is a bit long for me to read 😅 Could you sum it up in a line or two?", reason: 'too_long' }
  }
  if (looksLikeGibberish(message)) {
    return { halt: true, reply: "I want to help, but I couldn't make sense of that. Could you rephrase it for me? 🙏", reason: 'gibberish' }
  }

  // 2. Loop detector — same message sent over and over.
  const recentUser = history.filter(h => h.role === 'user').slice(-LOOP_REPEAT).map(h => h.text.trim().toLowerCase())
  if (recentUser.length >= LOOP_REPEAT && recentUser.every(t => t === norm)) {
    return {
      halt: true,
      reply: "It looks like we're going in circles 🙏 Let me have someone from our team reach out to help you directly.",
      reason: 'message_loop',
      notifyAgent: true,
    }
  }

  // 3. Rate caps — count this lead's inbound messages in the last 24h.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: inboundMsgs } = await supabaseAdmin
    .from('messages')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .gte('created_at', since24h)

  const inbound = inboundMsgs || []
  const oneMinAgo = Date.now() - 60 * 1000
  const lastMinute = inbound.filter(m => new Date(m.created_at).getTime() > oneMinAgo).length

  if (lastMinute >= PER_MINUTE_LIMIT) {
    return { halt: true, reply: "You're messaging faster than I can keep up 🙏 Give me a moment and send your question again.", reason: 'rate_per_minute' }
  }
  if (inbound.length >= PER_DAY_LIMIT) {
    return {
      halt: true,
      reply: "We've chatted a lot today! To give you the best help from here, our team will personally follow up with you. 🙏",
      reason: 'rate_per_day',
      notifyAgent: true,
    }
  }

  return PASS
}
