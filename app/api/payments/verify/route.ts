export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

// Verifies the Razorpay payment signature, then credits wa_balance.
// CRITICAL: never trust a client-reported "success" — only a valid signature
// (HMAC of order_id|payment_id with key_secret) proves the payment is real.
export async function POST(request: NextRequest) {
  try {
    const { agent_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json()
    if (!agent_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
    }

    const access = await requireAgentAccess(agent_id)
    if ('error' in access) return access.error

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: 'Payments not configured' }, { status: 503 })

    // 1. Verify signature
    const expected = crypto.createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(String(razorpay_signature))
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b)
    if (!valid) return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })

    // 2. Fetch the order from Razorpay for the AUTHORITATIVE amount (don't trust client)
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const oRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
      headers: { Authorization: `Basic ${auth}` }
    })
    const order = await oRes.json()
    if (!oRes.ok) return NextResponse.json({ error: 'Could not confirm order' }, { status: 502 })
    if (order.status !== 'paid' && order.amount_paid < order.amount) {
      // Order not fully paid — be safe and reject
      return NextResponse.json({ error: 'Order not paid' }, { status: 400 })
    }
    const rupees = Math.round((order.amount || 0) / 100)

    // 3. Credit wa_balance
    const { data: agent } = await supabaseAdmin.from('agents').select('wa_balance').eq('id', agent_id).single()
    const current = Number((agent as any)?.wa_balance || 0)
    const newBal = current + rupees
    await supabaseAdmin.from('agents').update({ wa_balance: newBal }).eq('id', agent_id)

    // 4. Log the transaction (best-effort — don't fail the top-up if logging errors)
    let txnId: string | null = null
    try {
      const { data: txn } = await supabaseAdmin.from('wa_transactions').insert({
        agent_id,
        type: 'credit',
        amount: rupees,
        description: `WhatsApp balance top-up · Razorpay ${razorpay_payment_id}`,
        balance_after: newBal,
      }).select('id').single()
      txnId = txn?.id || null
    } catch { /* table/columns may differ — ignore */ }

    // 5. Email the user a receipt copy (best-effort).
    try {
      const { data: agent } = await supabaseAdmin.from('agents').select('name, email').eq('id', agent_id).single()
      if (agent?.email) {
        const { sendEmail } = await import('@/lib/email')
        const receiptUrl = txnId ? `https://convorian.in/api/subscription/receipt?agent_id=${agent_id}&txn_id=${txnId}` : 'https://convorian.in'
        await sendEmail({
          to: agent.email,
          subject: `Payment receipt — ₹${rupees} added to your Convorian credits`,
          html: `<p>Hi ${agent.name || 'there'},</p><p>We've received your payment of <strong>₹${rupees}</strong>. It has been added to your messaging credits (new balance: ₹${newBal}).</p><p><a href="${receiptUrl}">View / download your receipt →</a></p><p>— Team Convorian</p>`,
        })
      }
    } catch (mailErr: any) {
      console.error('Top-up receipt email failed (non-critical):', mailErr?.message)
    }

    return NextResponse.json({ success: true, wa_balance: newBal })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
