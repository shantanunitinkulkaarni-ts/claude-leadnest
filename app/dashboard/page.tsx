'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import InboxScreen from '@/components/screens/InboxScreen'
import OverviewScreen from '@/components/screens/OverviewScreen'
import LeadsScreen from '@/components/screens/LeadsScreen'
import PropertiesScreen from '@/components/screens/PropertiesScreen'
import AppointmentsScreen from '@/components/screens/AppointmentsScreen'
import { ROIScreen } from '@/components/screens/ROIScreen'
import BalanceScreen from '@/components/screens/BalanceScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import SupportChat from '@/components/SupportChat'
import TutorialWalkthrough from '@/components/TutorialWalkthrough'

export type Screen = 'overview' | 'inbox' | 'leads' | 'properties' | 'appointments' | 'analytics' | 'balance' | 'settings'

export default function DashboardPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('overview')
  const [agent, setAgent] = useState<any>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [impersonating, setImpersonating] = useState<string | null>(null) // agency name when admin is viewing as a client

  const refreshAgent = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/agent?id=${id}`)
      const d = await r.json()
      if (d.data) setAgent(d.data)
    } catch (err) {}
  }, [])

  useEffect(() => {
    const init = async () => {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // Superadmin impersonation: if an admin chose to view a client's dashboard
      // (/admin → Impersonate), honour that target instead of their own agency.
      // Only trusted for verified superadmins; the data APIs independently allow
      // superadmins, so this never grants access a normal user could fake.
      const impersonateId = typeof window !== 'undefined' ? localStorage.getItem('convorian_impersonate_agent_id') : null
      if (impersonateId) {
        const { data: sa } = await supabase
          .from('superadmins').select('auth_user_id').eq('auth_user_id', session.user.id).maybeSingle()
        if (sa) {
          setAgentId(impersonateId)
          setImpersonating(localStorage.getItem('convorian_impersonate_agent_name') || 'client')
          await refreshAgent(impersonateId)
          setIsLoading(false)
          return
        }
        // Not actually an admin — clear the stale flag and fall through.
        localStorage.removeItem('convorian_impersonate_agent_id')
        localStorage.removeItem('convorian_impersonate_agent_name')
      }

      const { data: teamMember, error } = await supabase
        .from('team_members')
        .select('agent_id')
        .eq('auth_user_id', session.user.id)
        .single()

      if (error || !teamMember) {
        router.push('/onboarding')
        return
      }

      setAgentId(teamMember.agent_id)
      await refreshAgent(teamMember.agent_id)
      setIsLoading(false)
    }
    init()
  }, [router, refreshAgent])

  const renderScreen = () => {
    if (!agentId) return null
    switch (screen) {
      case 'overview': return <OverviewScreen agentId={agentId} onNavigate={setScreen} />
      case 'inbox': return <InboxScreen agentId={agentId} />
      case 'leads': return <LeadsScreen agentId={agentId} />
      case 'properties': return <PropertiesScreen agentId={agentId} />
      case 'appointments': return <AppointmentsScreen agentId={agentId} />
      case 'analytics': return <ROIScreen agentId={agentId} />
      case 'balance': return <BalanceScreen agentId={agentId} onTopUp={() => agentId && refreshAgent(agentId)} />
      case 'settings': return <SettingsScreen agentId={agentId} agent={agent} />
      default: return <OverviewScreen agentId={agentId} onNavigate={setScreen} />
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#FAFAFB', fontFamily: "'DM Sans', sans-serif", flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E8E5DF', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 13, color: '#9E9B92' }}>Loading your dashboard...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#FAFAFB' }}>
      <style>{`
        @media (max-width: 767px) {
          .hide-mobile { display: none !important; }
          .mobile-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .mobile-stack { flex-direction: column !important; }
          .mobile-full { width: 100% !important; min-width: unset !important; }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
      <Sidebar
        activeScreen={screen}
        onNavigate={setScreen}
        agent={agent}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {impersonating && (
          <div style={{ background: '#15161B', color: '#fff', padding: '8px 16px', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexShrink: 0 }}>
            <span>👁 Viewing as <strong>{impersonating}</strong> (admin mode)</span>
            <button
              onClick={() => { localStorage.removeItem('convorian_impersonate_agent_id'); localStorage.removeItem('convorian_impersonate_agent_name'); router.push('/admin') }}
              style={{ background: '#fff', color: '#15161B', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Exit to admin
            </button>
          </div>
        )}
        <Topbar
          screen={screen}
          agentId={agentId ?? undefined}
          onNavigate={setScreen}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <ErrorBoundary name={screen} key={screen}>
            {renderScreen()}
          </ErrorBoundary>
        </div>
      </div>
      <SupportChat agentId={agentId ?? undefined} />
      <TutorialWalkthrough onNavigate={setScreen} />
    </div>
  )
}
