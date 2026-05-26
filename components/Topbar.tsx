'use client'
import { Screen } from '@/app/dashboard/page'

const titles: Record<Screen, string> = {
  overview: 'Overview',
  inbox: 'Inbox',
  leads: 'Leads',
  properties: 'Properties',
  appointments: 'Appointments',
  analytics: 'Analytics',
  balance: 'WA Balance',
  settings: 'Settings'
}

export default function Topbar({ screen }: { screen: Screen }) {
  return (
    <div style={{
      background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)',
      height: 54, padding: '0 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>{titles[screen]}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F4F3EE', border: '1px solid rgba(26,25,22,0.13)', borderRadius: 8, padding: '0 12px', height: 34, width: 200 }}>
          <span style={{ fontSize: 13, color: '#9E9B92' }}>🔍</span>
          <input type="text" placeholder="Search leads..." style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1A1916', width: '100%', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <div style={{ width: 1, height: 20, background: 'rgba(26,25,22,0.18)', margin: '0 4px' }} />
        <button style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(26,25,22,0.13)', background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          🔔
          <div style={{ position: 'absolute', top: 6, right: 7, width: 5, height: 5, borderRadius: '50%', background: '#C0392B', border: '1.5px solid #fff' }} />
        </button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2E8B5F,#1A6B4A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#fff', cursor: 'pointer' }}>RS</div>
      </div>
    </div>
  )
}
