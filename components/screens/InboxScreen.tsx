'use client'
import { useState, useEffect } from 'react'

interface Props { agentId: string }

const mockLeads = [
  { id: '1', name: 'Rahul Kumar', phone: '+91 98765 43210', preview: 'Can I see it this Saturday?', time: '2m', temperature: 'hot', score: 9, av: 'RK', bg: '#FDF0F0', c: '#8B1A1A', window: '6h left', warnWindow: false, intent: 'Buy', areas: 'Baner, Wakad', budget: '₹85L – ₹1Cr', timeline: 'Within 3 months' },
  { id: '2', name: 'Priya Sharma', phone: '+91 97654 32109', preview: 'What is the maintenance charge?', time: '18m', temperature: 'warm', score: 8, av: 'PS', bg: '#FEF9E7', c: '#7A5200', window: '14h left', warnWindow: false, intent: 'Buy', areas: 'Wakad', budget: '₹60L – ₹70L', timeline: 'Within 3 months' },
  { id: '3', name: 'Amit Mehta', phone: '+91 96543 21098', preview: 'Just exploring for now', time: '1h', temperature: 'cold', score: 4, av: 'AM', bg: '#EEF4FC', c: '#0F3D6E', window: '1h left', warnWindow: true, intent: 'Rent', areas: 'Kothrud', budget: '₹15K – ₹20K/mo', timeline: 'Exploring' },
  { id: '4', name: 'Sunita Joshi', phone: '+91 95432 10987', preview: 'Hi, interested in 2BHK rental', time: '3h', temperature: 'new', score: 6, av: 'SJ', bg: '#E8F5EE', c: '#0F4A2E', window: '21h left', warnWindow: false, intent: 'Rent', areas: 'Kothrud', budget: '₹18K – ₹22K/mo', timeline: 'Immediately' },
  { id: '5', name: 'Deepak Rao', phone: '+91 94321 09876', preview: 'Send me the floor plan', time: '5h', temperature: 'warm', score: 7, av: 'DR', bg: '#EEEDFE', c: '#3C3489', window: '5h left', warnWindow: true, intent: 'Buy', areas: 'Aundh', budget: '₹1Cr – ₹1.2Cr', timeline: 'Within 3 months' },
]

const mockMessages = [
  { id: 1, direction: 'outbound', content: 'Hello! Welcome to Rajesh Properties. Are you looking to Buy or Rent?', time: '10:02 AM', sent_by: 'bot' },
  { id: 2, direction: 'inbound', content: 'Buy. Looking for 3BHK in Baner area', time: '10:03 AM', sent_by: 'lead' },
  { id: 3, direction: 'outbound', content: 'Great choice! What is your approximate budget?', time: '10:03 AM', sent_by: 'bot' },
  { id: 4, direction: 'inbound', content: 'Around 90 lakhs, flexible by 5-10L', time: '10:05 AM', sent_by: 'lead' },
  { id: 5, direction: 'outbound', content: 'I have a beautiful east-facing 3BHK in Baner at ₹88L — 1,450 sqft with covered parking. Shall I share the details and photos?', time: '10:05 AM', sent_by: 'bot' },
  { id: 6, direction: 'inbound', content: 'Yes please! Can I see it this Saturday?', time: '10:08 AM', sent_by: 'lead' },
  { id: 7, direction: 'outbound', content: 'Absolutely! What works best — morning or afternoon?', time: '10:08 AM', sent_by: 'bot' },
]

const tempColors: Record<string, { bg: string; c: string; label: string }> = {
  hot: { bg: '#FDF0F0', c: '#8B1A1A', label: 'Hot' },
  warm: { bg: '#FEF9E7', c: '#7A5200', label: 'Warm' },
  cold: { bg: '#EEF4FC', c: '#0F3D6E', label: 'Cold' },
  new: { bg: '#E8F5EE', c: '#0F4A2E', label: 'New' },
}

export default function InboxScreen({ agentId }: Props) {
  const [selected, setSelected] = useState(mockLeads[0])
  const [isManual, setIsManual] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'profile' | 'matched' | 'activity'>('chat')
  const [filter, setFilter] = useState('all')
  const [msgInput, setMsgInput] = useState('')

  const tc = tempColors[selected.temperature] || tempColors.new

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left list */}
      <div style={{ width: 300, minWidth: 300, borderRight: '1px solid rgba(26,25,22,0.08)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(26,25,22,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 10 }}>Conversations</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['All', 'Hot', 'Unread'].map(f => (
              <span key={f} onClick={() => setFilter(f.toLowerCase())} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filter === f.toLowerCase() ? '#2E8B5F' : 'rgba(26,25,22,0.13)', color: filter === f.toLowerCase() ? '#1A6B4A' : '#6B6860', background: filter === f.toLowerCase() ? '#E8F5EE' : '#fff', fontWeight: filter === f.toLowerCase() ? 500 : 400, transition: 'all 0.15s' }}>{f}</span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {mockLeads.map(lead => {
            const t = tempColors[lead.temperature] || tempColors.new
            const isSel = selected.id === lead.id
            return (
              <div key={lead.id} onClick={() => setSelected(lead)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(26,25,22,0.06)', borderLeft: `2px solid ${isSel ? '#1A5FA5' : 'transparent'}`, background: isSel ? '#EEF4FC' : 'transparent', transition: 'all 0.15s' }}>
                <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: '50%', background: lead.bg, color: lead.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{lead.av}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>{lead.name}</div>
                  <div style={{ fontSize: 11, color: '#9E9B92', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{lead.preview}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: '#C8C5BC' }}>{lead.time}</span>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: t.bg, color: t.c }}>{t.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAF7' }}>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: selected.bg, color: selected.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{selected.av}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>{selected.name}</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 1 }}>{selected.phone}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: tc.bg, color: tc.c }}>⭐ {selected.score}/10</span>
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 500, background: selected.warnWindow ? '#FEF9E7' : '#E8F5EE', color: selected.warnWindow ? '#7A5200' : '#1A6B4A', border: `1px solid ${selected.warnWindow ? 'rgba(183,119,13,0.2)' : 'rgba(46,139,95,0.2)'}` }}>⏱ {selected.window}</span>
            <button onClick={() => setIsManual(!isManual)} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid', borderColor: isManual ? '#2E8B5F' : 'rgba(192,57,43,0.2)', background: isManual ? '#E8F5EE' : '#FDF0F0', color: isManual ? '#1A6B4A' : '#C0392B', fontWeight: 500, fontFamily: 'inherit' }}>{isManual ? 'Resume bot' : 'Take over'}</button>
            <button style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: 'none', background: '#1A1916', color: '#fff', fontWeight: 500, fontFamily: 'inherit' }}>Book visit</button>
          </div>
        </div>

        {/* Manual banner */}
        {isManual && (
          <div style={{ background: '#FEF9E7', borderBottom: '1px solid rgba(183,119,13,0.2)', padding: '7px 22px', fontSize: 12, color: '#7A5200', display: 'flex', alignItems: 'center', gap: 8 }}>
            👤 You are in manual mode — bot is paused on this conversation
            <button onClick={() => setIsManual(false)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(183,119,13,0.25)', background: '#fff', color: '#7A5200', fontFamily: 'inherit' }}>Resume bot</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ background: '#fff', borderBottom: '1px solid rgba(26,25,22,0.08)', padding: '0 22px', display: 'flex', flexShrink: 0 }}>
          {(['chat', 'profile', 'matched', 'activity'] as const).map(tab => (
            <div key={tab} onClick={() => setActiveTab(tab)} style={{ fontSize: 12, padding: '10px 14px', cursor: 'pointer', color: activeTab === tab ? '#1A5FA5' : '#9E9B92', borderBottom: `2px solid ${activeTab === tab ? '#1A5FA5' : 'transparent'}`, marginBottom: -1, fontWeight: activeTab === tab ? 500 : 400, textTransform: 'capitalize', transition: 'all 0.15s' }}>
              {tab === 'matched' ? 'Matched properties' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                {mockMessages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                    {msg.direction === 'outbound' && <div style={{ fontSize: 10, color: '#9E9B92', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>🤖 LeadNest bot</div>}
                    <div style={{ padding: '9px 13px', fontSize: 13, lineHeight: 1.5, maxWidth: '72%', background: msg.direction === 'outbound' ? '#1A1916' : '#fff', color: msg.direction === 'outbound' ? '#fff' : '#1A1916', borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', border: msg.direction === 'inbound' ? '1px solid rgba(26,25,22,0.08)' : 'none' }}>{msg.content}</div>
                    <div style={{ fontSize: 10, color: '#C8C5BC', marginTop: 3 }}>{msg.time}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(26,25,22,0.08)', background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <input value={msgInput} onChange={e => setMsgInput(e.target.value)} disabled={!isManual} placeholder={isManual ? 'Type your message...' : 'Take over to type manually...'} style={{ flex: 1, height: 38, border: '1px solid rgba(26,25,22,0.18)', borderRadius: 20, padding: '0 14px', fontSize: 13, background: isManual ? '#fff' : '#F4F3EE', color: '#1A1916', outline: 'none', fontFamily: 'inherit', opacity: isManual ? 1 : 0.6, cursor: isManual ? 'text' : 'not-allowed' }} />
                <button disabled={!isManual} style={{ width: 36, height: 36, borderRadius: '50%', background: isManual ? '#1A1916' : '#ECEAE0', border: 'none', cursor: isManual ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>➤</button>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {[
                { k: 'Looking for', v: selected.intent + ' — 3BHK' },
                { k: 'Areas preferred', v: selected.areas },
                { k: 'Budget', v: selected.budget },
                { k: 'Timeline', v: selected.timeline },
                { k: 'Lead source', v: 'WhatsApp inbound' },
                { k: 'First contact', v: '25 May 2026' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', borderBottom: '1px solid rgba(26,25,22,0.06)', gridColumn: 'span 1' }}>
                  <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>{row.k}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>{row.v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', gridColumn: 'span 2' }}>
                <span style={{ fontSize: 11, color: '#9E9B92', marginBottom: 3 }}>AI lead score</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#C0392B' }}>{selected.score} / 10 — {tempColors[selected.temperature]?.label} lead</span>
              </div>
            </div>
          )}

          {activeTab === 'matched' && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#9E9B92', marginBottom: 4 }}>3 properties matched to this lead</div>
              {[
                { icon: '🏢', name: '3BHK Apartment — Baner', detail: '1,450 sqft · East facing · Covered parking', price: '₹88L', match: true, bg: '#EEF4FC' },
                { icon: '🏠', name: '3BHK Villa — Wakad', detail: '1,800 sqft · Private garden · 2 parking', price: '₹95L', match: false, bg: '#E8F5EE' },
                { icon: '🏗', name: '3BHK Flat — Aundh', detail: '1,320 sqft · Gym + pool · New building', price: '₹92L', match: false, bg: '#FEF9E7' },
              ].map((p, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 9, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{p.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 2 }}>{p.detail}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1A5FA5' }}>{p.price}</div>
                    {p.match && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#E8F5EE', color: '#1A6B4A', marginTop: 3, display: 'inline-block' }}>Best match</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'activity' && (
            <div style={{ padding: '16px 20px' }}>
              {[
                { icon: '⭐', bg: '#FDF0F0', bc: 'rgba(192,57,43,0.2)', title: 'Marked as hot lead — AI score 9/10', sub: 'Today, 10:08 AM' },
                { icon: '📅', bg: '#E8F5EE', bc: 'rgba(46,139,95,0.2)', title: 'Site visit requested for Saturday', sub: 'Today, 10:08 AM' },
                { icon: '🤖', bg: '#EEF4FC', bc: 'rgba(26,95,165,0.2)', title: 'Property match shared — 3BHK Baner', sub: 'Today, 10:05 AM' },
                { icon: '💬', bg: '#fff', bc: 'rgba(26,25,22,0.13)', title: 'Discovery completed — budget, area, timeline captured', sub: 'Today, 10:05 AM' },
                { icon: '👤', bg: '#fff', bc: 'rgba(26,25,22,0.13)', title: 'Lead created — first message received', sub: 'Today, 10:02 AM' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
                  {i < 4 && <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 1, background: 'rgba(26,25,22,0.08)' }} />}
                  <div style={{ width: 30, height: 30, minWidth: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${item.bc}`, background: item.bg, flexShrink: 0, fontSize: 13 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1916', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#9E9B92' }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
