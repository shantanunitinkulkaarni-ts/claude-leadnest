export const dynamic = 'force-dynamic'

/**
 * PIN API — server-side PIN verification and setup.
 *
 * POST /api/agent/pin?id=<agentId>   → verify a PIN
 *   body: { pin: string }
 *   response: { ok: true } | { error: string, lockedUntil?: number }
 *
 * PUT  /api/agent/pin?id=<agentId>   → set / change PIN
 *   body: { currentPin: string, newPin: string }
 *   response: { ok: true } | { error: string }
 *
 * Security properties:
 *  - PIN hash stored in agents.pin_hash (scrypt, never plaintext)
 *  - Verification is always server-side — the client never evaluates the PIN
 *  - 5 failed attempts within a sliding window locks out for 60 s (in-process map,
 *    sufficient for a single-instance deployment; upgrade to Redis for multi-instance)
 *  - First-time agents with no pin_hash set: accept '1234', then prompt them to change it
 */

import { NextRequest, NextResponse } from 'next/server'
import { scrypt, timingSafeEqual, randomBytes } from 'crypto'
import { promisify } from 'util'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

const scryptAsync = promisify(scrypt)

// In-process rate-limit store: agentId → { count, windowStart }
const failMap = new Map<string, { count: number; windowStart: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000 // 1 minute

// ---------- helpers ----------

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const derived = (await scryptAsync(pin, salt, 32)) as Buffer
    const storedBuf = Buffer.from(hash, 'hex')
    if (derived.length !== storedBuf.length) return false
    return timingSafeEqual(derived, storedBuf)
  } catch {
    return false
  }
}

function checkRateLimit(agentId: string): { blocked: boolean; lockedUntil?: number } {
  const now = Date.now()
  const entry = failMap.get(agentId)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // Window expired or first attempt — reset
    failMap.set(agentId, { count: 0, windowStart: now })
    return { blocked: false }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const lockedUntil = entry.windowStart + WINDOW_MS
    if (now < lockedUntil) return { blocked: true, lockedUntil }
    // Window just expired — reset
    failMap.set(agentId, { count: 0, windowStart: now })
  }

  return { blocked: false }
}

function recordFailure(agentId: string) {
  const entry = failMap.get(agentId)
  if (entry) {
    entry.count++
  }
}

function clearFailures(agentId: string) {
  failMap.delete(agentId)
}

// ---------- POST — verify ----------

export async function POST(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  // Rate limit check
  const rl = checkRateLimit(agentId)
  if (rl.blocked) {
    const secsLeft = Math.ceil(((rl.lockedUntil ?? 0) - Date.now()) / 1000)
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${secsLeft} seconds.`, lockedUntil: rl.lockedUntil },
      { status: 429 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { pin } = body
  if (!pin || typeof pin !== 'string' || pin.length < 4) {
    return NextResponse.json({ error: 'PIN must be at least 4 characters' }, { status: 400 })
  }

  // Fetch stored hash
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('pin_hash')
    .eq('id', agentId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  let isValid: boolean

  if (!agent.pin_hash) {
    // No PIN set yet — accept the default '1234' and return a flag so the
    // frontend can prompt the user to set a real PIN.
    isValid = pin === '1234'
    if (isValid) {
      return NextResponse.json({ ok: true, mustSetPin: true })
    }
  } else {
    isValid = await verifyPin(pin, agent.pin_hash)
  }

  if (!isValid) {
    recordFailure(agentId)
    const entry = failMap.get(agentId)
    const remaining = MAX_ATTEMPTS - (entry?.count ?? 0)
    return NextResponse.json(
      { error: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` },
      { status: 401 }
    )
  }

  clearFailures(agentId)
  return NextResponse.json({ ok: true, mustSetPin: false })
}

// ---------- PUT — set / change PIN ----------

export async function PUT(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { currentPin, newPin } = body

  if (!newPin || typeof newPin !== 'string' || newPin.length < 4) {
    return NextResponse.json({ error: 'New PIN must be at least 4 characters' }, { status: 400 })
  }

  // Verify current PIN before allowing change
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('pin_hash')
    .eq('id', agentId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  let currentValid: boolean
  if (!agent.pin_hash) {
    // No PIN set — only allow setting via the default '1234'
    currentValid = currentPin === '1234'
  } else {
    currentValid = await verifyPin(currentPin, agent.pin_hash)
  }

  if (!currentValid) {
    return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 })
  }

  // Hash and store the new PIN
  const newHash = await hashPin(newPin)
  const { error: updateError } = await supabaseAdmin
    .from('agents')
    .update({ pin_hash: newHash })
    .eq('id', agentId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  clearFailures(agentId)
  return NextResponse.json({ ok: true })
}
