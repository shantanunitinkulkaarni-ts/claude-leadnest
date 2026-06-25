'use client'
import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import ConnectWhatsAppButton from '@/components/ConnectWhatsAppButton'

interface Props { agentId: string }

const tempColors: Record<string, { bg: string; c: string; label: string }> = {
  hot: { bg: '#FDF0F0', c: '#8B1A1A', label: 'Hot' },
  warm: { bg: '#FEF9E7', c: '#7A5200', label: 'Warm' },
  cold: { bg: '#EEF4FC', c: '#0F3D6E', label: 'Cold' },
  new: { bg: '#EEF0FE', c: '#0F4A2E', label: 'New' },
}

export default function InboxScreen({ agentId }: Props) {
  const [leads, setLeads] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  
  const [isManual, setIsManual] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)

  const [activeTab, setActiveTab] = useState<'chat' | 'profile' | 'matched' | 'activity'>('chat')
  const [filter, setFilter] = useState('all')
  const [msgInput, setMsgInput] = useState('')
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [sendLoading, setSendLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [properties, setProperties] = useState<any[]>([])
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [agent, setAgent] = useState<any>(null)

  // Book Visit modal
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookDate, setBookDate] = useState('')
  const [bookTime, setBookTime] = useState('11:00')
  const [bookPropertyId, setBookPropertyId] = useState('')
  const [bookSubmitting, setBookSubmitting] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const openBookModal = () => {
    if (!selected) return
    // Default to tomorrow's date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yyyy = tomorrow.getFullYear()
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
    const dd = String(tomorrow.getDate()).padStart(2, '0')
    setBookDate(`${yyyy}-${mm}-${dd}`)
    setBookTime('11:00')
    setBookPropertyId('')
    setBookError(null)
    setShowBookModal(true)
  }

  const handleBookVisit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setBookSubmitting(true)
    setBookError(null)
    // Combine the chosen local date + time into an ISO timestamp
    const scheduled = new Date(`${bookDate}T${bookTime}`)
    if (isNaN(scheduled.getTime())) {
      setBookError('Please select a valid date and time.')
      setBookSubmitting(false)
      return
    }
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: selected.id,
          property_id: bookPropertyId || null,
          scheduled_at: scheduled.toISOString(),
          status: 'upcoming'
        })
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setShowBookModal(false)
        fetchLeads()
      } else {
        setBookError(d.error || 'Failed to book visit.')
      }
    } catch (err: any) {
      setBookError(err.message || 'Failed to book visit.')
    } finally {
      setBookSubmitting(false)
    }
  }

  // Timer to force countdown re-render every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleToggleManualMode = async (forceResume = false) => {
    if (!selected) return
    const newState = forceResume ? false : !isManual
    setIsManual(newState)
    setIsSimulating(false)
    
    try {
      await fetch(`/api/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, bot_paused: newState })
      })
      fetchLeads()
    } catch (err) {
      console.error('Failed to update manual mode', err)
    }
  }

  // Fetch functions
  const fetchLeads = () => {
    fetch('/api/leads?agent_id=' + agentId)
      .then(async r => {
        const d = await r.json()
        if (d.data) {
          setLeads(d.data)
          setLoadingLeads(false)
        } else {
          setLoadingLeads(false)
        }
      })
      .catch(() => setLoadingLeads(false))
  }

  const fetchMessages = () => {
    if (!selected) return
    fetch('/api/messages?lead_id=' + selected.id)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setMessages(prev => {
            if (prev.length !== d.data.length) return d.data
            return prev
          })
        }
      })
  }

  const fetchProperties = () => {
    fetch('/api/properties?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => { if (d.data) setProperties(d.data) })
  }

  const fetchAppointments = () => {
    fetch('/api/appointments?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => { if (d.data) setAppointments(d.data) })
      .catch(() => {})
  }

  const fetchAgent = () => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => { if (d.data) setAgent(d.data) })
      .catch(() => {})
  }

  // One-glance highlight for a conversation — the single most important fact.
  const getHighlight = (lead: any): { text: string; bg: string; c: string } | null => {
    const appt = appointments.find(a => a.lead_id === lead.id && a.status === 'upcoming')
    if (appt) {
      const dt = new Date(appt.scheduled_at)
      const when = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
      return { text: `📅 Visit booked — ${when}`, bg: '#E7F6EC', c: '#1B7A43' }
    }
    if (lead.post_visit_result) return { text: '🏁 Visited — close the deal', bg: '#EEF0FE', c: '#4338CA' }
    if (lead.timeline === 'immediately' || lead.timeline === 'urgent') return { text: '⚡ Urgent — wants to move now', bg: '#FDF0F0', c: '#8B1A1A' }
    if ((lead.ai_score || 0) >= 8) return { text: '🔥 Hot lead — push for a visit', bg: '#FDF0F0', c: '#8B1A1A' }
    if (lead.status === 'qualified') return { text: `✓ Qualified${lead.budget_max ? ` — up to ₹${Number(lead.budget_max).toLocaleString('en-IN')}` : ''}`, bg: '#FEF9E7', c: '#7A5200' }
    if (lead.bot_paused) return { text: '👤 Manual mode — you\'re handling this', bg: '#FEF9E7', c: '#7A5200' }
    return null
  }

  const fetchActivity = (leadId: string) => {
    fetch('/api/activity?lead_id=' + leadId)
      .then(r => r.json())
      .then(d => { if (d.data) setActivityLog(d.data) })
  }

  // Fetching Leads + Properties + WebSockets
  useEffect(() => {
    fetchLeads()
    fetchAgent()
    fetchProperties()
    fetchAppointments()
    const interval = setInterval(() => { fetchLeads(); fetchAppointments(); fetchAgent() }, 30000)

    const supabase = getSupabase()
    const channel = supabase.channel('inbox-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `agent_id=eq.${agentId}` }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [agentId])

  // Fetching Messages + Activity + WebSockets
  // Keep the Manual/Auto toggle in sync with the lead's SAVED state, so the
  // button never shows "Auto" while the bot is actually paused in the DB.
  useEffect(() => {
    setIsManual(!!selected?.bot_paused)
  }, [selected])

  useEffect(() => {
    if (!selected) return
    fetchMessages()
    fetchActivity(selected.id)
    setActivityLog([])
    const interval = setInterval(fetchMessages, 8000)

    const supabase = getSupabase()
    const channel = supabase.channel(`inbox-msgs-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${selected.id}` }, () => {
        fetchMessages()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [selected?.id])

  // Initial selection logic
  useEffect(() => {
    if (leads.length > 0 && !selected) {
      setSelected(leads[0])
    }
  }, [leads, selected])

  // Global search → open a specific lead in the inbox.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail
      const match = leads.find(l => l.id === id)
      if (match) { setSelected(match); setActiveTab('chat') }
      else fetch('/api/leads?agent_id=' + agentId).then(r => r.json()).then(d => {
        const m = (d.data || []).find((l: any) => l.id === id)
        if (m) { setLeads(d.data); setSelected(m); setActiveTab('chat') }
      }).catch(() => {})
    }
    window.addEventListener('convorian:open-lead', handler as EventListener)
    return () => window.removeEventListener('convorian:open-lead', handler as EventListener)
  }, [leads, agentId])

  // Auto-scroll on new messages…
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  // …and when returning to the chat tab (it remounts at the top otherwise).
  useEffect(() => {
    if (activeTab === 'chat') {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }))
    }
  }, [activeTab, selected?.id])

  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selected) return
    
    // Optimistic UI update
    const optimisticMsg = {
      id: Date.now(),
      direction: 'outbound',
      content: msgInput,
      created_at: new Date().toISOString(),
      sent_by: 'agent'
    }
    setMessages(prev => [...prev, optimisticMsg])
    const inputContent = msgInput
    setMsgInput('')

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: selected.id,
          phone: selected.phone,
          content: inputContent
        })
      })
      const { data } = await res.json()
      if (data) {
        setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? data : m))
      }
    } catch (e) {
      console.error('Failed to send message:', e)
    }
  }

  const handleSimulateLeadMessage = async () => {
    if (!msgInput.trim() || !selected) return
    
    // Optimistic UI update
    const optimisticMsg = {
      id: Date.now(),
      direction: 'inbound',
      content: msgInput,
      created_at: new Date().toISOString(),
      sent_by: 'lead'
    }
    setMessages(prev => [...prev, optimisticMsg])
    const inputContent = msgInput
    setMsgInput('')

    try {
      const agentRes = await fetch(`/api/agent?id=${agentId}`)
      const agentData = await agentRes.json()
      const toPhone = agentData.data?.phone || '+919999999999'

      const params = new URLSearchParams()
      params.append('Body', inputContent)
      params.append('From', `whatsapp:${selected.phone}`)
      params.append('To', `whatsapp:${toPhone}`) // Hits our real agent
      params.append('AgentId', agentId)

      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      if (res.ok) {
        setTimeout(fetchMessages, 1500)
        setTimeout(fetchMessages, 3000)
      }
    } catch (e) {
      console.error('Failed to simulate lead message:', e)
    }
  }

  // Format Helpers
  const formatTime = (isoString: string) => {
    if (!isoString) return ''
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const getInitials = (name: string) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  const tc = selected ? (tempColors[selected.temperature] || tempColors.new) : tempColors.new

  let resumeCountdown: { text: string; state: 'countdown' | 'resuming' } | null = null
  if (selected?.bot_paused) {
    const baseTime = new Date(selected.last_message_at || selected.updated_at || selected.created_at).getTime()
    const diffMs = (baseTime + 30 * 60 * 1000) - now
    if (diffMs <= 0) {
      resumeCountdown = { text: 'Resuming automatically...', state: 'resuming' }
    } else {
      const mins = Math.floor(diffMs / (1000 * 60))
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000)
      resumeCountdown = { text: `Bot resumes in ${mins}:${String(secs).padStart(2, '0')}`, state: 'countdown' }
    }
  }

  return (
    <>
      <style>{`
        .inbox-filter-btn:hover { filter: brightness(0.95); }
        .inbox-lead-item:hover { background-color: #F4F3EE !important; }
        .inbox-tab:hover { color: #1A5FA5 !important; }
        .inbox-btn:hover { filter: brightness(0.9); }
        .inbox-btn-dark:hover { background-color: #333 !important; }
      `}</style>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* Left list */}
        <div style={{ width: 300, minWidth: 300, borderRight: '1px solid rgba(26,25,22,0.08)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(26,25,22,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 10 }}>Conversations</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['All', 'Hot', 'Warm', 'Cold', 'Unread'].map(f => (
                <span key={f} onClick={() => setFilter(f.toLowerCase())} className="inbox-filter-btn" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filter === f.toLowerCase() ? '#4F46E5' : 'rgba(26,25,22,0.13)', color: filter === f.toLowerCase() ? '#4338CA' : '#6B6860', background: filter === f.toLowerCase() ? '#EEF0FE' : '#fff', fontWeight: filter === f.toLowerCase() ? 500 : 400, transition: 'all 0.15s' }}>{f}</span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingLeads && <div style={{ padding: 20, fontSize: 13, color: '#9E9B92', textAlign: 'center' }}>Loading leads...</div>}
            {!loadingLeads && leads.length === 0 && <div style={{ padding: 20, fontSize: 13, color: '#9E9B92', textAlign: 'center' }}>No leads yet.</div>}
            
            {leads
              .filter(l => {
                if (filter === 'all') return true
                if (filter === 'hot') return l.temperature === 'hot' || l.ai_score >= 8
                if (filter === 'warm') return l.temperature === 'warm' || (l.ai_score >= 4 && l.ai_score < 8)
                if (filter === 'cold') return l.temperature === 'cold' || (l.ai_score > 0 && l.ai_score < 4)
                if (filter === 'unread') return true // placeholder for unread
                return true
              })
              // Hottest first: rank by temperature, then AI score, then recency.
              .slice()
              .sort((a, b) => {
                const rank = (l: any) => {
                  const t = l.temperature
                  if (t === 'hot' || l.ai_score >= 8) return 0
                  if (t === 'warm' || l.ai_score >= 4) return 1
                  if (t === 'cold') return 3
                  return 2 // 'new'/unknown sits above cold
                }
                const r = rank(a) - rank(b)
                if (r !== 0) return r
                const s = (b.ai_score || 0) - (a.ai_score || 0)
                if (s !== 0) return s
                return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
              })
              .map(lead => {
              const t = tempColors[lead.temperature] || tempColors.new
              const isSel = selected?.id === lead.id
              return (
                <div key={lead.id} onClick={() => setSelected(lead)} className="inbox-lead-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(26,25,22,0.06)', borderLeft: `2px solid ${isSel ? '#1A5FA5' : 'transparent'}`, background: isSel ? '#EEF4FC' : 'transparent', transition: 'all 0.15s' }}>
                  <div style={{ position: 'relative', width: 36, height: 36, minWidth: 36 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.bg, color: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{getInitials(lead.name || lead.phone)}</div>
                    <span title={lead.health === 'fallback' ? 'Last reply was a fallback — AI may have stalled' : lead.health === 'pending_confirmation' ? 'Waiting on lead to confirm a site visit time' : 'Conversation healthy'} style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', border: '1.5px solid #fff', background: lead.health === 'fallback' ? '#D64545' : lead.health === 'pending_confirmation' ? '#E0A823' : '#3DA35D' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>{lead.name || 'Unknown User'}</div>
                    {(() => {
                      const h = getHighlight(lead)
                      return h
                        ? <div style={{ fontSize: 10.5, fontWeight: 600, color: h.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{h.text}</div>
                        : <div style={{ fontSize: 11, color: '#9E9B92', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{lead.phone}</div>
                    })()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: '#C8C5BC' }}>{formatTime(lead.updated_at)}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: t.bg, color: t.c }}>{t.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFB' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9B92', fontSize: 14 }}>Select a conversation to start</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: tc.bg, color: tc.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{getInitials(selected.name || selected.phone)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selected.name || 'Unknown User'}
                    {(() => {
                      const h = getHighlight(selected)
                      return h ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: h.bg, color: h.c, whiteSpace: 'nowrap' }}>{h.text}</span> : null
                    })()}
                  </div>
                  <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 1 }}>{selected.phone}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: tc.bg, color: tc.c }}>⭐ {selected.ai_score || 0}/10</span>
                  {(agent?.wa_verified || agent?.phone_number_id || agent?.waba_id) ? (
                    <span style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, fontWeight: 600, background: '#E7F6EC', color: '#1B7A43', border: '1px solid rgba(27,122,67,0.16)' }}>
                      WhatsApp connected
                    </span>
                  ) : (
                    <div style={{ minWidth: 170 }}>
                      <ConnectWhatsAppButton agentId={agentId} onConnected={fetchAgent} />
                    </div>
                  )}
                  <button className="inbox-btn" onClick={() => { setIsSimulating(!isSimulating); }} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid', borderColor: isSimulating ? '#1A5FA5' : 'rgba(26,95,165,0.2)', background: isSimulating ? '#EEF4FC' : '#F4F8FD', color: isSimulating ? '#1A5FA5' : '#4A88C6', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>{isSimulating ? 'Stop simulating' : 'Simulate lead'}</button>
                  <button className="inbox-btn" onClick={() => handleToggleManualMode(false)} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid', borderColor: isManual ? '#4F46E5' : 'rgba(192,57,43,0.2)', background: isManual ? '#EEF0FE' : '#FDF0F0', color: isManual ? '#4338CA' : '#C0392B', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>{isManual ? 'Resume bot' : 'Take over'}</button>
                  <button className="inbox-btn-dark" onClick={openBookModal} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: 'none', background: '#15161B', color: '#fff', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>Book visit</button>
                </div>
              </div>

              {/* Manual banner */}
              {isManual && (
                <div style={{ background: '#FEF9E7', borderBottom: '1px solid rgba(183,119,13,0.2)', padding: '7px 22px', fontSize: 12, color: '#7A5200', display: 'flex', alignItems: 'center', gap: 8 }}>
                  👤 You are in manual mode — bot is paused on this conversation. Messages sent here will go to their WhatsApp.
                  {resumeCountdown && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: resumeCountdown.state === 'resuming' ? '#EEF0FE' : '#fff7dc', color: resumeCountdown.state === 'resuming' ? '#4338CA' : '#7A5200', border: `1px solid ${resumeCountdown.state === 'resuming' ? 'rgba(79,70,229,0.2)' : 'rgba(183,119,13,0.2)'}` }}>
                      {resumeCountdown.text}
                    </span>
                  )}
                  <button className="inbox-btn" onClick={() => handleToggleManualMode(true)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(183,119,13,0.25)', background: '#fff', color: '#7A5200', fontFamily: 'inherit', transition: 'all 0.15s' }}>Resume bot</button>
                </div>
              )}
              {isSimulating && (
                <div style={{ background: '#EEF4FC', borderBottom: '1px solid rgba(26,95,165,0.2)', padding: '7px 22px', fontSize: 12, color: '#1A5FA5', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🧑‍💻 You are Simulating the Lead. Messages sent here will instantly trigger the AI bot.
                  <button className="inbox-btn" onClick={() => setIsSimulating(false)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(26,95,165,0.25)', background: '#fff', color: '#1A5FA5', fontFamily: 'inherit', transition: 'all 0.15s' }}>Stop simulating</button>
                </div>
              )}

              {/* Tabs */}
              <div style={{ background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)', padding: '0 22px', display: 'flex', flexShrink: 0 }}>
                {(['chat', 'profile', 'matched', 'activity'] as const).map(tab => (
                  <div key={tab} className="inbox-tab" onClick={() => setActiveTab(tab)} style={{ fontSize: 12, padding: '10px 14px', cursor: 'pointer', color: activeTab === tab ? '#1A5FA5' : '#9E9B92', borderBottom: `2px solid ${activeTab === tab ? '#1A5FA5' : 'transparent'}`, marginBottom: -1, fontWeight: activeTab === tab ? 500 : 400, textTransform: 'capitalize', transition: 'all 0.15s' }}>
                    {tab === 'matched' ? 'Matched properties' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </div>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                      {messages.length === 0 && <div style={{ textAlign: 'center', color: '#9E9B92', fontSize: 13, marginTop: 20 }}>No messages yet.</div>}
                      {messages.map(msg => (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                          {msg.direction === 'outbound' && <div style={{ fontSize: 10, color: '#9E9B92', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>{msg.sent_by === 'bot' ? '🤖 Convorian bot' : '👤 You'}</div>}
                          <div style={{ padding: '9px 13px', fontSize: 13, lineHeight: 1.5, maxWidth: '72%', background: msg.direction === 'outbound' ? (msg.sent_by === 'bot' ? '#15161B' : '#4F46E5') : '#fff', color: msg.direction === 'outbound' ? '#fff' : '#15161B', borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', border: msg.direction === 'inbound' ? '1px solid rgba(26,25,22,0.08)' : 'none' }}>{msg.content}</div>
                          <div style={{ fontSize: 10, color: '#C8C5BC', marginTop: 3 }}>{formatTime(msg.created_at)}</div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(26,25,22,0.08)', background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <input 
                        value={msgInput} 
                        onChange={e => setMsgInput(e.target.value)} 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (isSimulating) handleSimulateLeadMessage()
                            else if (isManual) handleSendMessage()
                          }
                        }}
                        disabled={!isManual && !isSimulating} 
                        placeholder={isSimulating ? 'Type a message from the lead...' : (isManual ? 'Type your message and press Enter...' : 'Take over or simulate to type...')} 
                        style={{ flex: 1, height: 38, border: '1px solid rgba(26,25,22,0.18)', borderRadius: 20, padding: '0 14px', fontSize: 13, background: (isManual || isSimulating) ? '#fff' : '#F4F3EE', color: '#15161B', outline: 'none', fontFamily: 'inherit', opacity: (isManual || isSimulating) ? 1 : 0.6, cursor: (isManual || isSimulating) ? 'text' : 'not-allowed' }} 
                      />
                      <button 
                        onClick={() => {
                          if (isSimulating) handleSimulateLeadMessage()
                          else if (isManual) handleSendMessage()
                        }} 
                        className={(isManual || isSimulating) ? "inbox-btn-dark" : ""} 
                        disabled={!isManual && !isSimulating} 
                        style={{ width: 36, height: 36, borderRadius: '50%', background: (isManual || isSimulating) ? '#15161B' : '#ECEAE0', color: (isManual || isSimulating) ? '#fff' : '#15161B', border: 'none', cursor: (isManual || isSimulating) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, transition: 'all 0.15s' }}>➤</button>
                    </div>
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {[
                      { k: 'Looking for', v: (selected.intent || 'Unknown') + ' — ' + (selected.property_category || 'Any') },
                      { k: 'Areas preferred', v: (selected.preferred_areas || []).join(', ') || 'Not specified' },
                      { k: 'Budget', v: selected.budget_max ? `Up to ₹${Number(selected.budget_max).toLocaleString('en-IN')}${selected.intent === 'rent' ? '/mo' : ''}` : 'Not specified' },
                      { k: 'Timeline', v: selected.timeline || 'Not specified' },
                      { k: 'Lead source', v: selected.source === 'whatsapp_inbound' ? 'WhatsApp inbound' : selected.source },
                      { k: 'First contact', v: new Date(selected.created_at).toLocaleDateString() },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', borderBottom: '1px solid rgba(26,25,22,0.06)', gridColumn: 'span 1' }}>
                        <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>{row.k}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>{row.v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>AI lead score</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#C0392B' }}>{selected.ai_score || 0} / 10 — {tc.label} lead</span>
                    </div>
                  </div>
                )}

                {activeTab === 'matched' && (
                  <div style={{ padding: '16px 20px' }}>
                    {(() => {
                      const matchedProps = properties.filter(p => {
                        if (p.status !== 'active') return false
                        if (selected.intent === 'buy' && p.type === 'rental') return false
                        if (selected.intent === 'rent' && p.type === 'sale') return false
                        const propPrice = p.type === 'rental' ? p.rent_per_month : p.price
                        if (selected.budget_max && propPrice && propPrice > selected.budget_max * 1.2) return false
                        return true
                      })
                      if (matchedProps.length === 0) return (
                        <div style={{ color: '#9E9B92', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
                          No matching properties yet. Add properties in the Properties tab.
                        </div>
                      )
                      return matchedProps.map((p: any) => (
                        <div key={p.id} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>{p.title}</div>
                          <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 2 }}>{p.location}, {p.city}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A5FA5' }}>₹{(p.price || p.rent_per_month || 0).toLocaleString('en-IN')}{p.type === 'rental' ? '/mo' : ''}</span>
                            {p.bhk && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: '#F4F3EE', color: '#6B6860' }}>{p.bhk}</span>}
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: p.type === 'sale' ? '#EEF4FC' : '#FEF9E7', color: p.type === 'sale' ? '#1A5FA5' : '#B7770D', textTransform: 'capitalize' }}>{p.type}</span>
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                )}
                {activeTab === 'activity' && (
                  <div style={{ padding: '16px 20px' }}>
                    {activityLog.length === 0 ? (
                      <div style={{ color: '#9E9B92', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No activity yet for this lead.</div>
                    ) : activityLog.map((a: any) => (
                      <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid rgba(26,25,22,0.06)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5', marginTop: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>{a.title}</div>
                          {a.description && <div style={{ fontSize: 11, color: '#6B6860', marginTop: 2 }}>{a.description}</div>}
                          <div style={{ fontSize: 10, color: '#C8C5BC', marginTop: 4 }}>{new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Book Visit Modal */}
      {showBookModal && selected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleBookVisit} style={{ background: '#fff', borderRadius: 16, width: 'min(420px, calc(100vw - 32px))', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Book Site Visit</div>
              <button type="button" onClick={() => setShowBookModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: '#6B6860' }}>
                Scheduling a visit for <strong>{selected.name || selected.phone}</strong>.
              </div>

              {bookError && (
                <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                  ⚠️ {bookError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Date</label>
                  <input required type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Time</label>
                  <input required type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Property (optional)</label>
                <select value={bookPropertyId} onChange={e => setBookPropertyId(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                  <option value="">No specific property</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              <button type="button" onClick={() => setShowBookModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={bookSubmitting} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: bookSubmitting ? 0.7 : 1 }}>{bookSubmitting ? 'Booking...' : 'Book Visit'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
