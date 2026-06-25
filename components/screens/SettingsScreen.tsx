'use client'
import { useState, useEffect } from 'react'
import TwoFactorSettings from '@/components/TwoFactorSettings'
import ConnectWhatsAppButton from '@/components/ConnectWhatsAppButton'

interface Props {
  agentId: string
  agent?: any
}

export default function SettingsScreen({ agentId, agent: initialAgent }: Props) {
  const [agentData, setAgentData] = useState<any>(initialAgent || null)
  const [botActive, setBotActive] = useState(initialAgent ? !!initialAgent.bot_active : false)

  const [editModal, setEditModal] = useState<{ key: string; label: string; value: string; type: 'text' | 'select' | 'time-range' | 'tags' | 'day-select' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // PIN modal state
  const [pinPurpose, setPinPurpose] = useState<null | 'pause' | 'keepalive' | 'outreach'>(null)
  const [pendingIntensity, setPendingIntensity] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Set-new-PIN modal state
  const [showSetPin, setShowSetPin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')
  const [newPinError, setNewPinError] = useState('')
  const [newPinLoading, setNewPinLoading] = useState(false)

  const [keepAlive, setKeepAlive] = useState(true)
  const [lowBalanceAlert, setLowBalanceAlert] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ka = localStorage.getItem('leadnest_keepalive')
    const lb = localStorage.getItem('leadnest_lowbalance')
    if (ka !== null) setKeepAlive(ka === 'true')
    if (lb !== null) setLowBalanceAlert(lb === 'true')
  }, [])

  const fetchAgent = () => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) { setAgentData(d.data); setBotActive(!!d.data.bot_active) }
      })
  }

  useEffect(() => {
    if (!initialAgent) fetchAgent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const handleToggleBot = async () => {
    if (botActive) { setPinPurpose('pause'); setPinInput(''); setPinError(''); return }
    await executeToggle(true)
  }

  const executeToggle = async (newVal: boolean) => {
    setBotActive(newVal)
    try {
      await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: newVal })
      })
    } catch { setBotActive(!newVal) }
  }

  const toggleKeepAlive = () => {
    if (keepAlive) { setPinPurpose('keepalive'); setPinInput(''); setPinError(''); return }
    setKeepAlive(true); localStorage.setItem('leadnest_keepalive', 'true')
  }

  const toggleLowBalance = () => {
    const next = !lowBalanceAlert
    setLowBalanceAlert(next); localStorage.setItem('leadnest_lowbalance', String(next))
  }

  const requestIntensity = (level: string) => {
    if (level === (d?.outreach_intensity || 'persistent')) return
    setPendingIntensity(level); setPinPurpose('outreach'); setPinInput(''); setPinError('')
  }

  const applyIntensity = async (level: string) => {
    try {
      await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_intensity: level })
      })
      fetchAgent()
    } catch { /* ignore */ }
  }

  const handlePinSubmit = async () => {
    if (!pinInput) return
    setPinLoading(true); setPinError('')
    try {
      const res = await fetch(`/api/agent/pin?id=${agentId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      })
      const data = await res.json()
      if (!res.ok) { setPinError(data.error || 'Incorrect PIN'); return }
      const purpose = pinPurpose; const lvl = pendingIntensity
      setPinPurpose(null); setPinInput(''); setPinError(''); setPendingIntensity(null)
      if (purpose === 'pause') executeToggle(false)
      else if (purpose === 'keepalive') { setKeepAlive(false); localStorage.setItem('leadnest_keepalive', 'false') }
      else if (purpose === 'outreach' && lvl) applyIntensity(lvl)
      if (data.mustSetPin) setTimeout(() => { setShowSetPin(true); setNewPin(''); setNewPinConfirm(''); setNewPinError('') }, 300)
    } catch { setPinError('Network error. Please try again.') }
    finally { setPinLoading(false) }
  }

  const handleSetNewPin = async (e: React.FormEvent) => {
    e.preventDefault(); setNewPinError('')
    if (newPin.length < 4) { setNewPinError('PIN must be at least 4 characters.'); return }
    if (newPin !== newPinConfirm) { setNewPinError('PINs do not match.'); return }
    setNewPinLoading(true)
    try {
      const res = await fetch(`/api/agent/pin?id=${agentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: '1234', newPin })
      })
      const data = await res.json()
      if (!res.ok) { setNewPinError(data.error || 'Failed to set PIN'); return }
      setShowSetPin(false)
    } catch { setNewPinError('Network error. Please try again.') }
    finally { setNewPinLoading(false) }
  }

  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  const openEdit = (key: string, label: string, value: string, type: 'text' | 'select' | 'time-range' | 'tags' | 'day-select') => {
    setEditModal({ key, label, value, type }); setEditValue(value); setSaveMsg('')
  }

  const handleSaveEdit = async () => {
    if (!editModal) return
    setEditSaving(true)
    try {
      const body: any = {}
      if (editModal.key === 'office_hours') {
        const parts = editValue.split('\u2013').map((s: string) => s.trim())
        body.office_open = parts[0] || '09:00'; body.office_close = parts[1] || '19:00'
      } else if (editModal.key === 'areas' || editModal.key === 'languages') {
        body[editModal.key] = editValue.split(',').map((s: string) => s.trim()).filter(Boolean)
      } else if (editModal.key === 'weekly_off') {
        // '—' (no value) → empty string = open every day
        body.weekly_off = (editValue === '—' || editValue === 'None') ? '' : editValue
      } else { body[editModal.key] = editValue }
      const res = await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Save failed') }
      setSaveMsg('Saved \u2713')
      fetchAgent()
      setTimeout(() => { setEditModal(null); setSaveMsg('') }, 600)
    } catch (err: any) { setSaveMsg('\u26a0\ufe0f ' + err.message) }
    finally { setEditSaving(false) }
  }

  const d = agentData

  const accountRows = [
    { key: 'name', label: 'Contact name', value: d?.name || '\u2014', type: 'text' as const },
    { key: 'phone', label: 'WhatsApp number', value: d?.phone || '\u2014', type: 'text' as const, readOnly: true },
    { key: 'email', label: 'Email', value: d?.email || '\u2014', type: 'text' as const, readOnly: true },
  ]

  const rows = [
    { key: 'agency_name', label: 'Agency name', value: d?.agency_name || '\u2014', type: 'text' as const },
    { key: 'city', label: 'City', value: [d?.city, d?.state].filter(Boolean).join(', ') || '\u2014', type: 'text' as const },
    { key: 'office_address', label: 'Office address', value: d?.office_address || '\u2014', type: 'text' as const },
    { key: 'areas', label: 'Areas covered', value: Array.isArray(d?.areas) ? d.areas.join(', ') : '\u2014', type: 'tags' as const },
    { key: 'bot_tone', label: 'Bot tone', value: d?.bot_tone ? cap(d.bot_tone) : '\u2014', type: 'select' as const },
    { key: 'office_hours', label: 'Office hours', value: `${d?.office_open || '09:00'} \u2013 ${d?.office_close || '19:00'}`, type: 'time-range' as const },
    { key: 'weekly_off', label: 'Weekly off', value: d?.weekly_off || '\u2014', type: 'day-select' as const },
    { key: 'holidays', label: 'Holidays', value: d?.holidays || '\u2014', type: 'text' as const },
    { key: 'languages', label: 'Languages', value: Array.isArray(d?.languages) ? d.languages.map(cap).join(', ') : '\u2014', type: 'tags' as const },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 640 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 16 }}>Settings</div>

      {/* Account */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Account</div>
        {accountRows.map((row, i) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < accountRows.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#6B6860', maxWidth: 240, textAlign: 'right' }}>{d ? row.value : 'Loading...'}</span>
              {d && !(row as any).readOnly && <span onClick={() => openEdit(row.key, row.label, row.value, row.type)} style={{ fontSize: 11, color: '#1A5FA5', cursor: 'pointer', fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(26,95,165,0.2)', background: '#EEF4FC' }}>Edit</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Business Details */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Business details</div>
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
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Bot controls</div>
        {[
          { k: 'Bot active', v: 'Running on WhatsApp 24/7', on: botActive, action: handleToggleBot },
          { k: 'Manual mode auto-resume', v: 'If a lead stays quiet for 30 minutes, the bot takes over again automatically.', on: true, action: () => {} },
          { k: 'Low balance alerts', v: 'Notify at \u20b950 remaining', on: lowBalanceAlert, action: toggleLowBalance }
        ].map((row, i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</div>
              <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 1 }}>{row.v}</div>
            </div>
            <div onClick={row.k === 'Manual mode auto-resume' ? undefined : row.action} style={{ width: 36, height: 20, borderRadius: 20, background: row.on ? '#4F46E5' : '#ECEAE0', position: 'relative', cursor: row.k === 'Manual mode auto-resume' ? 'default' : 'pointer', flexShrink: 0, transition: 'background 0.2s', border: `1px solid ${row.on ? '#4F46E5' : 'rgba(26,25,22,0.18)'}`, opacity: row.k === 'Manual mode auto-resume' ? 0.9 : 1 }}>
              <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 2, left: row.on ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Outreach intensity */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 4 }}>Lead follow-up intensity</div>
        <div style={{ fontSize: 11.5, color: '#9E9B92', marginBottom: 14, lineHeight: 1.5 }}>How persistently the bot follows up with quiet leads. Higher intensity can improve conversion but may use more credits.</div>
        {(() => {
          const current = d?.outreach_intensity || 'persistent'
          const opts = [
            { k: 'gentle', label: 'Gentle', desc: 'Up to 3 reminders \u00b7 lowest spend' },
            { k: 'balanced', label: 'Balanced', desc: 'Up to 5 reminders' },
            { k: 'persistent', label: 'Persistent', desc: 'Up to 8 reminders \u00b7 best conversion' },
          ]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {opts.map(o => {
                const active = current === o.k
                return (
                  <div key={o.k} onClick={() => requestIntensity(o.k)} style={{ cursor: 'pointer', border: `1.5px solid ${active ? '#4F46E5' : 'rgba(26,25,22,0.14)'}`, background: active ? '#EEF0FE' : '#fff', borderRadius: 10, padding: '12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#4338CA' : '#15161B', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.label}{o.k === 'persistent' && <span style={{ fontSize: 9, fontWeight: 700, color: '#1B7A43', background: '#E7F6EC', padding: '1px 5px', borderRadius: 8 }}>DEFAULT</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#6B6860', marginTop: 4, lineHeight: 1.4 }}>{o.desc}</div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      <div style={{ fontSize: 11, color: '#7A5200', background: '#FEF9E7', border: '1px solid #F0D98C', borderRadius: 8, padding: '8px 12px', marginTop: 12, lineHeight: 1.5 }}>
        \ud83d\udca1 More persistent = more conversions but more credit spend. Changing this needs your PIN.
      </div>
    </div>

      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 4 }}>WhatsApp connection</div>
        <div style={{ fontSize: 11.5, color: '#9E9B92', marginBottom: 14, lineHeight: 1.5 }}>
          Connect your Meta WhatsApp Business number here. This turns the bot live on your own number.
        </div>
        {(d?.wa_verified || d?.wa_phone_number_id) ? (
          <div style={{ fontSize: 12, color: '#1B7A43', background: '#E7F6EC', border: '1px solid rgba(27,122,67,0.16)', borderRadius: 10, padding: '10px 12px', fontWeight: 500 }}>
            Connected and ready on Meta.
          </div>
        ) : (
          <ConnectWhatsAppButton agentId={agentId} onConnected={fetchAgent} />
        )}
      </div>

      {/* Subscription */}
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>Subscription</div>
        {[
          { k: 'Plan', v: (d?.plan ? d.plan.charAt(0).toUpperCase() + d.plan.slice(1) : 'Monthly') + ' \u2014 ' + (d?.plan === 'free' ? '\u20b90' : '\u20b9999') + '/month' },
          { k: 'Message usage', v: `${d?.messages_used ?? 0} / ${d?.messages_limit ?? 5000} this month` },
          { k: 'WhatsApp', v: (d?.wa_verified || d?.msg91_integrated_number || d?.phone) ? 'Connected \u2713' : 'Setup in progress \u2014 our team is on it' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 2 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
            <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</span>
            <span style={{ fontSize: 12, color: '#6B6860' }}>{d ? row.v : 'Loading...'}</span>
          </div>
        ))}
      </div>

      {/* PIN Modal */}
      {pinPurpose && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B', marginBottom: 6 }}>
              {pinPurpose === 'pause' ? 'Pause Bot' : pinPurpose === 'outreach' ? 'Change follow-up intensity' : 'Disable Keep-Alive'}
            </div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>
              {pinPurpose === 'pause' ? 'Enter your master PIN to pause the AI agent.'
                : pinPurpose === 'outreach' ? `Set follow-up to "${pendingIntensity}". Enter your master PIN to confirm.`
                : 'Disabling keep-alive may let WhatsApp windows expire. Enter your master PIN to confirm.'}
            </div>
            {pinError && <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>\u26a0\ufe0f {pinError}</div>}
            <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="Enter PIN" onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} autoFocus style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 12, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11, color: '#9E9B92', marginBottom: 14, lineHeight: 1.5 }}>
              Forgot your PIN? Email <a href="mailto:support@convorian.in?subject=PIN%20reset%20request" style={{ color: '#4F46E5', textDecoration: 'none' }}>support@convorian.in</a> — we verify your identity, then reset it.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setPinPurpose(null); setPinInput(''); setPinError('') }} disabled={pinLoading} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePinSubmit} disabled={pinLoading || !pinInput} style={{ padding: '8px 16px', borderRadius: 8, background: pinPurpose === 'outreach' ? '#4F46E5' : '#C0392B', color: '#fff', border: 'none', cursor: pinLoading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: pinLoading ? 0.7 : 1 }}>
                {pinLoading ? 'Verifying...' : pinPurpose === 'pause' ? 'Pause Bot' : pinPurpose === 'outreach' ? 'Confirm' : 'Disable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set New PIN modal */}
      {showSetPin && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleSetNewPin} style={{ background: '#fff', borderRadius: 16, padding: '28px 30px', width: 340, boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#15161B', marginBottom: 6 }}>Set your PIN</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20, lineHeight: 1.5 }}>You used the default PIN. Set a personal PIN now to secure sensitive actions.</div>
            {newPinError && <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>\u26a0\ufe0f {newPinError}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6B6860', marginBottom: 6 }}>New PIN (min. 4 characters)</label>
              <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="New PIN" autoFocus style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6B6860', marginBottom: 6 }}>Confirm new PIN</label>
              <input type="password" value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value)} placeholder="Confirm PIN" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowSetPin(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Skip for now</button>
              <button type="submit" disabled={newPinLoading} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: newPinLoading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: newPinLoading ? 0.7 : 1 }}>
                {newPinLoading ? 'Saving...' : 'Set PIN'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security: opt-in two-factor authentication */}
      <TwoFactorSettings />

      {/* Inline Edit Modal */}
      {editModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B' }}>Edit {editModal.label}</div>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>\u2715</button>
            </div>
            <div style={{ padding: '24px' }}>
              {editModal.type === 'select' ? (
                <select value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                  <option value="friendly">Friendly \u2014 warm, conversational, occasional emojis</option>
                  <option value="professional">Professional \u2014 formal and precise, no emojis</option>
                  <option value="concise">Concise \u2014 short and direct, maximum 2-3 sentences</option>
                </select>
              ) : editModal.type === 'day-select' ? (
                <div>
                  <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8 }}>The bot won't book site visits on this day.</div>
                  <select value={['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(editValue) ? editValue : ''} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    <option value="">No weekly off (open every day)</option>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              ) : editModal.type === 'time-range' ? (
                <div>
                  <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8 }}>Format: HH:MM \u2013 HH:MM (e.g. 09:00 \u2013 19:00)</div>
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="09:00 \u2013 19:00" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ) : editModal.type === 'tags' ? (
                <div>
                  <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 8 }}>Comma-separated values (e.g. Baner, Wakad, Hinjewadi)</div>
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Baner, Wakad, Hinjewadi" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ) : (
                <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} autoFocus />
              )}
              {saveMsg && <div style={{ marginTop: 10, fontSize: 12, color: saveMsg.startsWith('\u26a0') ? '#C0392B' : '#4338CA' }}>{saveMsg}</div>}
            </div>
            <div style={{ padding: '14px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10, borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setEditModal(null)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
