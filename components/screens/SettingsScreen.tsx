'use client'
import { useState, useEffect } from 'react'

interface Props {
  agentId: string
  agent?: any
}

export default function SettingsScreen({ agentId }: Props) {
  const [agentData, setAgentData] = useState<any>(null)
  const [botActive, setBotActive] = useState(false)

  // Inline edit modal state
  const [editModal, setEditModal] = useState<{ key: string; label: string; value: string; type: 'text' | 'select' | 'time-range' | 'tags' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  const fetchAgent = () => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setAgentData(d.data)
          setBotActive(!!d.data.bot_active)
        }
      })
  }

  useEffect(() => { fetchAgent() }, [agentId])

  const handleToggleBot = async () => {
    if (botActive) { setShowPinModal(true); return }
    await executeToggle(true)
  }

  const executeToggle = async (newVal: boolean) => {
    setBotActive(newVal)
    try {
      await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: newVal })
      })
    } catch { setBotActive(!newVal) }
  }

  const handlePinSubmit = () => {
    if (pinInput === '1234') {
      setShowPinModal(false); setPinInput('')
      executeToggle(false)
    } else {
      alert('Incorrect PIN'); setPinInput('')
    }
  }

  const openEdit = (key: string, label: string, value: string, type: 'text' | 'select' | 'time-range' | 'tags') => {
    setEditModal({ key, label, value, type })
    setEditValue(value)
    setSaveMsg('')
  }

  const handleSaveEdit = async () => {
    if (!editModal) return
    setEditSaving(true)
    try {
      const body: any = {}
      const keyMap: any = {
        'agency_name': 'agency_name',
        'city': 'city',
        'areas': 'areas',
        'bot_tone': 'bot_tone',
        'office_hours': null, // handled specially
        'languages': 'languages',
        'out_of_office_message': 'out_of_office_message'
      }

      if (editModal.key === 'office_hours') {
        const parts = editValue.split('–').map(s => s.trim())
        body.office_open = parts[0] || '09:00'
        body.office_close = parts[1] || '19:00'
      } else if (editModal.key === 'areas' || editModal.key === 'languages') {
        body[editModal.key] = editValue.split(',').map(s => s.trim()).filter(Boolean)
      } else {
        body[editModal.key] = editValue
      }

      const res = await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }
      setSaveMsg('Saved ✓')
      fetchAgent()
      setTimeout(() => { setEditModal(null); setSaveMsg('') }, 600)
    } catch (err: any) {
      setSaveMsg('⚠️ ' + err.message)
    } finally {
      setEditSaving(false)
    }
  }

  const d = agentData

  const rows = [
    { key: 'agency_name', label: 'Agency name', value: d?.agency_name || '—', type: 'text' as const },
    { key: 'city', label: 'City', value: [d?.city, d?.state].filter(Boolean).join(', ') || '—', type: 'text' as const },
    { key: 'areas', label: 'Areas covered', value: Array.isArray(d?.areas) ? d.areas.join(', ') : '—', type: 'tags' as const },
    { key: 'bot_tone', label: 'Bot tone', value: d?.bot_tone ? d.bot_tone.charAt(0).toUpperCase() + d.bot_tone.slice(1) : '—', type: 'select' as const },
    { key: 'office_hours', label: 'Office hours', value: `${d?.office_open || '09:00'} – ${d?.office_close || '19:00'}`, type: 'time-range' as const },
    { key: 'languages', label: 'Languages', value: Array.isArray(d?.languages) ? d.languages.join(', ') : '—', type: 'tags' as const },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 640 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>Settings</div>

      {/* Business Details */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Business details</div>
        {rows.map((row, i) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#6B6860', maxWidth: 240, textAlign: 'right' }}>{d ? row.value : 'Loading...'}</span>
              {d && <span onClick={() => openEdit(row.key, row.label, row.value, row.type)} style={{ fontSize: 11, color: '#1A5FA5', cursor: 'pointer', fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(26,95,165,0.2)', background: '#EEF4FC' }}>Edit</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Bot Controls */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Bot controls</div>
        {[
          { k: 'Bot active', v: 'Running on WhatsApp 24/7', on: botActive, action: handleToggleBot },
          { k: '23h window keep-alive', v: 'Auto re-engage before window closes', on: true, action: () => {} },
          { k: 'Low balance alerts', v: 'Notify at ₹50 remaining', on: true, action: () => {} }
        ].map((row, i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</div>
              <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 1 }}>{row.v}</div>
            </div>
            <div onClick={row.action} style={{ width: 36, height: 20, borderRadius: 20, background: row.on ? '#2E8B5F' : '#ECEAE0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', border: `1px solid ${row.on ? '#2E8B5F' : 'rgba(26,25,22,0.18)'}` }}>
              <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 2, left: row.on ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Subscription */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Subscription</div>
        {[
          { k: 'Plan', v: (d?.plan ? d.plan.charAt(0).toUpperCase() + d.plan.slice(1) : 'Monthly') + ' — ' + (d?.plan === 'free' ? '₹0' : '₹999') + '/month' },
          { k: 'Message usage', v: `${d?.messages_used ?? 0} / ${d?.messages_limit ?? 5000} this month` },
          { k: 'WhatsApp', v: d?.wa_verified ? 'Connected ✓' : 'Not connected — awaiting Meta API setup' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 2 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</span>
            <span style={{ fontSize: 12, color: '#6B6860' }}>{d ? row.v : 'Loading...'}</span>
          </div>
        ))}
      </div>

      {/* PIN Modal (bot toggle) */}
      {showPinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916', marginBottom: 6 }}>Pause Bot</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>Enter master PIN to pause the AI agent. Default: 1234.</div>
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="Enter PIN" onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} autoFocus style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePinSubmit} style={{ padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Pause Bot</button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Edit Modal */}
      {editModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>Edit {editModal.label}</div>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              {editModal.type === 'select' ? (
                <select value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                  <option value="friendly">Friendly — warm, conversational, occasional emojis</option>
                  <option value="professional">Professional — formal and precise, no emojis</option>
                  <option value="concise">Concise — short and direct, maximum 2-3 sentences</option>
                </select>
              ) : editModal.type === 'time-range' ? (
                <div>
                  <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8 }}>Format: HH:MM – HH:MM (e.g. 09:00 – 19:00)</div>
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="09:00 – 19:00" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ) : editModal.type === 'tags' ? (
                <div>
                  <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8 }}>Comma-separated values (e.g. Baner, Wakad, Hinjewadi)</div>
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Baner, Wakad, Hinjewadi" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ) : (
                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} autoFocus />
              )}
              {saveMsg && <div style={{ marginTop: 10, fontSize: 12, color: saveMsg.startsWith('⚠️') ? '#C0392B' : '#1A6B4A' }}>{saveMsg}</div>}
            </div>
            <div style={{ padding: '14px 24px', background: '#FAFAF7', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10, borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setEditModal(null)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving} style={{ padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
