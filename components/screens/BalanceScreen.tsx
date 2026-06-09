'use client'
import { useState, useEffect } from 'react'

interface Props {
  agentId: string
  onTopUp?: () => void
}

export default function BalanceScreen({ agentId, onTopUp }: Props) {
  const [balance, setBalance] = useState<number | null>(null)
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Subscription state
  const [planStatus, setPlanStatus] = useState<string | null>(null)
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [nextChargeAt, setNextChargeAt] = useState<string | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [subBusy, setSubBusy] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [subMsg, setSubMsg] = useState<string | null>(null)

  const loadAgent = () => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setBalance(d.data.wa_balance || 0)
          setPlanStatus(d.data.plan_status || null)
          setPlanExpiresAt(d.data.plan_expires_at || null)
          setNextChargeAt(d.data.subscription_charge_at || null)
          setHasSubscription(!!d.data.razorpay_subscription_id)
        }
      })
  }

  useEffect(() => { loadAgent() }, [agentId])

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '—' }
  }

  const handleSubscribe = async () => {
    setSubError(null); setSubMsg(null); setSubBusy(true)
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start subscription')

      const ok = await loadRazorpay()
      if (!ok) throw new Error('Could not load payment gateway. Check your connection.')

      const options = {
        key: data.keyId,
        subscription_id: data.subscription_id,
        name: 'Convorian',
        description: '₹999/month — Convorian AI assistant',
        theme: { color: '#4F46E5' },
        handler: async () => {
          // Activation is confirmed by webhook; refresh shortly after.
          setSubMsg('Subscription set up! Activating… this updates within a minute.')
          setTimeout(loadAgent, 4000)
          setSubBusy(false)
        },
        modal: { ondismiss: () => setSubBusy(false) }
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', (r: any) => { setSubError(r?.error?.description || 'Payment failed'); setSubBusy(false) })
      rzp.open()
    } catch (e: any) {
      setSubError(e.message || 'Something went wrong')
      setSubBusy(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? You keep access until the end of the current billing period.')) return
    setSubError(null); setSubMsg(null); setSubBusy(true)
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not cancel')
      setSubMsg(data.message || 'Subscription cancelled.')
      loadAgent()
    } catch (e: any) {
      setSubError(e.message || 'Something went wrong')
    } finally {
      setSubBusy(false)
    }
  }

  // Lazy-load the Razorpay Checkout script once
  const loadRazorpay = (): Promise<boolean> => new Promise(resolve => {
    if (typeof window === 'undefined') return resolve(false)
    if ((window as any).Razorpay) return resolve(true)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })

  const handleTopup = async (amountStr: string | number) => {
    const amount = typeof amountStr === 'string' ? parseInt(amountStr.replace(/[^0-9]/g, ''), 10) : amountStr
    if (isNaN(amount) || amount <= 0) return
    setError(null)
    setIsToppingUp(true)
    try {
      // 1. Create order server-side
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, amount })
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderData.error || 'Could not start payment')

      // 2. Load Razorpay Checkout
      const ok = await loadRazorpay()
      if (!ok) throw new Error('Could not load payment gateway. Check your connection.')

      // 3. Open Checkout
      const options = {
        key: orderData.keyId,
        order_id: orderData.order.id,
        amount: orderData.order.amount,
        currency: 'INR',
        name: 'Convorian',
        description: 'WhatsApp balance top-up',
        theme: { color: '#4F46E5' },
        handler: async (resp: any) => {
          // 4. Verify signature server-side, then credit balance
          try {
            const vRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent_id: agentId,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature
              })
            })
            const vData = await vRes.json()
            if (!vRes.ok) throw new Error(vData.error || 'Verification failed')
            setBalance(vData.wa_balance)
            onTopUp?.()
          } catch (e: any) {
            setError(e.message || 'Payment verification failed. If money was deducted, it will reflect shortly.')
          } finally {
            setIsToppingUp(false)
          }
        },
        modal: { ondismiss: () => setIsToppingUp(false) }
      }
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', (r: any) => { setError(r?.error?.description || 'Payment failed'); setIsToppingUp(false) })
      rzp.open()
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setIsToppingUp(false)
    }
  }

  // Replaced mock transactions with empty state until billing history API is added
  const txns: any[] = []

  // "Subscribed" requires a real Razorpay subscription on file — NOT just the
  // free/trial default of plan_status='active' that every new account starts with.
  const isActive = planStatus === 'active' && hasSubscription
  const isCancelled = planStatus === 'cancelled' && hasSubscription
  const isHalted = planStatus === 'halted'
  const isPending = planStatus === 'pending' && hasSubscription

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580 }}>
      {/* ── Subscription / Plan ─────────────────────────── */}
      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>Your plan</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, color: '#15161B', lineHeight: 1 }}>₹999<span style={{ fontSize: 15, color: '#9E9B92' }}>/month</span></div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 4 }}>Convorian AI WhatsApp assistant</div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.04em',
            background: isActive ? '#E7F6EC' : isHalted ? '#FDF0F0' : '#F4F3EE',
            color: isActive ? '#1B7A43' : isHalted ? '#C0392B' : '#6B6860'
          }}>
            {isActive ? 'Active' : isCancelled ? 'Cancelling' : isHalted ? 'Payment failed' : isPending ? 'Pending' : 'Not active'}
          </span>
        </div>

        {(isActive || isCancelled) && (
          <div style={{ fontSize: 13, color: '#3D3B34', marginTop: 16, lineHeight: 1.7 }}>
            {isCancelled
              ? <>Your plan ends on <strong>{fmtDate(planExpiresAt)}</strong>. You keep full access until then.</>
              : <>Next auto-payment: <strong>{fmtDate(nextChargeAt || planExpiresAt)}</strong> · paid through <strong>{fmtDate(planExpiresAt)}</strong></>}
          </div>
        )}

        {isHalted && (
          <div style={{ fontSize: 13, color: '#8B1A1A', marginTop: 14, background: '#FDF0F0', padding: '10px 14px', borderRadius: 8 }}>
            ⚠️ Your last payment couldn’t be collected and the bot is paused. Re-activate below to resume.
          </div>
        )}

        {subError && <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 14 }}>⚠️ {subError}</div>}
        {subMsg && <div style={{ background: '#EEF0FE', color: '#4338CA', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 14 }}>{subMsg}</div>}

        <div style={{ marginTop: 18 }}>
          {isActive ? (
            <button onClick={handleCancel} disabled={subBusy}
              style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid rgba(192,57,43,0.3)', background: '#fff', color: '#C0392B', cursor: subBusy ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: subBusy ? 0.6 : 1 }}>
              {subBusy ? 'Please wait…' : 'Cancel subscription'}
            </button>
          ) : (
            <button onClick={handleSubscribe} disabled={subBusy}
              style={{ padding: '12px 22px', borderRadius: 9, border: 'none', background: '#4F46E5', color: '#fff', cursor: subBusy ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: subBusy ? 0.6 : 1 }}>
              {subBusy ? 'Please wait…' : isHalted ? 'Re-activate plan — ₹999/mo' : 'Activate plan — ₹999/mo'}
            </button>
          )}
          {!isActive && !subBusy && (
            <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 10 }}>Auto-renews monthly via UPI Autopay. Cancel anytime.</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>WhatsApp balance</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Available balance</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 42, color: '#15161B', lineHeight: 1, margin: '4px 0' }}>
          ₹{balance !== null ? balance : '...'}
        </div>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Used for outbound template messages · Meta charges deducted automatically</div>
        {error && (
          <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 14 }}>⚠️ {error}</div>
        )}
        <div data-tour="wa-topup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 18 }}>
          {['+ ₹100', '+ ₹500', '+ ₹1000'].map(a => (
            <button 
              key={a} 
              onClick={() => handleTopup(a)}
              disabled={isToppingUp}
              style={{ 
                padding: 11, borderRadius: 9, border: '1px solid rgba(26,25,22,0.18)', 
                background: '#F4F3EE', cursor: isToppingUp ? 'default' : 'pointer', textAlign: 'center', 
                fontSize: 13, fontWeight: 500, color: '#3D3B34', fontFamily: 'inherit', transition: 'all 0.15s',
                opacity: isToppingUp ? 0.6 : 1
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input 
            type="number" 
            placeholder="Custom amount (₹)" 
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, outline: 'none' }}
          />
          <button 
            onClick={() => handleTopup(parseInt(customAmount, 10))}
            disabled={!customAmount || isToppingUp}
            style={{ 
              padding: '10px 16px', borderRadius: 8, background: '#1A5FA5', color: '#fff', border: 'none', 
              cursor: (!customAmount || isToppingUp) ? 'default' : 'pointer', fontSize: 13, fontWeight: 500, opacity: (!customAmount || isToppingUp) ? 0.6 : 1 
            }}
          >
            Add
          </button>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Transaction history</div>
        {txns.length > 0 ? txns.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < txns.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none', fontSize: 12 }}>
            <span style={{ color: '#3D3B34' }}>{t.desc}</span>
            <span style={{ color: '#C8C5BC', fontSize: 11, margin: '0 12px' }}>{t.date}</span>
            <span style={{ fontWeight: 500, color: t.credit ? '#4338CA' : '#C0392B' }}>{t.amount}</span>
          </div>
        )) : (
          <div style={{ fontSize: 12, color: '#9E9B92', textAlign: 'center', padding: '20px 0' }}>No recent transactions.</div>
        )}
      </div>

    </div>
  )
}
