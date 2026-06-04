'use client'
import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'

interface Props { agentId: string }

const tempColors: Record<string, { bg: string; c: string; label: string }> = {
  hot: { bg: '#FDF0F0', c: '#8B1A1A', label: 'Hot' },
  warm: { bg: '#FEF9E7', c: '#7A5200', label: 'Warm' },
  cold: { bg: '#EEF4FC', c: '#0F3D6E', label: 'Cold' },
  new: { bg: '#E8F5EE', c: '#0F4A2E', label: 'New' },
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
  const [now, setNow] = useState(Date.now())

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Timer to force countdown re-render every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch functions
  const fetchLeads = () => {
    fetch('/api/leads?agent_id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setLeads(d.data)
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

  // Fetching Leads + WebSockets
  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 30000)

    const supabase = getSupabase()
    const channel = supabase.channel('inbox-leads-changes')
      .on('postgres', { event: '*', schema: 'public', table: 'leads', filter: `agent_id=eq.${agentId}` }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [agentId])

  // Fetching Messages + WebSockets
  useEffect(() => {
    if (!selected) return
    fetchMessages()
    const interval = setInterval(fetchMessages, 30000)

    const supabase = getSupabase()
    const channel = supabase.channel(`inbox-msgs-${selected.id}`)
      .on('postgres', { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${selected.id}` }, () => {
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      const params = new URLSearchParams()
      params.append('Body', inputContent)
      params.append('From', `whatsapp:${selected.phone}`)
      params.append('To', `whatsapp:+919999999999`) // Hits our dummy agent
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

  // Calculate 24h window
  let winState = { text: '24h window active', bg: '#E8F5EE', c: '#1A6B4A', b: 'rgba(46,139,95,0.2)' }
  if (selected) {
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
    const lastTimeStr = lastInbound ? lastInbound.created_at : selected.updated_at
    
    if (lastTimeStr) {
      const lastTime = new Date(lastTimeStr).getTime()
      const expiryTime = lastTime + (24 * 60 * 60 * 1000)
      const diffMs = expiryTime - now
      
      if (diffMs <= 0) {
        winState = { text: 'Window closed', bg: '#FDF0F0', c: '#C0392B', b: 'rgba(192,57,43,0.2)' }
      } else {
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000)
        const timeStr = hours > 0 ? `${hours}h ${mins}m ${secs}s left` : `${mins}m ${secs}s left`
        
        if (hours < 2) {
          winState = { text: `⏱ ${timeStr}`, bg: '#FEF9E7', c: '#7A5200', b: 'rgba(183,119,13,0.2)' }
        } else {
          winState = { text: `⏱ ${timeStr}`, bg: '#E8F5EE', c: '#1A6B4A', b: 'rgba(46,139,95,0.2)' }
        }
      }
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
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 10 }}>Conversations</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['All', 'Hot', 'Warm', 'Cold', 'Unread'].map(f => (
                <span key={f} onClick={() => setFilter(f.toLowerCase())} className="inbox-filter-btn" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filter === f.toLowerCase() ? '#2E8B5F' : 'rgba(26,25,22,0.13)', color: filter === f.toLowerCase() ? '#1A6B4A' : '#6B6860', background: filter === f.toLowerCase() ? '#E8F5EE' : '#fff', fontWeight: filter === f.toLowerCase() ? 500 : 400, transition: 'all 0.15s' }}>{f}</span>
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
              .map(lead => {
              const t = tempColors[lead.temperature] || tempColors.new
              const isSel = selected?.id === lead.id
              return (
                <div key={lead.id} onClick={() => setSelected(lead)} className="inbox-lead-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(26,25,22,0.06)', borderLeft: `2px solid ${isSel ? '#1A5FA5' : 'transparent'}`, background: isSel ? '#EEF4FC' : 'transparent', transition: 'all 0.15s' }}>
                  <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: '50%', background: t.bg, color: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{getInitials(lead.name || lead.phone)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>{lead.name || 'Unknown User'}</div>
                    <div style={{ fontSize: 11, color: '#9E9B92', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{lead.phone}</div>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAF7' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9B92', fontSize: 14 }}>Select a conversation to start</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: tc.bg, color: tc.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{getInitials(selected.name || selected.phone)}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>{selected.name || 'Unknown User'}</div>
                  <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 1 }}>{selected.phone}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: tc.bg, color: tc.c }}>⭐ {selected.ai_score || 0}/10</span>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 500, background: winState.bg, color: winState.c, border: `1px solid ${winState.b}` }}>{winState.text}</span>
                  <button className="inbox-btn" onClick={() => { setIsSimulating(!isSimulating); setIsManual(false); }} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid', borderColor: isSimulating ? '#1A5FA5' : 'rgba(26,95,165,0.2)', background: isSimulating ? '#EEF4FC' : '#F4F8FD', color: isSimulating ? '#1A5FA5' : '#4A88C6', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>{isSimulating ? 'Stop simulating' : 'Simulate lead'}</button>
                  <button className="inbox-btn" onClick={() => { setIsManual(!isManual); setIsSimulating(false); }} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid', borderColor: isManual ? '#2E8B5F' : 'rgba(192,57,43,0.2)', background: isManual ? '#E8F5EE' : '#FDF0F0', color: isManual ? '#1A6B4A' : '#C0392B', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>{isManual ? 'Resume bot' : 'Take over'}</button>
                  <button className="inbox-btn-dark" onClick={() => alert('Book visit modal would open here')} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: 'none', background: '#1A1916', color: '#fff', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}>Book visit</button>
                </div>
              </div>

              {/* Manual banner */}
              {isManual && (
                <div style={{ background: '#FEF9E7', borderBottom: '1px solid rgba(183,119,13,0.2)', padding: '7px 22px', fontSize: 12, color: '#7A5200', display: 'flex', alignItems: 'center', gap: 8 }}>
                  👤 You are in manual mode — bot is paused on this conversation. Messages sent here will go to their WhatsApp.
                  <button className="inbox-btn" onClick={() => setIsManual(false)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(183,119,13,0.25)', background: '#fff', color: '#7A5200', fontFamily: 'inherit', transition: 'all 0.15s' }}>Resume bot</button>
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
                          {msg.direction === 'outbound' && <div style={{ fontSize: 10, color: '#9E9B92', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>{msg.sent_by === 'bot' ? '🤖 LeadNest bot' : '👤 You'}</div>}
                          <div style={{ padding: '9px 13px', fontSize: 13, lineHeight: 1.5, maxWidth: '72%', background: msg.direction === 'outbound' ? (msg.sent_by === 'bot' ? '#1A1916' : '#2E8B5F') : '#fff', color: msg.direction === 'outbound' ? '#fff' : '#1A1916', borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', border: msg.direction === 'inbound' ? '1px solid rgba(26,25,22,0.08)' : 'none' }}>{msg.content}</div>
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
                        style={{ flex: 1, height: 38, border: '1px solid rgba(26,25,22,0.18)', borderRadius: 20, padding: '0 14px', fontSize: 13, background: (isManual || isSimulating) ? '#fff' : '#F4F3EE', color: '#1A1916', outline: 'none', fontFamily: 'inherit', opacity: (isManual || isSimulating) ? 1 : 0.6, cursor: (isManual || isSimulating) ? 'text' : 'not-allowed' }} 
                      />
                      <button 
                        onClick={() => {
                          if (isSimulating) handleSimulateLeadMessage()
                          else if (isManual) handleSendMessage()
                        }} 
                        className={(isManual || isSimulating) ? "inbox-btn-dark" : ""} 
                        disabled={!isManual && !isSimulating} 
                        style={{ width: 36, height: 36, borderRadius: '50%', background: (isManual || isSimulating) ? '#1A1916' : '#ECEAE0', color: (isManual || isSimulating) ? '#fff' : '#1A1916', border: 'none', cursor: (isManual || isSimulating) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, transition: 'all 0.15s' }}>➤</button>
                    </div>
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {[
                      { k: 'Looking for', v: (selected.intent || 'Unknown') + ' — ' + (selected.property_category || 'Any') },
                      { k: 'Areas preferred', v: (selected.preferred_areas || []).join(', ') || 'Not specified' },
                      { k: 'Budget', v: selected.budget_max ? `Up to ₹${selected.budget_max}` : 'Not specified' },
                      { k: 'Timeline', v: selected.timeline || 'Not specified' },
                      { k: 'Lead source', v: selected.source === 'whatsapp_inbound' ? 'WhatsApp inbound' : selected.source },
                      { k: 'First contact', v: new Date(selected.created_at).toLocaleDateString() },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', borderBottom: '1px solid rgba(26,25,22,0.06)', gridColumn: 'span 1' }}>
                        <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>{row.k}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>{row.v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>AI lead score</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#C0392B' }}>{selected.ai_score || 0} / 10 — {tc.label} lead</span>
                    </div>
                  </div>
                )}

                {activeTab === 'matched' && (
                  <div style={{ padding: '16px 20px', color: '#9E9B92', fontSize: 13 }}>Dynamic property matching coming soon...</div>
                )}
                {activeTab === 'activity' && (
                  <div style={{ padding: '16px 20px', color: '#9E9B92', fontSize: 13 }}>Dynamic activity log coming soon...</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
