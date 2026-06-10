export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

// Returns the agent's subscription payment history (one row per successful
// charge) for the billing-history list in the dashboard. Each entry maps to a
// printable receipt via /api/subscription/receipt?agent_id=..&event_id=..
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  try {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    // A successful payment is any event that carries a payment id + amount.
    // (subscription.activated often fires alongside the first subscription.charged;
    // filtering on payment_id avoids both duplicates and non-payment lifecycle rows.)
    const { data, error } = await supabaseAdmin
      .from('subscription_events')
      .select('id, created_at, amount, payment_id')
      .eq('agent_id', agentId)
      .not('payment_id', 'is', null)
      .order('created_at', { ascending: false })
    if (error) throw error

    // De-duplicate by payment_id (a single charge can surface in >1 event).
    const seen = new Set<string>()
    const invoices = (data || []).filter(row => {
      if (!row.payment_id || seen.has(row.payment_id)) return false
      seen.add(row.payment_id)
      return true
    }).map(row => ({
      id: row.id,
      date: row.created_at,
      amount: row.amount != null ? Number(row.amount) : 999,
      payment_id: row.payment_id
    }))

    return NextResponse.json({ invoices })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
