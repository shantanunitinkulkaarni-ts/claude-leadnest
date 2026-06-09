export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'
import { razorpayConfigured, createCustomer, createSubscription } from '@/lib/razorpay'

// Creates a Razorpay subscription for the ₹999/mo plan and returns the
// subscription id for Checkout (where the agent authorises UPI Autopay).
export async function POST(request: NextRequest) {
  try {
    const { agent_id } = await request.json()
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const access = await requireAgentAccess(agent_id)
    if ('error' in access) return access.error

    if (!razorpayConfigured()) {
      return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 })
    }
    const planId = process.env.RAZORPAY_PLAN_ID
    if (!planId) {
      return NextResponse.json({ error: 'Subscription plan not configured. Please contact support.' }, { status: 503 })
    }

    // Load the agent for email/contact + any existing subscription.
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('email, name, phone, razorpay_customer_id, razorpay_subscription_id, plan_status')
      .eq('id', agent_id)
      .single()

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    // Already on an active subscription — don't create a duplicate.
    if (agent.razorpay_subscription_id && agent.plan_status === 'active') {
      return NextResponse.json({ error: 'You already have an active subscription.' }, { status: 409 })
    }

    // Reuse the Razorpay customer if we have one, else create it.
    let customerId = agent.razorpay_customer_id as string | null
    if (!customerId) {
      customerId = await createCustomer({
        name: agent.name || agent.email,
        email: agent.email,
        contact: agent.phone || undefined
      })
      await supabaseAdmin.from('agents').update({ razorpay_customer_id: customerId }).eq('id', agent_id)
    }

    const subscription = await createSubscription({
      planId,
      customerId: customerId || undefined,
      notes: { agent_id: String(agent_id) }
    })

    // Persist the subscription id + pending status. Activation is confirmed by webhook.
    await supabaseAdmin
      .from('agents')
      .update({ razorpay_subscription_id: subscription.id, plan_status: 'pending' })
      .eq('id', agent_id)

    return NextResponse.json({
      subscription_id: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      short_url: subscription.short_url || null
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
