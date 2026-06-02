'use client'
import { useState, useEffect } from 'react'

interface Props {
  agentId: string
}

export default function BalanceScreen({ agentId }: Props) {
  const [balance, setBalance] = useState<number | null>(null)
  const [isToppingUp, setIsToppingUp] = useState(false)

  useEffect(() => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setBalance(d.data.wa_balance || 0)
        }
      })
  }, [agentId])

  const handleTopup = async (amountStr: string) => {
    const amount = parseInt(amountStr.replace(/[^0-9]/g, ''), 10)
    if (isNaN(amount)) return

    setIsToppingUp(true)
    try {
      const current = balance || 0
      const res = await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_balance: current + amount })
      })
      const d = await res.json()
      if (d.data) {
        setBalance(d.data.wa_balance)
        alert(`Test mode: Successfully topped up ₹${amount}. New balance: ₹${d.data.wa_balance}`)
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
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>WhatsApp balance</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Available balance</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 42, color: '#1A1916', lineHeight: 1, margin: '4px 0' }}>
          ₹{balance !== null ? balance : '...'}
        </div>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Used for outbound template messages · Meta charges deducted automatically</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 18 }}>
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
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Transaction history</div>
        {txns.length > 0 ? txns.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < txns.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none', fontSize: 12 }}>
            <span style={{ color: '#3D3B34' }}>{t.desc}</span>
            <span style={{ color: '#C8C5BC', fontSize: 11, margin: '0 12px' }}>{t.date}</span>
            <span style={{ fontWeight: 500, color: t.credit ? '#1A6B4A' : '#C0392B' }}>{t.amount}</span>
          </div>
        )) : (
          <div style={{ fontSize: 12, color: '#9E9B92', textAlign: 'center', padding: '20px 0' }}>No recent transactions.</div>
        )}
      </div>
    </div>
  )
}
