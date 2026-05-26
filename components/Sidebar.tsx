'use client'

import { Screen } from '@/app/dashboard/page'

interface Props {
  activeScreen: Screen
  onNavigate: (s: Screen) => void
}

const navItems: { screen: Screen; label: string; icon: string; badge?: string }[] = [
  { screen: 'overview', label: 'Overview', icon: '▦' },
  { screen: 'inbox', label: 'Inbox', icon: '💬', badge: '4' },
  { screen: 'leads', label: 'Leads', icon: '👥' },
  { screen: 'properties', label: 'Properties', icon: '🏠' },
  { screen: 'appointments', label: 'Appointments', icon: '📅' },
  { screen: 'analytics', label: 'Analytics', icon: '📊' },
  { screen: 'balance', label: 'WA Balance', icon: '💳' },
  { screen: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ activeScreen, onNavigate }: Props) {
  return (
    <div style={{
      width: 220, minWidth: 220,
      background: '#1A1916',
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Glow effects */}
      <div style={{ position: 'absolute', width: 280, height: 280, background: 'radial-gradient(circle,rgba(46,139,95,0.16) 0%,transparent 70%)', top: -60, right: -100, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, background: 'radial-gradient(circle,rgba(184,149,90,0.10) 0%,transparent 70%)', bottom: 40, left: -60, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#2E8B5F,#1A6B4A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏠</div>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', letterSpacing: '-0.01em' }}>LeadNest</span>
          </div>
        </div>

        {/* Agent info */}
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2E8B5F,#1A6B4A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#fff', flexShrink: 0 }}>RS</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>Rajesh Sharma</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Rajesh Properties</div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(77,184,138,0.15)', border: '1px solid rgba(77,184,138,0.25)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DB88A' }} />
            <span style={{ fontSize: 10, color: '#4DB88A', fontWeight: 500 }}>Bot active</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase' }}>Main</div>
          {navItems.slice(0, 5).map(item => (
            <NavItem key={item.screen} item={item} active={activeScreen === item.screen} onClick={() => onNavigate(item.screen)} />
          ))}
          <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase', marginTop: 4 }}>Reports</div>
          <NavItem item={navItems[5]} active={activeScreen === 'analytics'} onClick={() => onNavigate('analytics')} />
          <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase', marginTop: 4 }}>Account</div>
          {navItems.slice(6).map(item => (
            <NavItem key={item.screen} item={item} active={activeScreen === item.screen} onClick={() => onNavigate(item.screen)} />
          ))}
        </div>

        {/* WA Balance */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>WA balance</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#fff' }}>₹342</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '68%', background: 'linear-gradient(90deg,#2E8B5F,#4DB88A)', borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItem({ item, active, onClick }: { item: any; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
      fontSize: 12, transition: 'all 0.15s',
      userSelect: 'none'
    }}>
      <span style={{ fontSize: 14 }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{ background: '#C0392B', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 500 }}>{item.badge}</span>
      )}
    </div>
  )
}
