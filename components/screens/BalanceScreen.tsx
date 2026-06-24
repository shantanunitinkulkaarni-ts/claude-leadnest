'use client'
import { useState, useEffect } from 'react'

interface Props {
  agentId: string
  onTopUp?: () => void
}

export default function BalanceScreen({ agentId }: Props) {

  // Subscription state
  const [planStatus, setPlanStatus] = useState<string | null>(null)
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [nextChargeAt, setNextChargeAt] = useState<string | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [subBusy, setSubBusy] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [subMsg, setSubMsg] = useState<string | null>(null)

  // Billing history (subscription receipts)
  const [invoices, setInvoices] = useState<{ id: string; date: string; amount: number; payment_id: string }[]>([])

  const loadAgent = () => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setPlanStatus(d.data.plan_status || null)
          setPlanExpiresAt(d.data.plan_expires_at || null)
          setNextChargeAt(d.data.subscription_charge_at || null)
          setHasSubscription(!!d.data.razorpay_subscription_id)
        }
      })
  }

  const loadInvoices = () => {
    fetch('/api/subscription/invoices?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.invoices)) setInvoices(d.invoices) })
      .catch(() => {})
  }

  useEffect(() => { loadAgent(); loadInvoices() }, [agentId])

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

  // Credit/usage history (top-ups + template deductions) from wa_transactions
  const [txns, setTxns] = useState<{ id: string; type: string; amount: number; description: string; created_at: string }[]>([])
  const loadTxns = () => {
    fetch('/api/transactions?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.transactions)) setTxns(d.transactions) })
      .catch(() => {})
  }
  useEffect(() => { loadTxns() }, [agentId])

  // "Subscribed" requires a real Razorpay subscription on file — NOT just the
  // free/trial default of plan_status='active' that every new account starts with.
  const isActive = planStatus === 'active' && hasSubscription
  const isCancelled = planStatus === 'cancelled' && hasSubscription
  const isHalted = planStatus === 'halted'
  const isPending = planStatus === 'pending' && hasSubscription

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580 }}>
      {/* ── Plan selection (GPT-style cards) ───────────────── */}
      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>Choose your plan</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {/* Monthly — the only purchasable plan today */}
        <div style={{ position: 'relative', background: '#fff', border: '2px solid #4F46E5', borderRadius: 14, padding: '20px 18px' }}>
          <span style={{ position: 'absolute', top: -10, left: 16, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#4F46E5', color: '#fff', padding: '3px 10px', borderRadius: 20 }}>Current</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B' }}>Monthly</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#15161B', lineHeight: 1.1, marginTop: 6 }}>₹999<span style={{ fontSize: 13, color: '#9E9B92' }}>/mo</span></div>
          <div style={{ fontSize: 11.5, color: '#6B6860', marginTop: 8, lineHeight: 1.5 }}>Billed monthly · cancel anytime</div>
        </div>
        {/* Annual — coming soon, disabled */}
        <div style={{ position: 'relative', background: '#FAFAFB', border: '1px solid rgba(26,25,22,0.12)', borderRadius: 14, padding: '20px 18px', opacity: 0.72 }}>
          <span style={{ position: 'absolute', top: -10, left: 16, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#E8E5DF', color: '#6B6860', padding: '3px 10px', borderRadius: 20 }}>Coming soon</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B' }}>Annual <span style={{ fontSize: 10, fontWeight: 700, color: '#1B7A43', background: '#E7F6EC', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>SAVE 20%</span></div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#15161B', lineHeight: 1.1, marginTop: 6 }}>₹799<span style={{ fontSize: 13, color: '#9E9B92' }}>/mo</span></div>
          <div style={{ fontSize: 11.5, color: '#6B6860', marginTop: 8, lineHeight: 1.5 }}>Billed yearly · launching soon</div>
        </div>
      </div>

      {/* ── Subscription / Plan ─────────────────────────── */}
      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>Your plan</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Convorian Pro</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, color: '#15161B', lineHeight: 1 }}>₹999<span style={{ fontSize: 15, color: '#9E9B92' }}>/month</span></div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 4 }}>AI assistant · lead qualification · visit booking · 24/7 replies</div>
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

      {/* ── Billing history (subscription receipts) ──────── */}
      {invoices.length > 0 && (
        <>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>Billing history</div>
          <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '8px 20px', marginBottom: 28 }}>
            {invoices.map((inv, i) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < invoices.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#15161B', fontWeight: 500 }}>Convorian subscription</div>
                  <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 2 }}>{fmtDate(inv.date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#15161B' }}>₹{inv.amount.toLocaleString('en-IN')}</span>
                  <a
                    href={`/api/subscription/receipt?agent_id=${encodeURIComponent(agentId)}&event_id=${encodeURIComponent(inv.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 500, color: '#4F46E5', textDecoration: 'none', border: '1px solid rgba(79,70,229,0.3)', borderRadius: 7, padding: '6px 12px' }}
                  >
                    Receipt
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>WhatsApp messaging</div>
      <div data-tour="wa-topup" style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#3D3B34', lineHeight: 1.7 }}>
          Proactive WhatsApp messages — visit reminders, follow-ups and re-engagement templates — are billed <strong>directly by Meta</strong> to your own WhatsApp Business account. Convorian adds no markup and doesn’t hold your balance. Add a payment method and top up from your Meta account.
        </div>
        <a href="https://business.facebook.com/billing_hub/accounts" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 16, padding: '11px 20px', borderRadius: 9, background: '#4F46E5', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
          Recharge on Meta →
        </a>
        <div style={{ fontSize: 11.5, color: '#9E9B92', marginTop: 14 }}>Your ₹999/month Convorian subscription (above) is separate and billed by us.</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Transaction history</div>
        {txns.length > 0 ? txns.map((t, i) => {
          const isCredit = t.type === 'credit'
          return (
            <div key={t.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: i < txns.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none', fontSize: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#3D3B34', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCredit ? 'Credits added' : (t.description || 'Message charge')}</div>
                <div style={{ color: '#9E9B92', fontSize: 11, marginTop: 2 }}>{fmtDate(t.created_at)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
                {isCredit && (
                  <a href={`/api/subscription/receipt?agent_id=${encodeURIComponent(agentId)}&txn_id=${encodeURIComponent(t.id)}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 500, color: '#4F46E5', textDecoration: 'none', border: '1px solid rgba(79,70,229,0.3)', borderRadius: 6, padding: '4px 9px' }}>
                    Receipt
                  </a>
                )}
                <span style={{ fontWeight: 600, color: isCredit ? '#1B7A43' : '#3D3B34' }}>
                  {isCredit ? '+' : '−'}₹{Number(t.amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )
        }) : (
          <div style={{ fontSize: 12, color: '#9E9B92', textAlign: 'center', padding: '20px 0' }}>No transactions yet. Top-ups and message charges will appear here.</div>
        )}
      </div>

    </div>
  )
}
