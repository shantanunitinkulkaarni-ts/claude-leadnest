'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Topbar from '@/components/Topbar'

export default function AdminDashboard() {
  const router = useRouter()
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null)
  const [agencies, setAgencies] = useState<any[]>([])
  
  // Modals state
  const [showBalModal, setShowBalModal] = useState<string | null>(null) // agency id
  const [newBal, setNewBal] = useState('')
  const [showNumModal, setShowNumModal] = useState<string | null>(null) // agency id
  const [newNum, setNewNum] = useState('')

  useEffect(() => {
    let cancelled = false

    const fetchAgencies = async () => {
      const { data: agencyData } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
      if (!cancelled) setAgencies(agencyData || [])
    }

    async function decide(session: any) {
      if (cancelled) return
      if (!session) { router.push('/login'); return }
      // Is the user a superadmin? (RLS lets them read only their own row.)
      const { data: adminRecord } = await supabase
        .from('superadmins').select('*').eq('auth_user_id', session.user.id).maybeSingle()
      if (cancelled) return
      if (!adminRecord) { router.push('/dashboard'); return }
      setIsSuperadmin(true)
      fetchAgencies()
    }

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { decide(session); return }
      // No session on first read — the browser client may still be hydrating the
      // cookie. Wait briefly (auth event or 1.5s) before bouncing to /login, so
      // a logged-in superadmin isn't falsely kicked out.
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        if (s && !cancelled) { sub.subscription.unsubscribe(); decide(s) }
      })
      setTimeout(async () => {
        if (cancelled) return
        sub.subscription.unsubscribe()
        const { data: { session: s2 } } = await supabase.auth.getSession()
        decide(s2)
      }, 1500)
    })()

    return () => { cancelled = true }
  }, [router])

  const handleToggleSuspend = async (agency: any) => {
    const newVal = !agency.bot_active
    if (!confirm(`Are you sure you want to ${newVal ? 'UNSUSPEND' : 'SUSPEND'} ${agency.agency_name}?`)) return
    
    setAgencies(prev => prev.map(a => a.id === agency.id ? { ...a, bot_active: newVal } : a))
    await fetch('/api/agent?id=' + agency.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_active: newVal })
    })
  }

  const handleUpdateBalance = async (agencyId: string) => {
    const amount = parseInt(newBal, 10)
    if (isNaN(amount)) return
    
    setAgencies(prev => prev.map(a => a.id === agencyId ? { ...a, wa_balance: amount } : a))
    setShowBalModal(null)
    setNewBal('')

    await fetch('/api/agent?id=' + agencyId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_balance: amount })
    })
  }

  const handleUpdateNumber = async (agencyId: string) => {
    // Store digits only (e.g. 919876543210) to match the webhook's normalisation.
    const digits = newNum.replace(/\D/g, '')
    setAgencies(prev => prev.map(a => a.id === agencyId ? { ...a, msg91_integrated_number: digits } : a))
    setShowNumModal(null)
    setNewNum('')
    await fetch('/api/agent?id=' + agencyId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg91_integrated_number: digits })
    })
  }

  const handleImpersonate = (agencyId: string, agencyName: string) => {
    // Non-destructive impersonation: superadmins already bypass per-agency access
    // checks server-side (lib/apiAuth requireAgentAccess), so we just tell the
    // dashboard which agency to render via localStorage — no DB mutation, fully
    // reversible, and works even for an admin account that has no agency itself.
    if (!confirm(`View ${agencyName || 'this agency'}'s dashboard as them? You can exit back to admin anytime.`)) return
    localStorage.setItem('convorian_impersonate_agent_id', agencyId)
    localStorage.setItem('convorian_impersonate_agent_name', agencyName || '')
    router.push('/dashboard')
  }

  if (isSuperadmin === null) return <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif" }}>Verifying permissions...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#FAFAFB', fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar screen="overview" isSuperadmin={true} />
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, marginBottom: 8, color: '#15161B' }}>Platform Superadmin</h1>
        <p style={{ color: '#6B6860', marginBottom: 32 }}>Manage all Convorian agencies, billing, and global settings.</p>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(26,25,22,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F4F3EE', borderBottom: '1px solid rgba(26,25,22,0.1)' }}>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>Agency Name</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>Owner Email</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>Status</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>WA Balance</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>WhatsApp #</th>
                <th style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B6860' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map(agency => (
                <tr key={agency.id} style={{ borderBottom: '1px solid rgba(26,25,22,0.05)' }}>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#15161B', fontWeight: 500 }}>{agency.agency_name || 'Unnamed Agency'}</td>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#6B6860' }}>{agency.email || 'No email provided'}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <button 
                      onClick={() => handleToggleSuspend(agency)}
                      style={{ padding: '4px 10px', background: agency.bot_active ? '#EEF0FE' : '#FDF0F0', color: agency.bot_active ? '#4338CA' : '#C0392B', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid ' + (agency.bot_active ? '#4F46E533' : '#C0392B33'), cursor: 'pointer' }}>
                      {agency.bot_active ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#15161B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      ₹{agency.wa_balance || 0}
                      <button onClick={() => setShowBalModal(agency.id)} style={{ padding: '2px 6px', fontSize: 11, background: '#F4F3EE', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Edit</button>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 13, color: '#15161B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: agency.msg91_integrated_number ? '#15161B' : '#C0392B' }}>
                        {agency.msg91_integrated_number || 'not set'}
                      </span>
                      <button onClick={() => { setShowNumModal(agency.id); setNewNum(agency.msg91_integrated_number || '') }} style={{ padding: '2px 6px', fontSize: 11, background: '#F4F3EE', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Edit</button>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <button onClick={() => handleImpersonate(agency.id, agency.agency_name)} style={{ fontSize: 12, padding: '6px 12px', background: '#FAFAFB', border: '1px solid rgba(26,25,22,0.18)', borderRadius: 6, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                      Impersonate
                    </button>
                  </td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#6B6860', fontSize: 14 }}>
                    No agencies registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showBalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: '#15161B' }}>Set New Balance</div>
            <input 
              type="number" 
              value={newBal} 
              onChange={e => setNewBal(e.target.value)} 
              placeholder="e.g. 500"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', marginBottom: 16, outline: 'none' }}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleUpdateBalance(showBalModal)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowBalModal(null); setNewBal(''); }} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={() => handleUpdateBalance(showBalModal)} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showNumModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6, color: '#15161B' }}>MSG91 WhatsApp Number</div>
            <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 16 }}>The agent&apos;s WhatsApp business number registered in MSG91, with country code (e.g. 919876543210). Inbound messages to this number route to this agency.</div>
            <input
              type="text"
              value={newNum}
              onChange={e => setNewNum(e.target.value)}
              placeholder="e.g. 919876543210"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', marginBottom: 16, outline: 'none' }}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleUpdateNumber(showNumModal)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNumModal(null); setNewNum(''); }} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={() => handleUpdateNumber(showNumModal)} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
