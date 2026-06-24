export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { requireAgentAccess } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabase'
import { exchangeCodeForToken, activateNumber } from '@/lib/metaOnboard'
import { createLogger } from '@/lib/logger'

// Completes Embedded Signup: the browser sends the code + the WABA/phone IDs the
// agent connected; we exchange the code for THEIR token, activate the number, and
// store the creds on their agent row. The bot is then live on their number.
export async function POST(request: NextRequest) {
  const { log } = createLogger('meta-onboard')
  const body = await request.json().catch(() => ({}))
  const { agentId, code, wabaId, phoneNumberId } = body || {}

  if (!agentId || !code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: 'Missing agentId, code, wabaId or phoneNumberId' }, { status: 400 })
  }

  // Only a logged-in member of this agent (or a superadmin) can connect its WhatsApp.
  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  // 1. Exchange the Embedded Signup code for the client's scoped business token.
  const ex = await exchangeCodeForToken(code)
  if (!ex.token) {
    log('token_exchange_failed', { agentId, error: ex.error })
    return NextResponse.json({ error: ex.error || 'Could not connect to Meta' }, { status: 400 })
  }

  // 2. Subscribe WABA, set India storage, register the number.
  const result = await activateNumber({ token: ex.token, phoneNumberId, wabaId })
  if (!result.ok) {
    log('activate_failed', { agentId, needsAction: result.needsAction, error: result.error })
    return NextResponse.json({ ok: false, needsAction: result.needsAction, error: result.error }, { status: 400 })
  }

  // 3. Store the creds on the agent — bot is now live on their number.
  const { error: dbErr } = await supabaseAdmin
    .from('agents')
    .update({
      wa_phone_number_id: phoneNumberId,
      wa_access_token: ex.token,
      wa_business_id: wabaId,
      wa_pin: result.pin,
      wa_verified: true,
    })
    .eq('id', agentId)

  if (dbErr) {
    log('store_failed', { agentId, error: dbErr.message })
    return NextResponse.json({ error: 'Connected to Meta but failed to save — please retry.' }, { status: 500 })
  }

  log('onboarded', { agentId, phoneNumberId, wabaId })
  return NextResponse.json({ ok: true })
}
