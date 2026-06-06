'use client'
import { Screen } from '@/app/dashboard/page'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

const titles: Record<Screen, string> = {
  overview: 'Overview',
  inbox: 'Inbox',
  leads: 'Leads',
  properties: 'Properties',
  appointments: 'Appointments',
  analytics: 'ROI Dashboard',
  balance: 'WA Balance',
  settings: 'Settings'
}

export default function Topbar({ screen, agentId, isSuperadmin = false, onNavigate }: { screen: Screen, agentId?: string, isSuperadmin?: boolean, onNavigate?: (s: Screen) => void }) {
  const router = useRouter()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState(isSuperadmin ? 'Superadmin' : 'Agent')
  
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Close dropdowns if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    async function fetchUser() {
      if (!agentId) {
        setUserName(isSuperadmin ? 'Admin User' : 'Loading...')
        return
      }
      try {
        const res = await fetch('/api/agent?id=' + agentId)
        const d = await res.json()
        if (d.data) {
          setUserName(d.data.name || 'User')
          setRole(isSuperadmin ? 'Superadmin' : 'Owner')
        }
      } catch (e) {
        console.error(e)
      }
    }
    fetchUser()
  }, [agentId, isSuperadmin])

  const initials = userName === 'Loading...' ? '' : userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

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
        
        {/* Notifications Button */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button 
            onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F4F3EE'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            style={{ 
              width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(26,25,22,0.13)', 
              background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', 
              alignItems: 'center', justifyContent: 'center', position: 'relative',
              transition: 'background 0.2s'
            }}>
            🔔
            <div style={{ position: 'absolute', top: 6, right: 7, width: 5, height: 5, borderRadius: '50%', background: '#C0392B', border: '1.5px solid #fff' }} />
          </button>
          
          {/* Notifications Dropdown */}
          {showNotifications && (
            <div style={{
              position: 'absolute', top: 44, right: 0, width: 280, background: '#fff', 
              borderRadius: 12, border: '1px solid rgba(26,25,22,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)', zIndex: 100, padding: 16
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1916', marginBottom: 12 }}>Notifications</div>
              <div style={{ fontSize: 13, color: '#737373', textAlign: 'center', padding: '20px 0' }}>
                No new notifications
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <div 
            onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            style={{ 
              width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2E8B5F,#1A6B4A)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, 
              fontWeight: 500, color: '#fff', cursor: 'pointer', transition: 'opacity 0.2s' 
            }}>
            {initials}
          </div>

          {/* Profile Dropdown */}
          {showProfile && (
            <div style={{
              position: 'absolute', top: 44, right: 0, width: 200, background: '#fff', 
              borderRadius: 12, border: '1px solid rgba(26,25,22,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)', zIndex: 100, padding: 8
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(26,25,22,0.08)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1916' }}>{userName}</div>
                <div style={{ fontSize: 11, color: '#737373' }}>{role}</div>
              </div>
              <button 
                onClick={() => { setShowProfile(false); onNavigate?.('settings'); }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F4F3EE'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{ 
                  width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#1A1916',
                  background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'background 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8
                }}>
                ⚙️ Settings
              </button>
              <button 
                onClick={async () => { await getSupabase().auth.signOut(); router.push('/login'); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FDECEA'; e.currentTarget.style.color = '#C0392B'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1A1916'; }}
                style={{ 
                  width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#1A1916',
                  background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 8
                }}>
                🚪 Sign out
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
