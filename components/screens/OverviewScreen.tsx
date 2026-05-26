'use client'
import { useEffect, useState } from 'react'
import { Screen } from '@/app/dashboard/page'

interface Props { agentId: string; onNavigate: (s: Screen) => void }

export default function OverviewScreen({ agentId, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/analytics?agent_id=${agentId}`)
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
  }, [agentId])

  const s = stats || {}

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total leads" value={s.totalLeads ?? 47} change="+12 this week" color="#2E8B5F" />
        <MetricCard label="Hot leads" value={s.hotLeads ?? 12} change="+3 today" color="#C0392B" />
        <MetricCard label="Site visits booked" value={s.visitsBooked ?? 8} change="+2 this week" color="#1A5FA5" />
        <MetricCard label="Bot handled" value={`${s.botHandled ?? 94}%`} change="of all conversations" color="#B7770D" />
      </div>

      {/* Two col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>Recent hot leads</div>
          {[
            { name: 'Rahul Kumar', prop: '3BHK · Baner · ₹90L', score: '9/10', scoreColor: '#C0392B', time: '2m ago', av: 'RK', bg: '#FDF0F0', c: '#8B1A1A' },
            { name: 'Anita Desai', prop: '4BHK · Koregaon Park · ₹2.2Cr', score: '9/10', scoreColor: '#C0392B', time: '1h ago', av: 'AD', bg: '#EEF4FC', c: '#0F3D6E' },
            { name: 'Priya Sharma', prop: '2BHK · Wakad · ₹65L', score: '8/10', scoreColor: '#B7770D', time: '18m ago', av: 'PS', bg: '#FEF9E7', c: '#7A5200' },
            { name: 'Deepak Rao', prop: '3BHK · Aundh · ₹1.1Cr', score: '7/10', scoreColor: '#B7770D', time: '5h ago', av: 'DR', bg: '#EEEDFE', c: '#3C3489' },
          ].map((lead, i) => (
            <div key={i} onClick={() => onNavigate('inbox')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(26,25,22,0.06)' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: lead.bg, color: lead.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{lead.av}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1916' }}>{lead.name}</div>
                <div style={{ fontSize: 11, color: '#9E9B92' }}>{lead.prop}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: lead.scoreColor }}>{lead.score}</div>
                <div style={{ fontSize: 10, color: '#C8C5BC' }}>{lead.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>Lead breakdown</div>
          <BarChart label="Hot" value={s.hotLeads ?? 12} max={50} color="#E74C3C" />
          <BarChart label="Warm" value={s.warmLeads ?? 21} max={50} color="#E9A530" />
          <BarChart label="Cold" value={s.coldLeads ?? 14} max={50} color="#3B82F6" />
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Message usage</div>
            <UsageBar label="Messages" used={s.messagesUsed ?? 3241} total={s.messagesLimit ?? 5000} color="#1A5FA5" />
            <UsageBar label="WA balance" used={158} total={500} color="#2E8B5F" prefix="₹" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, change, color }: any) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div style={{ fontSize: 11, color: '#9E9B92', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: '#1A1916', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9E9B92' }}>{change}</div>
    </div>
  )
}

function BarChart({ label, value, max, color }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: '#6B6860', width: 40 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: '#ECEAE0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, color: '#6B6860', width: 20, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function UsageBar({ label, used, total, color, prefix = '' }: any) {
  const pct = Math.min((used / total) * 100, 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#6B6860' }}>{label}</span>
        <span style={{ color: '#3D3B34', fontWeight: 500 }}>{prefix}{used.toLocaleString('en-IN')} / {prefix}{total.toLocaleString('en-IN')}</span>
      </div>
      <div style={{ height: 8, background: '#ECEAE0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
