'use client'
import { useState, useEffect } from 'react'

interface Props {
  agentId: string
  agent?: any
}

export default function SettingsScreen({ agentId }: Props) {
  const [agentData, setAgentData] = useState<any>(null)
  const [botActive, setBotActive] = useState(false)
  const [keepAlive, setKeepAlive] = useState(true)
  const [lowBalAlert, setLowBalAlert] = useState(true)

  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')

  // Initialize with empty or loading states
  const [businessDetails, setBusinessDetails] = useState([
    { k: 'Agency name', v: 'Loading...' },
    { k: 'City', v: 'Loading...' },
    { k: 'Areas covered', v: 'Loading...' },
    { k: 'Bot tone', v: 'Loading...' },
    { k: 'Office hours', v: 'Loading...' },
    { k: 'Language', v: 'Loading...' }
  ])

  useEffect(() => {
    fetch('/api/agent?id=' + agentId)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setAgentData(d.data)
          setBotActive(!!d.data.bot_active)
          setBusinessDetails([
            { k: 'Agency name', v: d.data.agency_name || 'Not set' },
            { k: 'City', v: [d.data.city, d.data.state].filter(Boolean).join(', ') || 'Not set' },
            { k: 'Areas covered', v: Array.isArray(d.data.areas) ? d.data.areas.join(', ') : 'Not set' },
            { k: 'Bot tone', v: d.data.bot_tone ? d.data.bot_tone.charAt(0).toUpperCase() + d.data.bot_tone.slice(1) : 'Professional' },
            { k: 'Office hours', v: `${d.data.office_open || '09:00'} – ${d.data.office_close || '19:00'}` },
            { k: 'Language', v: Array.isArray(d.data.languages) ? d.data.languages.join(', ') : 'English' }
          ])
        }
      })
  }, [agentId])

  const handleToggleBot = async () => {
    // Require PIN to turn off
    if (botActive) {
      setShowPinModal(true)
      return
    }
    await executeToggle(true)
  }

  const executeToggle = async (newVal: boolean) => {
    setBotActive(newVal) // Optimistic update
    try {
      await fetch('/api/agent?id=' + agentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: newVal })
      })
    } catch(err) {
      console.error(err)
      setBotActive(!newVal) // Revert on failure
    }
  }

  const handlePinSubmit = () => {
    if (pinInput === '1234') {
      setShowPinModal(false)
      setPinInput('')
      executeToggle(false)
    } else {
      alert('Incorrect PIN')
      setPinInput('')
    }
  }

  const handleEditDetail = async (index: number) => {
    const item = businessDetails[index]
    const newVal = prompt(`Edit ${item.k}:`, item.v)
    if (newVal !== null && newVal !== '') {
      const newDetails = [...businessDetails]
      newDetails[index].v = newVal
      setBusinessDetails(newDetails)

      const keyMap: any = {
        'Agency name': 'agency_name',
        'City': 'city',
        'Areas covered': 'areas',
        'Bot tone': 'bot_tone',
        'Office hours': 'office_open',
        'Language': 'languages'
      }
      const dbKey = keyMap[item.k]
      if (dbKey) {
        try {
          const body: any = {}
          if (item.k === 'Areas covered' || item.k === 'Language') {
            body[dbKey] = newVal.split(',').map(s => s.trim())
          } else if (item.k === 'Office hours') {
            const parts = newVal.split('–').map(s => s.trim())
            body.office_open = parts[0]
            if (parts[1]) body.office_close = parts[1]
          } else {
            body[dbKey] = newVal
          }
          await fetch('/api/agent?id=' + agentId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
        } catch (e) {
          console.error(e)
          alert('Failed to save changes.')
        }
      }
    }
  }

  const sections = [
    { 
      title: 'Business details', 
      rows: businessDetails, 
      toggles: [] 
    },
    { 
      title: 'Bot controls', 
      rows: [], 
      toggles: [
        { k: 'Bot active', v: 'Running on WhatsApp', on: botActive, action: handleToggleBot },
        { k: '23h window keep-alive', v: 'Auto re-engage before window closes', on: keepAlive, action: () => setKeepAlive(!keepAlive) },
        { k: 'Low balance alerts', v: 'Notify at ₹50 remaining', on: lowBalAlert, action: () => setLowBalAlert(!lowBalAlert) }
      ] 
    },
    { 
      title: 'Subscription', 
      rows: [
        { k: 'Plan', v: (agentData?.plan ? agentData.plan.charAt(0).toUpperCase() + agentData.plan.slice(1) : 'Monthly') + ' — ' + (agentData?.plan === 'free' ? '₹0' : '₹999') + ' / month' },
        { k: 'Next billing', v: agentData?.plan === 'free' ? '-' : '25 Jun 2026' },
        { k: 'Message usage', v: `${agentData?.messages_used ?? 0} / ${agentData?.messages_limit ?? 5000} this month` },
        { k: 'WhatsApp', v: agentData?.wa_verified ? `Connected ✓` : 'Not connected — awaiting Meta API setup' }
      ], 
      toggles: [] 
    },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 640 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>Settings</div>
      {sections.map(section => (
        <div key={section.title} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>{section.title}</div>
          
          {section.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < section.rows.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
              <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#6B6860' }}>{row.v}</span>
                {section.title === 'Business details' && (
                  <span onClick={() => handleEditDetail(i)} style={{ fontSize: 11, color: '#1A5FA5', cursor: 'pointer', fontWeight: 500 }}>Edit</span>
                )}
              </div>
            </div>
          ))}

          {section.toggles.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < section.toggles.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</div>
                <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 1 }}>{row.v}</div>
              </div>
              <div 
                onClick={row.action}
                style={{ width: 36, height: 20, borderRadius: 20, background: row.on ? '#2E8B5F' : '#ECEAE0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', border: `1px solid ${row.on ? '#2E8B5F' : 'rgba(26,25,22,0.18)'}` }}
              >
                <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 2, left: row.on ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* PIN Modal */}
      {showPinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916', marginBottom: 6 }}>Admin Override</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>Enter master PIN to pause the AI agent. Default is 1234.</div>
            
            <input 
              type="password" 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
              placeholder="Enter PIN"
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }}
            />
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePinSubmit} style={{ padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Pause Bot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
