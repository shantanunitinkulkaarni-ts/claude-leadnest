import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'
import { hashAgentPin, verifyAgentPin } from '@/lib/agentPin'

type PinRequestLike = {
  nextUrl: URL
  json: () => Promise<any>
}

export type AgentPinRouteDeps = {
  requireAgentAccess: (agentId: string) => Promise<any>
  verifyAgentPin: (agentId: string, pin: string) => Promise<{ ok: boolean; mustSetPin?: boolean }>
  hashAgentPin: (pin: string) => string
  updateAgentPin: (agentId: string, pinHash: string) => Promise<{ error: any | null }>
}

function normalizePin(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function agentIdFromRequest(request: PinRequestLike) {
  return request.nextUrl.searchParams.get('id')
}

export const DEFAULT_AGENT_PIN_ROUTE_DEPS: AgentPinRouteDeps = {
  requireAgentAccess,
  verifyAgentPin,
  hashAgentPin,
  async updateAgentPin(agentId: string, pinHash: string) {
    const { error } = await supabaseAdmin
      .from('agents')
      .update({ pin_hash: pinHash })
      .eq('id', agentId)
    return { error }
  },
}

export async function handleVerifyPin(request: PinRequestLike, deps: AgentPinRouteDeps = DEFAULT_AGENT_PIN_ROUTE_DEPS) {
  const agentId = agentIdFromRequest(request)
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const access = await deps.requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const body = await request.json()
    const pin = normalizePin(body.pin ?? body.currentPin)
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

    const pinCheck = await deps.verifyAgentPin(agentId, pin)
    if (!pinCheck.ok) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })

    return NextResponse.json({ ok: true, mustSetPin: !!pinCheck.mustSetPin })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function handleSetPin(request: PinRequestLike, deps: AgentPinRouteDeps = DEFAULT_AGENT_PIN_ROUTE_DEPS) {
  const agentId = agentIdFromRequest(request)
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const access = await deps.requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const body = await request.json()
    const currentPin = normalizePin(body.currentPin ?? body.pin)
    const newPin = normalizePin(body.newPin)

    if (!currentPin) return NextResponse.json({ error: 'Current PIN required' }, { status: 400 })
    if (newPin.length < 4) return NextResponse.json({ error: 'New PIN must be at least 4 characters' }, { status: 400 })

    const pinCheck = await deps.verifyAgentPin(agentId, currentPin)
    if (!pinCheck.ok) return NextResponse.json({ error: 'Incorrect current PIN' }, { status: 403 })

    const { error } = await deps.updateAgentPin(agentId, deps.hashAgentPin(newPin))
    if (error) throw error
    return NextResponse.json({ ok: true, mustSetPin: false })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
