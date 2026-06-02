'use client'
import { useState, useEffect } from 'react'

export default function AnalyticsScreen({ agentId }: { agentId: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(console.error)
  }, [agentId])

  if (loading) {
    return <div style={{ padding: '24px 28px', color: '#9E9B92', fontSize: 14 }}>Loading analytics...</div>
  }

  if (!data) return null

  const maxTemp = Math.max(data.hotLeads, data.warmLeads, data.coldLeads, 1) // prevent div by zero
  const maxPipeline = Math.max(data.totalLeads, 1)

  const topMetrics = [
    { label: 'Conversion rate', val: `${data.conversionRate}%`, sub: 'Leads → Closed Won' },
    { label: 'Bot handled', val: `${data.botHandled}%`, sub: 'Messages sent by AI' },
    { label: 'Visits booked', val: data.visitsBooked.toString(), sub: 'Total site visits' }
  ]

  const chartCards = [
    { 
      title: 'Lead Temperature', 
      bars: [
        { l: 'Hot', v: data.hotLeads, max: maxTemp, c: '#C0392B' }, 
        { l: 'Warm', v: data.warmLeads, max: maxTemp, c: '#B7770D' }, 
        { l: 'Cold', v: data.coldLeads, max: maxTemp, c: '#1A5FA5' }
      ] 
    },
    { 
      title: 'Pipeline Funnel', 
      bars: [
        { l: 'Total Leads', v: data.totalLeads, max: maxPipeline, c: '#1A1916' }, 
        { l: 'Visits Booked', v: data.visitsBooked, max: maxPipeline, c: '#2E8B5F' },
        { l: 'Closed Won', v: data.closedWon, max: maxPipeline, c: '#1A5FA5' }
      ] 
    },
  ]

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>Analytics</div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {topMetrics.map((m, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#9E9B92', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#1A1916', lineHeight: 1, marginBottom: 4 }}>{m.val}</div>
            <div style={{ fontSize: 11, color: '#9E9B92' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {chartCards.map((card, ci) => (
          <div key={ci} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>{card.title}</div>
            {card.bars.map((b, bi) => (
              <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#6B6860', width: 85 }}>{b.l}</span>
                <div style={{ flex: 1, height: 7, background: '#ECEAE0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(b.v / b.max) * 100}%`, background: b.c, borderRadius: 4, transition: 'width 0.5s ease-out' }} />
                </div>
                <span style={{ fontSize: 11, color: '#6B6860', width: 25, textAlign: 'right', fontWeight: 500 }}>{b.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
