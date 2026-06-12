export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

// Credit/usage history for the Balance screen — top-ups (payments/verify) and
// deductions (template sends) both land in wa_transactions.
export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agent_id') || ''
    if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const { data, error } = await supabaseAdmin
      .from('wa_transactions')
      .select('id, type, amount, description, balance_after, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ transactions: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
