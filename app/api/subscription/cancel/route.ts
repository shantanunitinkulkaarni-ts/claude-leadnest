export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'
import { razorpayConfigured, cancelSubscription } from '@/lib/razorpay'

// Cancels the agent's subscription at the end of the current cycle, so they
// keep access for the period they've already paid for. The final state
// ('cancelled') is confirmed by the webhook; we mark intent here too.
export async function POST(request: NextRequest) {
  try {
    const { agent_id } = await request.json()
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const access = await requireAgentAccess(agent_id)
    if ('error' in access) return access.error

    if (!razorpayConfigured()) {
      return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
    }

    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('razorpay_subscription_id')
      .eq('id', agent_id)
      .single()

    if (!agent?.razorpay_subscription_id) {
      return NextResponse.json({ error: 'No active subscription to cancel.' }, { status: 400 })
    }

    await cancelSubscription(agent.razorpay_subscription_id, true)

    return NextResponse.json({
      success: true,
      message: 'Your subscription will end after the current billing period. You keep access until then.'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
