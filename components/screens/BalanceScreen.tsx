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
  const [showRazorpay, setShowRazorpay] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)

  useEffect(() => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setBalance(d.data.wa_balance || 0)
        }
      })
  }, [agentId])

  const handleTopup = (amountStr: string | number) => {
    const amount = typeof amountStr === 'string' ? parseInt(amountStr.replace(/[^0-9]/g, ''), 10) : amountStr
    if (isNaN(amount) || amount <= 0) return

    setPendingAmount(amount)
    setShowRazorpay(true)
  }

  const completePayment = async () => {
    setIsToppingUp(true)
    setShowRazorpay(false)
    try {
      const current = balance || 0
      const amount = pendingAmount
      const res = await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_balance: current + amount })
      })
      const d = await res.json()
      if (d.data) {
        setBalance(d.data.wa_balance)
        alert(`Test mode: Successfully topped up ₹${amount}. New balance: ₹${d.data.wa_balance}`)
        onTopUp?.() // Refresh Sidebar balance
      }
    } catch(err) {
      console.error(err)
    } finally {
      setIsToppingUp(false)
    }
  }

  // Replaced mock transactions with empty state until billing history API is added
  const txns: any[] = []

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>WhatsApp balance</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Available balance</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 42, color: '#15161B', lineHeight: 1, margin: '4px 0' }}>
          ₹{balance !== null ? balance : '...'}
        </div>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Used for outbound template messages · Meta charges deducted automatically</div>
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

      {showRazorpay && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 360, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ background: '#02042B', padding: '24px 20px', color: '#fff', textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>Razorpay Test Environment</div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>Convorian Pvt Ltd</div>
              <div style={{ fontSize: 32, fontWeight: 500, marginTop: 16 }}>₹{pendingAmount}</div>
            </div>
            <div style={{ padding: 24 }}>
              <button 
                onClick={completePayment}
                style={{ width: '100%', padding: '14px 0', background: '#3399CC', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginBottom: 12 }}
              >
                Success (Simulate Payment)
              </button>
              <button 
                onClick={() => setShowRazorpay(false)}
                style={{ width: '100%', padding: '14px 0', background: '#fff', color: '#666', border: '1px solid #ccc', borderRadius: 6, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
