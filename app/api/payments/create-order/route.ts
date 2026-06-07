export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { requireAgentAccess } from '@/lib/apiAuth'

// Creates a Razorpay order server-side (keeps key_secret off the client).
export async function POST(request: NextRequest) {
  try {
    const { agent_id, amount } = await request.json()
    if (!agent_id || !amount) return NextResponse.json({ error: 'agent_id and amount required' }, { status: 400 })

    const access = await requireAgentAccess(agent_id)
    if ('error' in access) return access.error

    const amt = Math.round(Number(amount))
    if (!amt || amt <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) return NextResponse.json({ error: 'Payments are not configured yet. Please try again later.' }, { status: 503 })

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amt * 100, // paise
        currency: 'INR',
        receipt: `wa_${String(agent_id).slice(0, 8)}_${Date.now()}`,
        notes: { agent_id, purpose: 'wa_balance_topup' }
      })
    })
    const order = await res.json()
    if (!res.ok) return NextResponse.json({ error: order?.error?.description || 'Could not create payment order' }, { status: 502 })

    return NextResponse.json({ order, keyId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
