export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyWebhookSignature } from '@/lib/razorpay'

// Razorpay subscription webhook. Configure in Razorpay Dashboard → Settings →
// Webhooks with URL https://convorian.in/api/razorpay-webhook and the events:
//   subscription.activated, subscription.charged, subscription.pending,
//   subscription.halted, subscription.cancelled, subscription.completed
// Set the webhook secret to match RAZORPAY_WEBHOOK_SECRET in Vercel.
//
// CRITICAL: we verify the signature over the RAW body before trusting anything.
export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (must be exact bytes).
  const raw = await request.text()
  const signature = request.headers.get('x-razorpay-signature')

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event: string = body?.event || ''
  const sub = body?.payload?.subscription?.entity
  const payment = body?.payload?.payment?.entity

  if (!sub?.id) {
    // Not a subscription event we care about — acknowledge so Razorpay stops retrying.
    return NextResponse.json({ status: 'ignored' })
  }

  // Find the agent: prefer the stored subscription id, fall back to notes.agent_id.
  let agentId: string | null = null
  const { data: bySub } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('razorpay_subscription_id', sub.id)
    .maybeSingle()
  agentId = bySub?.id || sub?.notes?.agent_id || null

  if (!agentId) {
    return NextResponse.json({ status: 'agent_not_found' })
  }

  // Compute "paid through" date from the subscription's current period end.
  const paidThrough = sub.current_end
    ? new Date(sub.current_end * 1000).toISOString()
    : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
  const nextCharge = sub.charge_at ? new Date(sub.charge_at * 1000).toISOString() : null

  const update: Record<string, any> = {}

  switch (event) {
    case 'subscription.activated':
      // Mandate authorised. The first charge usually fires alongside; mark active.
      update.plan_status = 'active'
      update.plan_started_at = new Date().toISOString()
      update.plan_expires_at = paidThrough
      update.subscription_charge_at = nextCharge
      break

    case 'subscription.charged':
      // A monthly payment succeeded — extend access to the new period end.
      update.plan_status = 'active'
      update.plan_expires_at = paidThrough
      update.subscription_charge_at = nextCharge
      break

    case 'subscription.pending':
      // A charge failed; Razorpay will retry. Keep access during the retry grace
      // window (access still bounded by plan_expires_at).
      update.subscription_charge_at = nextCharge
      break

    case 'subscription.halted':
      // Retries exhausted — payment is not coming. Pause the plan.
      update.plan_status = 'halted'
      break

    case 'subscription.cancelled':
    case 'subscription.completed':
      // Mark cancelled but DO NOT shorten plan_expires_at — the agent keeps
      // access through the period they already paid for.
      update.plan_status = 'cancelled'
      break

    default:
      // Unhandled event type — log and acknowledge.
      break
  }

  if (Object.keys(update).length > 0) {
    await supabaseAdmin.from('agents').update(update).eq('id', agentId)
  }

  // Best-effort audit log (ignore if table/columns differ).
  let chargeEventId: string | null = null
  try {
    const { data: evRow } = await supabaseAdmin.from('subscription_events').insert({
      agent_id: agentId,
      razorpay_subscription_id: sub.id,
      event,
      payment_id: payment?.id || null,
      amount: payment?.amount ? payment.amount / 100 : null,
      raw: body
    }).select('id').single()
    chargeEventId = evRow?.id || null
  } catch { /* logging is non-critical */ }

  // Email the agent their invoice copy on each successful monthly charge.
  if (event === 'subscription.charged' && chargeEventId) {
    try {
      const { data: agent } = await supabaseAdmin.from('agents').select('name, email').eq('id', agentId).single()
      if (agent?.email) {
        const amt = payment?.amount ? payment.amount / 100 : 999
        const { sendEmail } = await import('@/lib/email')
        const receiptUrl = `https://convorian.in/api/subscription/receipt?agent_id=${agentId}&event_id=${chargeEventId}`
        await sendEmail({
          to: agent.email,
          subject: `Payment receipt — ₹${amt} Convorian subscription`,
          html: `<p>Hi ${agent.name || 'there'},</p><p>Your monthly Convorian subscription payment of <strong>₹${amt}</strong> was successful. Thank you!</p><p><a href="${receiptUrl}">View / download your receipt →</a></p><p>— Team Convorian</p>`,
        })
      }
    } catch (mailErr: any) {
      console.error('Subscription receipt email failed (non-critical):', mailErr?.message)
    }
  }

  return NextResponse.json({ status: 'ok' })
}
