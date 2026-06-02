'use client'

import { Screen } from '@/app/dashboard/page'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

interface Props {
  activeScreen: Screen
  onNavigate: (s: Screen) => void
  agentId?: string
}

const navItems: { screen: Screen; label: string; icon: string; badge?: string }[] = [
  { screen: 'overview', label: 'Overview', icon: '▦' },
  { screen: 'inbox', label: 'Inbox', icon: '💬' },
  { screen: 'leads', label: 'Leads', icon: '👥' },
  { screen: 'properties', label: 'Properties', icon: '🏠' },
  { screen: 'appointments', label: 'Appointments', icon: '📅' },
  { screen: 'analytics', label: 'Analytics', icon: '📊' },
  { screen: 'balance', label: 'WA Balance', icon: '💳' },
  { screen: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ activeScreen, onNavigate, agentId }: Props) {
  const [botActive, setBotActive] = useState(true)
  const [inboxCount, setInboxCount] = useState(0)
  const [waBalance, setWaBalance] = useState<number | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [userName, setUserName] = useState('Loading...')
  const [agencyName, setAgencyName] = useState('Loading...')

  // Polling for inbox count
  useEffect(() => {
    if (!agentId) return
    const fetchCount = () => {
      fetch('/api/leads?agent_id=' + agentId)
        .then(r => r.json())
        .then(d => {
          if (d.data) {
            setInboxCount(d.data.length)
          }
        })
        .catch(console.error)

      fetch('/api/agent?id=' + agentId)
        .then(r => r.json())
        .then(d => {
          if (d.data) {
            setWaBalance(d.data.wa_balance || 0)
            setBotActive(!!d.data.bot_active)
            setUserName(d.data.name || 'User')
            setAgencyName(d.data.agency_name || 'Agency')
          }
        })
        .catch(console.error)
    }
    
    fetchCount()
    
    // Slow fallback poll (30s)
    const interval = setInterval(fetchCount, 30000)
    
    // Realtime WebSocket subscription
    const supabase = getSupabase()
    const channel = supabase.channel('sidebar-leads-changes')
      .on('postgres', { event: 'INSERT', schema: 'public', table: 'leads', filter: `agent_id=eq.${agentId}` }, () => {
        fetchCount()
      })
      .on('postgres', { event: 'UPDATE', schema: 'public', table: 'leads', filter: `agent_id=eq.${agentId}` }, () => {
        fetchCount()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [agentId])

  const executeToggle = async (newVal: boolean) => {
    setBotActive(newVal)
    try {
      await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: newVal })
      })
    } catch(e) {
      setBotActive(!newVal)
    }
  }

  // Get initials for avatar
  const initials = userName === 'Loading...' ? '' : userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

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
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2E8B5F,#1A6B4A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: '#fff', flexShrink: 0 }}>{initials}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agencyName}</div>
            </div>
          </div>
          <div 
            onClick={async () => {
              if (botActive) {
                setShowPinModal(true)
                return
              }
              const newVal = false // this branch won't execute if botActive is true, so newVal is true actually. Wait!
              // Let's refactor
              executeToggle(true)
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            style={{ 
              marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, 
              background: botActive ? 'rgba(77,184,138,0.15)' : 'rgba(192,57,43,0.15)', 
              border: `1px solid ${botActive ? 'rgba(77,184,138,0.25)' : 'rgba(192,57,43,0.25)'}`, 
              borderRadius: 20, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.2s' 
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: botActive ? '#4DB88A' : '#C0392B', transition: 'background 0.2s' }} />
            <span style={{ fontSize: 10, color: botActive ? '#4DB88A' : '#C0392B', fontWeight: 500, transition: 'color 0.2s' }}>
              {botActive ? 'Bot active' : 'Bot paused'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', padding: '8px 10px 4px', textTransform: 'uppercase' }}>Main</div>
          {navItems.slice(0, 5).map(item => (
            <NavItem 
              key={item.screen} 
              item={{ ...item, badge: item.screen === 'inbox' && inboxCount > 0 ? inboxCount.toString() : item.badge }} 
              active={activeScreen === item.screen} 
              onClick={() => onNavigate(item.screen)} 
            />
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
            <span style={{ fontSize: 11, fontWeight: 500, color: '#fff' }}>₹{waBalance !== null ? waBalance : '...'}</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (waBalance || 0) / 10)}%`, background: 'linear-gradient(90deg,#2E8B5F,#4DB88A)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* PIN Modal for Sidebar */}
      {showPinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916', marginBottom: 6 }}>Admin Override</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>Enter master PIN to pause the AI agent. Default is 1234.</div>
            
            <input 
              type="password" 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
              placeholder="Enter PIN"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (pinInput === '1234') {
                    setShowPinModal(false)
                    setPinInput('')
                    executeToggle(false)
                  } else {
                    alert('Incorrect PIN')
                    setPinInput('')
                  }
                }
              }}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none', color: '#000' }}
            />
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button 
                onClick={() => {
                  if (pinInput === '1234') {
                    setShowPinModal(false)
                    setPinInput('')
                    executeToggle(false)
                  } else {
                    alert('Incorrect PIN')
                    setPinInput('')
                  }
                }} 
                style={{ padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}
              >
                Pause Bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavItem({ item, active, onClick }: { item: any; active: boolean; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div 
      onClick={onClick} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        color: active ? '#fff' : (isHovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)'),
        background: active ? 'rgba(255,255,255,0.10)' : (isHovered ? 'rgba(255,255,255,0.05)' : 'transparent'),
        fontSize: 12, transition: 'all 0.15s',
        userSelect: 'none'
      }}
    >
      <span style={{ fontSize: 14 }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{ background: '#C0392B', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 500 }}>{item.badge}</span>
      )}
    </div>
  )
}
