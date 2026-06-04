'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import InboxScreen from '@/components/screens/InboxScreen'
import OverviewScreen from '@/components/screens/OverviewScreen'
import { LeadsScreen, PropertiesScreen, AppointmentsScreen, AnalyticsScreen, BalanceScreen, SettingsScreen } from '@/components/screens/OtherScreens'

export type Screen = 'overview' | 'inbox' | 'leads' | 'properties' | 'appointments' | 'analytics' | 'balance' | 'settings'

// Fixed test agent ID — will be replaced with real auth later
const AGENT_ID = 'test-agent-001'

export default function DashboardPage() {
  const [screen, setScreen] = useState<Screen>('overview')
  const [agent, setAgent] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/agent?id=${AGENT_ID}`)
      .then(r => r.json())
      .then(d => { if (d.data) setAgent(d.data) })
      .catch(() => {})
  }, [])

  const renderScreen = () => {
    switch (screen) {
      case 'overview': return <OverviewScreen agentId={AGENT_ID} onNavigate={setScreen} />
      case 'inbox': return <InboxScreen agentId={AGENT_ID} />
      case 'leads': return <LeadsScreen agentId={AGENT_ID} />
      case 'properties': return <PropertiesScreen agentId={AGENT_ID} />
      case 'appointments': return <AppointmentsScreen agentId={AGENT_ID} />
      case 'analytics': return <AnalyticsScreen agentId={AGENT_ID} />
      case 'balance': return <BalanceScreen agentId={AGENT_ID} />
      case 'settings': return <SettingsScreen agentId={AGENT_ID} agent={agent} />
      default: return <OverviewScreen agentId={AGENT_ID} onNavigate={setScreen} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#FAFAF7' }}>
      <Sidebar activeScreen={screen} onNavigate={setScreen} agent={agent} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar screen={screen} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderScreen()}
        </div>
      </div>
    </div>
  )
}
