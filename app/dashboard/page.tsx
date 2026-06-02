'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import InboxScreen from '@/components/screens/InboxScreen'
import LeadsScreen from '@/components/screens/LeadsScreen'
import PropertiesScreen from '@/components/screens/PropertiesScreen'
import AppointmentsScreen from '@/components/screens/AppointmentsScreen'
import AnalyticsScreen from '@/components/screens/AnalyticsScreen'
import BalanceScreen from '@/components/screens/BalanceScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import OverviewScreen from '@/components/screens/OverviewScreen'
import FeedbackGate from '@/components/FeedbackGate'

export type Screen = 'overview' | 'inbox' | 'leads' | 'properties' | 'appointments' | 'analytics' | 'balance' | 'settings'

export default function DashboardPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('overview')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!session) {
          router.push('/login')
          return
        }

        const { data: teamMember } = await supabase
          .from('team_members')
          .select('agent_id')
          .eq('auth_user_id', session.user.id)
          .single()

        if (teamMember) {
          setAgentId(teamMember.agent_id)
        } else {
          router.push('/onboarding')
        }
      } catch (err) {
        console.error('Failed to load user:', err)
        router.push('/login')
      } finally {
        setIsLoading(false)
      }
    }
    loadUser()
  }, [router])

  const renderScreen = () => {
    if (!agentId) return null
    switch (screen) {
      case 'overview': return <OverviewScreen agentId={agentId} onNavigate={setScreen} />
      case 'inbox': return <InboxScreen agentId={agentId} />
      case 'leads': return <LeadsScreen agentId={agentId} />
      case 'properties': return <PropertiesScreen agentId={agentId} />
      case 'appointments': return <AppointmentsScreen agentId={agentId} />
      case 'analytics': return <AnalyticsScreen agentId={agentId} />
      case 'balance': return <BalanceScreen agentId={agentId} />
      case 'settings': return <SettingsScreen agentId={agentId} />
      default: return <OverviewScreen agentId={agentId} onNavigate={setScreen} />
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', color: '#1A1916', fontFamily: "'DM Sans', sans-serif" }}>
        Loading your workspace...
      </div>
    )
  }

  if (!agentId) return null

  return (
    <FeedbackGate agentId={agentId}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#FAFAF7' }}>
        <Sidebar activeScreen={screen} onNavigate={setScreen} agentId={agentId} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar screen={screen} agentId={agentId} />
          <div style={{ flex: 1, overflow: 'auto' }}>
            {renderScreen()}
          </div>
        </div>
      </div>
    </FeedbackGate>
  )
}
