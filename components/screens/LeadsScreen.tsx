'use client'
import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'

interface Props { agentId: string }

const COLUMNS = ['New', 'Qualified', 'Visit Booked', 'Closed']

const STATUS_MAP: Record<string, string[]> = {
  'New': ['new', 'contacted'],
  'Qualified': ['qualified'],
  'Visit Booked': ['visit_booked', 'visit_done'],
  'Closed': ['closed_won', 'closed_lost']
}

const DROP_STATUS: Record<string, string> = {
  'New': 'new',
  'Qualified': 'qualified',
  'Visit Booked': 'visit_booked',
  'Closed': 'closed_won'
}

export default function LeadsScreen({ agentId }: Props) {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  // New Modals State
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Add Lead Form State
  const [leadName, setLeadName] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadSource, setLeadSource] = useState('Manual')
  
  // Bulk State
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkTotal, setBulkTotal] = useState(0)
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const bulkFileInputRef = useRef<HTMLInputElement>(null)

  // Fetch leads
  const fetchLeads = () => {
    fetch('/api/leads?agent_id=' + agentId)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) {
          setFetchError(d.error || `Error ${r.status}`)
          return
        }
        setFetchError(null)
        if (d.data) setLeads(d.data)
      })
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 4000)
    return () => clearInterval(interval)
  }, [agentId])

  const handleUnlock = () => {
    if (pinInput === '1234') {
      setIsUnlocked(true)
      setShowPinModal(false)
      setPinInput('')
    } else {
      alert('Incorrect PIN')
    }
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    if (!isUnlocked) {
      e.preventDefault()
      return
    }
    setDraggedId(leadId)
    e.dataTransfer.setData('text/plain', leadId)
    e.currentTarget.style.opacity = '0.5'
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.style.opacity = '1'
    setDraggedId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() // necessary to allow dropping
  }

  const handleDrop = async (e: React.DragEvent, colStatus: string) => {
    e.preventDefault()
    if (!draggedId || !isUnlocked) return

    const dbStatus = DROP_STATUS[colStatus] || colStatus.toLowerCase()

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === draggedId ? { ...l, status: dbStatus } : l))

    // Real update via API
    try {
      await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggedId, status: dbStatus })
      })
    } catch (err) {
      console.error('Failed to update status', err)
      fetchLeads() // Revert in case of failure
    }
    setDraggedId(null)
  }

  // --- Add Lead Logic ---
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setAddError(null)
    const payload = {
      agent_id: agentId,
      name: leadName,
      phone: leadPhone,
      source: leadSource,
      status: 'new',
      temperature: 'new'
    }
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      setShowAddModal(false)
      setLeadName('')
      setLeadPhone('')
      fetchLeads()
      // Notify the onboarding tutorial that a lead was successfully added
      window.dispatchEvent(new CustomEvent('leadnest:tour-action', { detail: 'lead-added' }))
    } catch(err: any) {
      setAddError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- BULK UPLOAD LOGIC ---
  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Phone,Source\nRahul Kumar,919876543210,Website\nAnita Desai,918765432109,Facebook Ads";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leadnest_leads_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[]
        if (rows.length === 0) return
        
        setIsBulkUploading(true)
        setBulkTotal(rows.length)
        setBulkProgress(0)

        // Map CSV rows to database payload array
        const payloadArray = rows.map(row => ({
          agent_id: agentId,
          name: row['Name'] || 'Unknown',
          phone: row['Phone'] || '',
          source: row['Source'] || 'Bulk Upload',
          status: 'new',
          temperature: 'new',
          ai_score: 0
        })).filter(l => l.phone !== '') // drop rows without phone

        try {
          await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadArray) // Send the entire array at once!
          })
          setBulkProgress(payloadArray.length)
        } catch(e) {
          console.error(`Failed to bulk upload leads`, e)
        }
        
        setTimeout(() => {
          setIsBulkUploading(false)
          setShowBulkModal(false)
          fetchLeads()
          if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''
        }, 500)
      }
    })
  }

  // Group leads
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col] = leads.filter(l => {
      const s = l.status || 'new'
      return (STATUS_MAP[col] || []).includes(s)
    })
    return acc
  }, {} as Record<string, any[]>)

  const scoreStyle: Record<string, { bg: string; c: string }> = { 
    high: { bg: '#EEF0FE', c: '#4338CA' }, 
    mid: { bg: '#FEF9E7', c: '#7A5200' }, 
    low: { bg: '#EEF4FC', c: '#0F3D6E' } 
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return scoreStyle.high
    if (score >= 5) return scoreStyle.mid
    return scoreStyle.low
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto', position: 'relative' }}>
      <style>{`
        .draggable-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.05) !important; }
        .locked-card:hover { filter: brightness(0.97); }
      `}</style>

      {fetchError && (
        <div style={{ background: '#FDF0F0', border: '1px solid rgba(192,57,43,0.2)', color: '#8B1A1A', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ Could not load leads: <strong>{fetchError}</strong>
          {fetchError.includes('401') || fetchError.includes('403') || fetchError.includes('Authentication') || fetchError.includes('Forbidden') ? ' — Please refresh the page or log out and log back in.' : ''}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Lead pipeline</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginTop: 4 }}>
            🤖 AI automatically moves leads based on intent and qualification score.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setShowBulkModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#15161B', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            Bulk Upload CSV
          </button>
          <button
            data-tour="add-lead"
            onClick={() => { setShowAddModal(true); setAddError(null) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            + Add Lead
          </button>
          <button 
            onClick={() => !isUnlocked ? setShowPinModal(true) : setIsUnlocked(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: isUnlocked ? '#FEF9E7' : '#F4F3EE', color: isUnlocked ? '#7A5200' : '#6B6860', border: isUnlocked ? '1px solid rgba(183,119,13,0.3)' : '1px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
          >
            {isUnlocked ? '🔓 Lock' : '🔒 Override'}
          </button>
        </div>
      </div>

      {loading && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9E9B92' }}>
          <div style={{ width: 32, height: 32, margin: '0 auto 16px', border: '3px solid #E8E5DF', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 13 }}>Loading your pipeline...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {!loading && !fetchError && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9E9B92' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>No leads yet</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>
            Add your first lead manually, or leads will appear automatically when someone messages you on WhatsApp.
          </div>
          <button onClick={() => { setShowAddModal(true); setAddError(null) }} style={{ padding: '10px 20px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
            + Add your first lead
          </button>
        </div>
      )}

      {!(loading && leads.length === 0) && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, alignItems: 'start' }}>
        {COLUMNS.map(col => {
          const colLeads = grouped[col]
          return (
            <div 
              key={col} 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col)}
              style={{ background: '#F4F3EE', border: isUnlocked ? '1px dashed rgba(79,70,229,0.4)' : '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 12, minHeight: 'calc(100vh - 180px)', transition: 'border 0.2s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col}</span>
                <span style={{ fontSize: 10, background: '#fff', border: '1px solid rgba(26,25,22,0.13)', color: '#6B6860', padding: '1px 7px', borderRadius: 10 }}>{colLeads.length}</span>
              </div>

              {colLeads.map(lead => {
                const ss = getScoreColor(lead.ai_score || 0)
                const intent = lead.intent || 'Unknown intent'
                const budget = lead.budget_max ? `Up to ₹${lead.budget_max}` : ''
                return (
                  <div 
                    key={lead.id} 
                    className={isUnlocked ? "draggable-card" : "locked-card"}
                    draggable={isUnlocked}
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    style={{ 
                      background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 10, padding: '14px 16px', marginBottom: 8, 
                      cursor: isUnlocked ? 'grab' : 'default', 
                      transition: 'all 0.15s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: col === 'Closed' ? '#4338CA' : '#15161B' }}>{lead.name || lead.phone}</div>
                      {lead.ai_score > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: ss.bg, color: ss.c }}>{lead.ai_score}/10</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 4 }}>{intent}</div>
                    {budget && <div style={{ fontSize: 11, color: '#6B6860', marginTop: 6 }}>{budget}</div>}
                  </div>
                )
              })}
              {colLeads.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'rgba(107,104,96,0.5)', border: '1px dashed rgba(26,25,22,0.1)', borderRadius: 8 }}>
                  Drop leads here
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B', marginBottom: 6 }}>Admin Override</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>Enter master PIN to manually move leads. Default is 1234.</div>
            
            <input 
              type="password" 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
              placeholder="Enter PIN"
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }}
            />
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleUnlock} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleSaveLead} style={{ background: '#fff', borderRadius: 16, width: 450, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Add New Lead</div>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {addError && (
                <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
                  ⚠️ {addError}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Lead Name</label>
                <input required value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="e.g. Rahul Kumar" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Phone Number</label>
                <input required value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="e.g. 919876543210" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Source</label>
                <select value={leadSource} onChange={e => setLeadSource(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                  <option>Manual</option><option>Website</option><option>Facebook Ads</option><option>Referral</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={isSubmitting} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: isSubmitting ? 0.7 : 1 }}>{isSubmitting ? 'Saving...' : 'Add Lead'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 450, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Bulk Upload Leads (CSV)</div>
              {!isBulkUploading && <button type="button" onClick={() => setShowBulkModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>}
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!isBulkUploading ? (
                <>
                  <div style={{ fontSize: 13, color: '#6B6860', lineHeight: 1.5 }}>
                    Upload a CSV file to import your existing leads pipeline. Our AI will automatically begin engaging them if they send a message.
                  </div>
                  
                  <button onClick={downloadTemplate} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#15161B', border: '1px solid rgba(26,25,22,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                    ⬇️ Download CSV Template
                  </button>

                  <div onClick={() => bulkFileInputRef.current?.click()} style={{ border: '1px dashed rgba(26,25,22,0.2)', borderRadius: 8, padding: '30px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#fff', marginTop: 10 }}>
                    <input type="file" ref={bulkFileInputRef} onChange={handleBulkUpload} style={{ display: 'none' }} accept=".csv" />
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>Click or drag your CSV here</div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 24, marginBottom: 16 }}>🚀</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>Importing leads...</div>
                  <div style={{ fontSize: 13, color: '#6B6860', marginBottom: 16 }}>{bulkProgress} of {bulkTotal} uploaded</div>
                  <div style={{ height: 6, background: '#F4F3EE', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#1A5FA5', width: `${bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
