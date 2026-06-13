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
  balance: 'Billing & Credits',
  settings: 'Settings'
}

export default function Topbar({ screen, agentId, isSuperadmin = false, onNavigate, onMenuClick }: { screen: Screen, agentId?: string, isSuperadmin?: boolean, onNavigate?: (s: Screen) => void, onMenuClick?: () => void }) {
  const router = useRouter()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [role, setRole] = useState(isSuperadmin ? 'Superadmin' : 'Agent')
  
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── Global search (leads + properties) ──
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ leads: any[]; properties: any[] }>({ leads: [], properties: [] })
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!agentId) return
    const q = query.trim().toLowerCase()
    if (q.length < 2) { setResults({ leads: [], properties: [] }); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const [lr, pr] = await Promise.all([
          fetch('/api/leads?agent_id=' + agentId).then(r => r.json()),
          fetch('/api/properties?agent_id=' + agentId).then(r => r.json()),
        ])
        const leads = (lr.data || []).filter((l: any) =>
          (l.name || '').toLowerCase().includes(q) || (l.phone || '').toLowerCase().includes(q)
        ).slice(0, 5)
        const properties = (pr.data || []).filter((p: any) =>
          (p.title || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q)
        ).slice(0, 5)
        setResults({ leads, properties })
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query, agentId])

  const pickLead = (lead: any) => {
    setShowResults(false); setQuery('')
    onNavigate?.('inbox')
    // InboxScreen listens and selects this lead.
    setTimeout(() => window.dispatchEvent(new CustomEvent('convorian:open-lead', { detail: lead.id })), 60)
  }
  const pickProperty = () => { setShowResults(false); setQuery(''); onNavigate?.('properties') }

  // Close dropdowns if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
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
          setUserEmail(d.data.email || '')
          setAgencyName(d.data.agency_name || '')
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
      height: 54, padding: '0 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: 18, color: '#15161B', display: 'flex', alignItems: 'center' }}
            aria-label="Open menu"
          >
            ☰
          </button>
        )}
        <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B' }}>{titles[screen]}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div ref={searchRef} className="hide-mobile" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F4F3EE', border: '1px solid rgba(26,25,22,0.13)', borderRadius: 8, padding: '0 12px', height: 34, width: 220 }}>
            <span style={{ fontSize: 13, color: '#9E9B92' }}>🔍</span>
            <input
              type="text"
              placeholder="Search leads & properties..."
              value={query}
              onChange={e => { setQuery(e.target.value); setShowResults(true) }}
              onFocus={() => setShowResults(true)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#15161B', width: '100%', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
          {showResults && query.trim().length >= 2 && (
            <div style={{ position: 'absolute', top: 40, left: 0, width: 320, background: '#fff', borderRadius: 12, border: '1px solid rgba(26,25,22,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)', zIndex: 200, padding: 6, maxHeight: 380, overflowY: 'auto' }}>
              {searching && results.leads.length === 0 && results.properties.length === 0 && (
                <div style={{ fontSize: 12, color: '#9E9B92', padding: '12px', textAlign: 'center' }}>Searching…</div>
              )}
              {!searching && results.leads.length === 0 && results.properties.length === 0 && (
                <div style={{ fontSize: 12, color: '#9E9B92', padding: '12px', textAlign: 'center' }}>No matches for “{query}”.</div>
              )}
              {results.leads.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9E9B92', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px 4px' }}>Leads</div>
              )}
              {results.leads.map(l => (
                <button key={l.id} onClick={() => pickLead(l)} onMouseEnter={e => e.currentTarget.style.background = '#F4F3EE'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13, color: '#15161B', fontWeight: 500 }}>{l.name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: '#9E9B92' }}>{l.phone}</div>
                </button>
              ))}
              {results.properties.length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9E9B92', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px 4px' }}>Properties</div>
              )}
              {results.properties.map(p => (
                <button key={p.id} onClick={pickProperty} onMouseEnter={e => e.currentTarget.style.background = '#F4F3EE'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13, color: '#15161B', fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: '#9E9B92' }}>{p.location}{p.city ? `, ${p.city}` : ''}</div>
                </button>
              ))}
            </div>
          )}
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
            {/* Unread dot only when there are actual notifications (none yet). */}
          </button>
          
          {/* Notifications Dropdown */}
          {showNotifications && (
            <div style={{
              position: 'absolute', top: 44, right: 0, width: 280, background: '#fff', 
              borderRadius: 12, border: '1px solid rgba(26,25,22,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)', zIndex: 100, padding: 16
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#15161B', marginBottom: 12 }}>Notifications</div>
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
              width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#4338CA)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, 
              fontWeight: 500, color: '#fff', cursor: 'pointer', transition: 'opacity 0.2s' 
            }}>
            {initials}
          </div>

          {/* Profile Dropdown */}
          {showProfile && (
            <div style={{
              position: 'absolute', top: 44, right: 0, width: 248, background: '#fff',
              borderRadius: 12, border: '1px solid rgba(26,25,22,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.10)', zIndex: 100, padding: 6, overflow: 'hidden'
            }}>
              {/* Identity header — Settings & Billing live in the sidebar; this menu is account-level only. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px', borderBottom: '1px solid rgba(26,25,22,0.08)', marginBottom: 4 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#4338CA)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0
                }}>{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
                  <div style={{ fontSize: 11, color: '#737373', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail || role}</div>
                  {agencyName && <div style={{ fontSize: 11, color: '#9E9B92', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agencyName}</div>}
                </div>
              </div>

              {[
                {
                  label: 'Help & Support',
                  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
                  onClick: () => { setShowProfile(false); router.push('/help') }
                },
                {
                  label: 'Take the tour again',
                  icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                  onClick: () => { setShowProfile(false); window.dispatchEvent(new Event('leadnest:restart-tutorial')) }
                },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F4F3EE'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13, color: '#3D3B34',
                    background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                    display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit'
                  }}>
                  <span style={{ color: '#6B6860', display: 'flex' }}>{item.icon}</span> {item.label}
                </button>
              ))}

              <div style={{ height: 1, background: 'rgba(26,25,22,0.08)', margin: '4px 0' }} />
              <button
                onClick={async () => { await getSupabase().auth.signOut(); router.push('/login'); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FDECEA'; e.currentTarget.style.color = '#C0392B'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3D3B34'; }}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13, color: '#3D3B34',
                  background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit'
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign out
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
