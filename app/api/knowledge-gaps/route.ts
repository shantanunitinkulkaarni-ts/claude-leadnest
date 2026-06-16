export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess, requireKnowledgeGapAccess } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  const { data, error } = await supabaseAdmin
    .from('knowledge_gaps')
    .select('id, lead_id, question, bot_reply, answer, status, created_at, answered_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, answer, action } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const access = await requireKnowledgeGapAccess(id)
  if ('error' in access) return access.error

  const updates = action === 'dismiss'
    ? { status: 'dismissed' }
    : { status: 'answered', answer: (answer || '').trim(), answered_at: new Date().toISOString() }

  if (action !== 'dismiss' && !updates.answer) {
    return NextResponse.json({ error: 'answer required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('knowledge_gaps')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
