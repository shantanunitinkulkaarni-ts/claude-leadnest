import { timingSafeEqual, createHash } from 'crypto'
import { supabaseAdmin } from './supabase'

export type AgentPinCheck = {
  ok: boolean
  mustSetPin?: boolean
}

function safeEqualText(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function hashAgentPin(pin: string) {
  return `sha256$${createHash('sha256').update(pin).digest('hex')}`
}

export function verifyPinAgainstStoredHash(pin: string, pinHash: string | null | undefined): AgentPinCheck {
  if (!pinHash) return { ok: pin === '1234', mustSetPin: pin === '1234' }

  if (pinHash.startsWith('sha256$')) {
    const digest = createHash('sha256').update(pin).digest('hex')
    return { ok: safeEqualText(digest, pinHash.slice('sha256$'.length)) }
  }

  return { ok: safeEqualText(pin, pinHash) }
}

export async function verifyAgentPin(agentId: string, pin: string): Promise<AgentPinCheck> {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('pin_hash')
    .eq('id', agentId)
    .single()

  if (error || !data) return { ok: false }
  return verifyPinAgainstStoredHash(pin, data.pin_hash)
}
