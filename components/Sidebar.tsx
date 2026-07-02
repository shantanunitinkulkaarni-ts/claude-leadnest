'use client'
import { useState, useEffect } from 'react'
import { Screen } from '@/app/dashboard/page'

interface Props {
  activeScreen: Screen
  onNavigate: (s: Screen) => void
  agent: any
  isOpen?: boolean
  onClose?: () => void
}

const navItems: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'overview', label: 'Overview', icon: '□' },
  { screen: 'inbox', label: 'Inbox', icon: 'Msg' },
  { screen: 'leads', label: 'Leads', icon: 'Ld' },
  { screen: 'properties', label: 'Properties', icon: 'Pr' },
  { screen: 'appointments', label: 'Appointments', icon: 'Ap' },
  { screen: 'analytics', label: 'ROI Dashboard', icon: 'ROI' },
  { screen: 'knowledge_gaps', label: 'Train Your Bot', icon: 'Bot' },
  { screen: 'balance', label: 'Billing & Credits', icon: 'Rs' },
  { screen: 'settings', label: 'Settings', icon: 'Set' },
]

export default function Sidebar({ activeScreen, onNavigate, agent, isOpen = false, onClose }: Props) {
  const [botActive, setBotActive] = useState(agent?.bot_active ?? true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (agent && typeof agent.bot_active === 'boolean') setBotActive(agent.bot_active)
  }, [agent])

  const showBotControls = () => {
    onNavigate('settings')
    if (isMobile) onClose?.()
    setTimeout(() => window.dispatchEvent(new Event('leadnest:show-bot-controls')), 80)
  }

  const handleNav = (s: Screen) => {
    onNavigate(s)
    if (isMobile) onClose?.()
  }

  const agentName = agent?.name || 'Loading...'
  const agencyName = agent?.agency_name || ''
  const initials = agentName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const msgUsed = agent?.messages_used || 0
  const msgLimit = agent?.messages_limit || 5000
  const balancePct = Math.min((msgUsed / msgLimit) * 100, 100)
  const visible = !isMobile || isOpen

  return (
    <>
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199, backdropFilter: 'blur(2px)' }}
        />
      )}

      <div style={{
        width: 220, minWidth: 220, background: '#15161B',
        display: 'flex', flexDirection: 'column', height: '100vh',
        overflow: 'hidden', position: 'relative',
        ...(isMobile ? {
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 200,
          transform: visible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {}),
      } as React.CSSProperties}>
        <div style={{ position: 'absolute', width: 280, height: 280, background: 'radial-gradient(circle,rgba(79,70,229,0.16) 0%,transparent 70%)', top: -60, right: -100, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 200, height: 200, background: 'radial-gradient(circle,rgba(124,58,237,0.10) 0%,transparent 70%)', bottom: 40, left: -60, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/icon.webp" alt="TING" style={{ width: 26, height: 26, borderRadius: 8, objectFit: 'cover' }} />
              <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', letterSpacing: '-0.01em' }}>TING</span>
            </div>
            {isMobile && (
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>x</button>
            )}
          </div>

          <div data-tour="agent-card" style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#4338CA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#fff', flexShrink: 0 }}>{initials}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{agentName}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{agencyName}</div>
              </div>
            </div>

            <div
              onClick={showBotControls}
              title="Manage bot status in Settings"
              style={{
                marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                background: botActive ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${botActive ? 'rgba(129,140,248,0.30)' : 'rgba(255,255,255,0.12)'}`,
                transition: 'background 0.2s, border-color 0.2s'
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: botActive ? '#818CF8' : 'rgba(255,255,255,0.35)',
                  boxShadow: botActive ? '0 0 6px rgba(129,140,248,0.8)' : 'none',
                  transition: 'all 0.2s'
                }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em', color: botActive ? '#C7D2FE' : 'rgba(255,255,255,0.5)' }}>
                  {botActive ? 'AI Bot active' : 'AI Bot paused'}
                </span>
              </div>
              <div style={{
                width: 34, height: 19, borderRadius: 20, flexShrink: 0, position: 'relative',
                background: botActive ? 'linear-gradient(135deg,#6366F1,#4F46E5)' : 'rgba(255,255,255,0.18)',
                transition: 'background 0.2s'
              }}>
                <span style={{
                  position: 'absolute', top: 2.5, left: botActive ? 17.5 : 2.5,
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.35)', transition: 'left 0.2s ease'
                }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase' }}>Main</div>
            {navItems.slice(0, 5).map(item => (
              <NavItem key={item.screen} item={item} active={activeScreen === item.screen} onClick={() => handleNav(item.screen)} />
            ))}
            <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase', marginTop: 4 }}>Reports</div>
            <NavItem item={navItems[5]} active={activeScreen === 'analytics'} onClick={() => handleNav('analytics')} />
            <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase', marginTop: 4 }}>Account</div>
            {navItems.slice(6).map(item => (
              <NavItem key={item.screen} item={item} active={activeScreen === item.screen} onClick={() => handleNav(item.screen)} />
            ))}
          </div>

          <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>AI messages</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#fff' }}>{msgUsed.toLocaleString()} / {msgLimit.toLocaleString()}</span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${balancePct}%`, background: 'linear-gradient(90deg,#4F46E5,#818CF8)', borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function NavItem({ item, active, onClick }: { item: any; active: boolean; onClick: () => void }) {
  return (
    <div data-tour={`nav-${item.screen}`} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', color: active ? '#fff' : 'rgba(255,255,255,0.45)', background: active ? 'rgba(255,255,255,0.10)' : 'transparent', fontSize: 12, transition: 'all 0.15s', userSelect: 'none' }}>
      <span style={{ fontSize: 11, minWidth: 20 }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
    </div>
  )
}
