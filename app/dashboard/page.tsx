'use client'

import { useState } from 'react'
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

export type Screen = 'overview' | 'inbox' | 'leads' | 'properties' | 'appointments' | 'analytics' | 'balance' | 'settings'

// Temporary mock agent ID — replace with real auth
const MOCK_AGENT_ID = 'mock-agent-id'

export default function DashboardPage() {
  const [screen, setScreen] = useState<Screen>('overview')

  const renderScreen = () => {
    switch (screen) {
      case 'overview': return <OverviewScreen agentId={MOCK_AGENT_ID} onNavigate={setScreen} />
      case 'inbox': return <InboxScreen agentId={MOCK_AGENT_ID} />
      case 'leads': return <LeadsScreen agentId={MOCK_AGENT_ID} />
      case 'properties': return <PropertiesScreen agentId={MOCK_AGENT_ID} />
      case 'appointments': return <AppointmentsScreen agentId={MOCK_AGENT_ID} />
      case 'analytics': return <AnalyticsScreen agentId={MOCK_AGENT_ID} />
      case 'balance': return <BalanceScreen agentId={MOCK_AGENT_ID} />
      case 'settings': return <SettingsScreen agentId={MOCK_AGENT_ID} />
      default: return <OverviewScreen agentId={MOCK_AGENT_ID} onNavigate={setScreen} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#FAFAF7' }}>
      <Sidebar activeScreen={screen} onNavigate={setScreen} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar screen={screen} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderScreen()}
        </div>
      </div>
    </div>
  )
}
