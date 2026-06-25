'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'

type Readiness = 'ready' | 'needs_setup' | 'attention' | 'inactive'

type AgentRow = {
  id: string
  agency_name: string
  owner_name: string
  owner_email: string
  city?: string
  state?: string
  created_at: string
  bot_active: boolean
  whatsapp_connected: boolean
  whatsapp_label: string
  plan_status: string
  plan: string
  subscription_active: boolean
  wa_balance: number
  last_activity_at: string | null
  last_inbound_at: string | null
  last_bot_reply_at: string | null
  readiness: Readiness
  counts: {
    leads: number
    active_properties: number
    ai_messages: number
    failed_sends: number
    open_support: number
    bot_paused_leads: number
    upcoming_visits: number
    pending_gaps: number
    support_clicks: number
  }
  usage: {
    leads: { used: number; limit: number }
    properties: { used: number; limit: number }
    aiMessages: { used: number; limit: number }
  }
  recent_leads: any[]
  recent_failures: any[]
  upcoming_visits: any[]
  support_items: any[]
  recent_conversation: any[]
  conversation_flags: any[]
  readiness_checks: Record<string, boolean>
}

type OpsData = {
  generated_at: string
  free_limits: { leads: number; properties: number; aiMessages: number }
  summary: any
  agents: AgentRow[]
  attention: {
    failed_messages: any[]
    support_tickets: any[]
    support_chats: any[]
    knowledge_gaps: any[]
    bot_paused_leads: any[]
  }
  upcoming_visits: any[]
}

const C = {
  ink: '#15161B',
  muted: '#6B6860',
  soft: '#F4F3EE',
  line: 'rgba(26,25,22,0.09)',
  blue: '#4F46E5',
  red: '#C0392B',
  gold: '#B7770D',
  green: '#1B7A43',
}

const readinessMeta: Record<Readiness, { label: string; bg: string; color: string }> = {
  ready: { label: 'Ready', bg: '#E7F6EC', color: '#1B7A43' },
  needs_setup: { label: 'Needs setup', bg: '#FEF3C7', color: '#8A5A00' },
  attention: { label: 'Attention', bg: '#FDECEA', color: '#C0392B' },
  inactive: { label: 'Inactive', bg: '#ECEFF3', color: '#5B6472' },
}

function formatTime(value?: string | null) {
  if (!value) return 'Never'
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Unknown'
  }
}

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return 'Unknown'
  }
}

function metricTitle(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function Pill({ status }: { status: Readiness }) {
  const meta = readinessMeta[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 999, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700 }}>
      {meta.label}
    </span>
  )
}

function MetricCard({ label, value, note, color = C.blue }: { label: string; value: any; note?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', minHeight: 86 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 27, lineHeight: 1, color, fontWeight: 700 }}>{value}</div>
      {note && <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>{note}</div>}
    </div>
  )
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const over = used > limit
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: over ? C.red : C.ink, fontWeight: 600 }}>{used} / {limit}</span>
      </div>
      <div style={{ height: 7, background: '#ECEAE0', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? C.red : C.blue }} />
      </div>
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, color: C.ink, fontWeight: 700 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: C.muted }}>{text}</div>
}

export default function AdminDashboard() {
  const router = useRouter()
  const [data, setData] = useState<OpsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [showBalModal, setShowBalModal] = useState<string | null>(null)
  const [newBal, setNewBal] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [showSevenDays, setShowSevenDays] = useState(false)

  const selected = useMemo(() => data?.agents.find(a => a.id === selectedId) || null, [data, selectedId])
  const visibleAgents = useMemo(() => {
    if (!data) return []
    return showActiveOnly ? data.agents.filter(a => a.bot_active) : data.agents
  }, [data, showActiveOnly])

  const loadOps = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/ops', { cache: 'no-store' })
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) { router.push('/dashboard'); return }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load admin operations')
      setData(json)
      if (selectedId && !json.agents.some((a: AgentRow) => a.id === selectedId)) setSelectedId(null)
    } catch (e: any) {
      setError(e.message || 'Could not load admin operations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOps() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateAgentLocal = (id: string, patch: Partial<AgentRow>) => {
    setData(prev => prev ? { ...prev, agents: prev.agents.map(a => a.id === id ? { ...a, ...patch } : a) } : prev)
  }

  const handleToggleSuspend = async (agency: AgentRow) => {
    const newVal = !agency.bot_active
    if (!confirm(`Are you sure you want to ${newVal ? 'UNSUSPEND' : 'SUSPEND'} ${agency.agency_name}?`)) return
    updateAgentLocal(agency.id, { bot_active: newVal })
    await fetch('/api/agent?id=' + agency.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_active: newVal })
    })
    loadOps()
  }

  const handleUpdateBalance = async (agencyId: string) => {
    const amount = parseInt(newBal, 10)
    if (isNaN(amount)) return
    setShowBalModal(null)
    setNewBal('')
    await fetch('/api/agent?id=' + agencyId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_balance: amount })
    })
    loadOps()
  }

  const handleImpersonate = (agencyId: string, agencyName: string) => {
    if (!confirm(`View ${agencyName || 'this agency'}'s dashboard as them? You can exit back to admin anytime.`)) return
    localStorage.setItem('convorian_impersonate_agent_id', agencyId)
    localStorage.setItem('convorian_impersonate_agent_name', agencyName || '')
    router.push('/dashboard')
  }

  const summary = data?.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#FAFAFB', fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar screen="overview" isSuperadmin={true} />
      <main style={{ padding: '24px 28px 40px', maxWidth: 1440, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 5px', color: C.ink }}>Superadmin Operations</h1>
            <p style={{ color: C.muted, margin: 0, fontSize: 13 }}>Daily command center for launch monitoring. Read-only except the separate Admin Tools section.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadOps} style={{ padding: '9px 13px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Refresh</button>
            <button onClick={() => setShowActiveOnly(v => !v)} style={{ padding: '9px 13px', borderRadius: 8, border: `1px solid ${showActiveOnly ? C.blue : C.line}`, background: showActiveOnly ? '#EEF0FE' : '#fff', color: showActiveOnly ? C.blue : C.ink, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Active accounts</button>
            <button onClick={() => setShowSevenDays(v => !v)} style={{ padding: '9px 13px', borderRadius: 8, border: `1px solid ${showSevenDays ? C.blue : C.line}`, background: showSevenDays ? '#EEF0FE' : '#fff', color: showSevenDays ? C.blue : C.ink, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>7-day details</button>
            <button onClick={() => setShowTools(!showTools)} style={{ padding: '9px 13px', borderRadius: 8, border: `1px solid ${showTools ? C.blue : C.line}`, background: showTools ? '#EEF0FE' : '#fff', color: showTools ? C.blue : C.ink, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Admin Tools</button>
          </div>
        </div>

        {loading && <div style={{ padding: 40, color: C.muted }}>Loading operations panel...</div>}
        {error && <div style={{ padding: 18, background: '#FDECEA', color: C.red, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

        {data && !loading && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) repeat(6, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
              <MetricCard label="Total accounts" value={summary.accounts.total} note="All agency accounts" />
              <MetricCard label="Free tier" value={summary.accounts.free} note="No paid subscription" />
              <MetricCard label="Paid tier" value={summary.accounts.paid} note="Active subscription" />
              <MetricCard label="Active accounts" value={summary.accounts.active} note="Bot active in DB" />
              <MetricCard label="Today signups" value={summary.today.signups} />
              <MetricCard label="Today leads" value={summary.today.inbound_leads} />
              <MetricCard label="Bot replies" value={summary.today.bot_replies} />
              <MetricCard label="WhatsApp balance" value={summary.accounts.with_balance} note="Have wallet balance" />
              <MetricCard label="Visits booked" value={summary.today.visits_booked} color={C.green} />
              <MetricCard label="Failed sends" value={summary.today.failed_sends} color={summary.today.failed_sends ? C.red : C.green} />
              <MetricCard label="Support issues" value={summary.today.support_issues} color={summary.today.support_issues ? C.gold : C.green} />
            </div>

            {showSevenDays && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 18 }}>
              <Section title="7-Day Details">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 14 }}>
                  <MetricCard label="Inbound leads" value={summary.seven_days.inbound_leads} note="All agents" />
                  <MetricCard label="Bot messages" value={summary.seven_days.bot_messages} note="Outbound AI replies" />
                  <MetricCard label="Active agents" value={summary.seven_days.active_agents} note={`${summary.agents.total} total agents`} />
                  <MetricCard label="Visits booked" value={summary.seven_days.visits_booked} color={C.green} />
                  <MetricCard label="Failed messages" value={summary.seven_days.failed_messages} color={summary.seven_days.failed_messages ? C.red : C.green} />
                  <MetricCard label="Support issues" value={summary.seven_days.support_issues} color={summary.seven_days.support_issues ? C.gold : C.green} />
                </div>
              </Section>
            </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 18 }}>
              <Section title="Agent Readiness">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: 14 }}>
                  <MetricCard label="Ready" value={summary.agents.ready} color={C.green} />
                  <MetricCard label="Attention" value={summary.agents.attention} color={C.red} />
                  <MetricCard label="Needs setup" value={summary.agents.needs_setup} color={C.gold} />
                  <MetricCard label="Inactive" value={summary.agents.inactive} color="#5B6472" />
                </div>
              </Section>
              <Section title="Usage Signals">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: 14 }}>
                  <MetricCard label="Last activity" value={summary.accounts.last_activity ? summary.accounts.last_activity : '—'} note="Most recent app event" />
                  <MetricCard label="Support clicks" value={summary.accounts.support_clicks} note="Tickets + support chat logs" />
                  <MetricCard label="WA balance holders" value={summary.accounts.with_balance} note="Agents with wallet balance" />
                  <MetricCard label="WhatsApp connected" value={summary.accounts.connected} note="Meta-direct linked" />
                </div>
              </Section>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Section title="Agent Health Table" action={<span style={{ fontSize: 11, color: C.muted }}>Free tier: {data.free_limits.leads} leads / {data.free_limits.properties} properties / {data.free_limits.aiMessages} AI messages</span>}>
                  {data.agents.length === 0 ? <Empty text="No agencies registered yet." /> : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                        <thead>
                          <tr style={{ background: C.soft }}>
                            {['Agency', 'Readiness', 'WhatsApp', 'Bot', 'Last inbound', 'Usage', 'Failures', 'Support'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '11px 12px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleAgents.map(agent => (
                            <tr key={agent.id} onClick={() => setSelectedId(agent.id)} style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer', background: selectedId === agent.id ? '#EEF0FE' : '#fff' }}>
                              <td style={{ padding: '13px 12px' }}>
                                <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>{agent.agency_name}</div>
                                <div style={{ fontSize: 11, color: C.muted }}>{agent.owner_email || 'No email'}{agent.city ? ` - ${agent.city}` : ''}</div>
                              </td>
                              <td style={{ padding: '13px 12px' }}><Pill status={agent.readiness} /></td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: agent.whatsapp_connected ? C.green : C.red }}>{agent.whatsapp_connected ? `Connected (${agent.readiness_checks.whatsapp_source || 'db'})` : 'Missing'}</td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: agent.bot_active ? C.green : C.red }}>{agent.bot_active ? 'Active' : 'Suspended'}</td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: C.muted }}>{formatTime(agent.last_inbound_at)}</td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: C.ink }}>{agent.counts.leads}/{agent.usage.leads.limit} leads | {agent.counts.active_properties}/{agent.usage.properties.limit} props | {agent.counts.ai_messages}/{agent.usage.aiMessages.limit} AI</td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: agent.counts.failed_sends ? C.red : C.green }}>{agent.counts.failed_sends}</td>
                              <td style={{ padding: '13px 12px', fontSize: 12, color: agent.counts.open_support ? C.gold : C.green }}>{agent.counts.open_support}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {showActiveOnly && !visibleAgents.length && <Empty text="No active accounts match the filter." />}
                    </div>
                  )}
                </Section>

                {showTools && (
                  <Section title="Admin Tools">
                    <div style={{ padding: 14 }}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Operational controls are intentionally separated from the monitoring dashboard.</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                        {data.agents.map(agent => (
                          <div key={agent.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{agent.agency_name}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{agent.owner_email}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                              <button onClick={() => handleToggleSuspend(agent)} style={toolButton()}>{agent.bot_active ? 'Suspend bot' : 'Unsuspend bot'}</button>
                              <button onClick={() => { setShowBalModal(agent.id); setNewBal('') }} style={toolButton()}>Edit legacy balance</button>
                              <button onClick={() => handleImpersonate(agent.id, agent.agency_name)} style={toolButton()}>Impersonate</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Section>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Section title="Failures & Attention">
                  <AttentionList data={data} agents={data.agents} />
                </Section>
                <Section title="Upcoming Visits">
                  {data.upcoming_visits.length === 0 ? <Empty text="No visits in the next 7 days." /> : (
                    <div style={{ padding: 10 }}>
                      {data.upcoming_visits.map(item => (
                        <SmallItem key={item.id} title={item.lead_name} meta={`${formatTime(item.scheduled_at)} - ${item.property_title}`} tone="normal" />
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          </>
        )}
      </main>

      {selected && <AgentDrawer agent={selected} onClose={() => setSelectedId(null)} onImpersonate={handleImpersonate} />}
      {showBalModal && <BalanceModal value={newBal} onChange={setNewBal} onCancel={() => { setShowBalModal(null); setNewBal('') }} onSave={() => handleUpdateBalance(showBalModal)} />}
    </div>
  )
}

function toolButton(): CSSProperties {
  return { padding: '7px 9px', border: `1px solid ${C.line}`, borderRadius: 7, background: '#FAFAFB', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: C.ink }
}

function SmallItem({ title, meta, tone = 'normal' }: { title: string; meta: string; tone?: 'normal' | 'bad' | 'warn' }) {
  const color = tone === 'bad' ? C.red : tone === 'warn' ? C.gold : C.ink
  return (
    <div style={{ padding: '9px 8px', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 12, color, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{meta}</div>
    </div>
  )
}

function AttentionList({ data, agents }: { data: OpsData; agents: AgentRow[] }) {
  const nameOf = (id?: string) => agents.find(a => a.id === id)?.agency_name || 'Unknown agency'
  const items = [
    ...data.attention.failed_messages.map((x: any) => ({ id: 'f-' + x.id, title: 'Failed send - ' + nameOf(x.agent_id), meta: x.reason || x.preview, tone: 'bad' as const })),
    ...data.attention.support_tickets.map((x: any) => ({ id: 't-' + x.id, title: 'Support ticket - ' + nameOf(x.agent_id), meta: x.subject, tone: 'warn' as const })),
    ...data.attention.support_chats.map((x: any) => ({ id: 'c-' + x.id, title: 'Support chat - ' + nameOf(x.agent_id), meta: x.preview, tone: 'warn' as const })),
    ...data.attention.knowledge_gaps.map((x: any) => ({ id: 'g-' + x.id, title: 'Knowledge gap - ' + nameOf(x.agent_id), meta: x.question, tone: 'warn' as const })),
    ...data.attention.bot_paused_leads.map((x: any) => ({ id: 'p-' + x.id, title: 'Bot paused lead - ' + nameOf(x.agent_id), meta: `${x.name} ${x.phone}`, tone: 'warn' as const })),
  ].slice(0, 14)
  if (!items.length) return <Empty text="No failures or support issues found." />
  return <div style={{ padding: 10 }}>{items.map(item => <SmallItem key={item.id} title={item.title} meta={item.meta} tone={item.tone} />)}</div>
}

function AgentDrawer({ agent, onClose, onImpersonate }: { agent: AgentRow; onClose: () => void; onImpersonate: (id: string, name: string) => void }) {
  const checks = [
    ['WhatsApp connected', agent.readiness_checks.whatsapp],
    ['Bot active', agent.readiness_checks.botActive],
    ['Has active property', agent.readiness_checks.hasProperty],
    ['Under 10 leads', agent.readiness_checks.underLeadLimit],
    ['Under 5 properties', agent.readiness_checks.underPropertyLimit],
    ['Under 100 AI messages', agent.readiness_checks.underAiLimit],
    ['No failed sends', agent.readiness_checks.noRecentFailures],
    ['No open support', agent.readiness_checks.noOpenSupport],
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(21,22,27,0.32)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', height: '100%', background: '#fff', boxShadow: '-12px 0 36px rgba(0,0,0,0.12)', overflowY: 'auto' }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{agent.agency_name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{agent.owner_name} - {agent.owner_email}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: C.soft, borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>x</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Pill status={agent.readiness} />
            <span style={{ fontSize: 12, color: C.muted }}>Joined {shortDate(agent.created_at)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <SmallItem title={agent.subscription_active ? 'Paid' : 'Free'} meta={agent.subscription_active ? 'Active subscription detected' : 'No active subscription'} />
            <SmallItem title={agent.wa_balance > 0 ? 'WA balance present' : 'No WA balance'} meta={`₹${agent.wa_balance.toFixed(2)} available`} />
          </div>
          <SmallItem title="Last activity" meta={formatTime(agent.last_activity_at)} />
          <SmallItem title="Support clicks" meta={`${agent.counts.support_clicks || 0} support touchpoints logged`} />
          <UsageBar label="Leads" used={agent.usage.leads.used} limit={agent.usage.leads.limit} />
          <UsageBar label="Properties" used={agent.usage.properties.used} limit={agent.usage.properties.limit} />
          <UsageBar label="AI messages" used={agent.usage.aiMessages.used} limit={agent.usage.aiMessages.limit} />

          <h3 style={drawerHeading()}>Readiness Checklist</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {checks.map(([label, ok]) => (
              <div key={String(label)} style={{ padding: '8px 9px', borderRadius: 8, background: ok ? '#E7F6EC' : '#FDECEA', color: ok ? C.green : C.red, fontSize: 11, fontWeight: 700 }}>
                {ok ? 'OK' : 'Fix'} - {label}
              </div>
            ))}
          </div>

          <h3 style={drawerHeading()}>Recent Leads</h3>
          {agent.recent_leads.length ? agent.recent_leads.map(l => <SmallItem key={l.id} title={l.name} meta={`${l.status} - score ${l.ai_score} - ${formatTime(l.last_message_at)}`} tone={l.bot_paused ? 'warn' : 'normal'} />) : <Empty text="No recent leads." />}

          <h3 style={drawerHeading()}>Failures</h3>
          {agent.recent_failures.length ? agent.recent_failures.map(f => <SmallItem key={f.id} title={f.reason} meta={f.preview || formatTime(f.at)} tone="bad" />) : <Empty text="No failed sends for this agent." />}

          <h3 style={drawerHeading()}>Recent Conversation</h3>
          {agent.recent_conversation.length ? agent.recent_conversation.map((m: any) => (
            <div key={m.id} style={{ padding: '9px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: m.sent_by === 'bot' ? '#F7F8FF' : '#fff', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: C.muted, marginBottom: 4 }}>
                <span>{m.sent_by === 'bot' ? 'Bot' : 'Lead'} · {m.direction}</span>
                <span>{formatTime(m.at)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.ink }}>{m.content || 'No content'}</div>
            </div>
          )) : <Empty text="No recent conversation loaded." />}

          <h3 style={drawerHeading()}>Conversation Flags</h3>
          {agent.conversation_flags.length ? agent.conversation_flags.map((flag: any, idx: number) => (
            <div key={`${flag.kind}-${idx}`} style={{ padding: '9px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#FFF8F3', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 12, color: C.red }}>{flag.kind.replace(/_/g, ' ')}</strong>
                <span style={{ fontSize: 11, color: C.muted }}>{formatTime(flag.at)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.ink, marginTop: 4 }}>{flag.detail}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{flag.preview}</div>
            </div>
          )) : <Empty text="No conversation flags found in the current window." />}

          <h3 style={drawerHeading()}>Upcoming Visits</h3>
          {agent.upcoming_visits.length ? agent.upcoming_visits.map(v => <SmallItem key={v.id} title={v.lead_name} meta={`${formatTime(v.scheduled_at)} - ${v.property_title}`} />) : <Empty text="No upcoming visits." />}

          <h3 style={drawerHeading()}>Support</h3>
          {agent.support_items.length ? agent.support_items.map(s => <SmallItem key={s.kind + s.id} title={s.title} meta={s.preview || formatTime(s.at)} tone="warn" />) : <Empty text="No support items." />}

          <button onClick={() => onImpersonate(agent.id, agent.agency_name)} style={{ marginTop: 16, width: '100%', padding: 11, borderRadius: 9, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer', fontWeight: 800 }}>Open Agent Dashboard</button>
        </div>
      </aside>
    </div>
  )
}

function drawerHeading(): CSSProperties {
  return { margin: '20px 0 10px', fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }
}

function BalanceModal({ value, onChange, onCancel, onSave }: any) {
  return (
    <Modal title="Set Legacy Balance" onCancel={onCancel} onSave={onSave}>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="e.g. 500" style={modalInput()} autoFocus />
    </Modal>
  )
}

function Modal({ title, children, onCancel, onSave }: any) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: C.ink }}>{title}</div>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, background: C.soft, border: 'none', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
          <button onClick={onSave} style={{ padding: '8px 16px', borderRadius: 8, background: C.ink, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function modalInput(): CSSProperties {
  return { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.line}`, outline: 'none' }
}
