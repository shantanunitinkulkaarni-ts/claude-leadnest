export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext, pickFields } from '@/lib/apiAuth'

// Server-side workspace creation. Replaces the old CLIENT-side inserts that
// relied on permissive RLS — under which any authenticated user could insert a
// team_members row for ANY agent_id and take over another agency's workspace
// (and self-insert an agents row). Here the agents + owner team_members rows are
// created with the service role, keyed to the VERIFIED logged-in user, so a user
// can only ever create + own their OWN workspace. Plan/limit fields are forced
// server-side so the client can't inflate them.
//
// Once this is live (onboarding posts here), the permissive client INSERT
// policies on team_members + agents must be dropped — see
// db/migrations/12_lock_workspace_creation.sql.

const AGENT_FIELDS = [
  'name', 'phone', 'agency_name', 'city', 'state', 'areas', 'property_types',
  'bot_tone', 'languages', 'office_open', 'office_close', 'weekly_off',
]

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error
  const userId = auth.user.id

  // Idempotent: if this user already owns a workspace, return it (handles
  // double-submits / retries without creating a duplicate agency).
  const { data: existing } = await supabaseAdmin
    .from('team_members').select('agent_id').eq('auth_user_id', userId).maybeSingle()
  if (existing?.agent_id) {
    const { data: agent } = await supabaseAdmin.from('agents').select('*').eq('id', existing.agent_id).single()
    return NextResponse.json({ agent, existed: true })
  }

  const body = await request.json().catch(() => ({}))
  const fields = pickFields(body, AGENT_FIELDS)
  const email = String(body.email || auth.user.email || '')
  const nowIso = new Date().toISOString()

  const { data: agent, error: agentErr } = await supabaseAdmin.from('agents').insert({
    ...fields,
    email,
    bot_active: true,
    // Free-forever defaults are SERVER-controlled (client can't inflate them).
    messages_used: 0,
    messages_limit: 500,
    plan: 'free',
    plan_status: 'free',
    plan_started_at: nowIso,
    consent_terms: true,
    consent_marketing: true,
    consent_at: nowIso,
  }).select().single()
  if (agentErr || !agent) {
    return NextResponse.json({ error: agentErr?.message || 'Could not create workspace' }, { status: 500 })
  }
  const agentId = (agent as any).id

  const { error: tmErr } = await supabaseAdmin.from('team_members').insert({
    agent_id: agentId,
    auth_user_id: userId,
    role: 'owner',
    name: String(fields.name || ''),
    email,
    phone: String(fields.phone || ''),
  })
  if (tmErr) {
    // Roll back the orphan agent so a retry starts clean.
    await supabaseAdmin.from('agents').delete().eq('id', agentId)
    return NextResponse.json({ error: tmErr.message }, { status: 500 })
  }

  return NextResponse.json({ agent })
}
