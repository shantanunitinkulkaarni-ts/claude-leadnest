'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
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
  const [showTutorial, setShowTutorial] = useState(true)

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
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', fontFamily: "'DM Sans', sans-serif", flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E8E5DF', borderTopColor: '#2E8B5F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 13, color: '#9E9B92' }}>Loading your dashboard...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#FAFAF7' }}>
      <Sidebar activeScreen={screen} onNavigate={setScreen} agent={agent} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar screen={screen} agentId={agentId ?? undefined} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderScreen()}
        </div>
      </div>
      <SupportChat />
      {showTutorial && <TutorialWalkthrough onComplete={() => setShowTutorial(false)} />}
    </div>
  )
}
