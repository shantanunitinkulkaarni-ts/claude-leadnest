'use client'
import { useState, useEffect } from 'react'

export default function AppointmentsScreen({ agentId }: { agentId: string }) {
  const [appointments, setAppointments] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  
  // Modals
  const [showFeedbackModal, setShowFeedbackModal] = useState<any>(null) // holds appointment object
  const [showWalkinModal, setShowWalkinModal] = useState(false)
  
  // Walkin State
  const [visitorName, setVisitorName] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [visitedPropertyId, setVisitedPropertyId] = useState('')
  
  // Feedback State
  const [selectedResult, setSelectedResult] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Cancel-with-PIN State
  const [cancelTarget, setCancelTarget] = useState<any>(null) // appointment to cancel
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const fetchData = async () => {
    try {
      const [apptsRes, propsRes] = await Promise.all([
        fetch(`/api/appointments?agent_id=${agentId}`),
        fetch(`/api/properties?agent_id=${agentId}`)
      ])
      const apptsD = await apptsRes.json()
      const propsD = await propsRes.json()
      if (!apptsRes.ok) { setFetchError(apptsD.error || `Error ${apptsRes.status}`); setLoading(false); return }
      setFetchError(null)
      if (apptsD.data) setAppointments(apptsD.data)
      if (propsD.data) setProperties(propsD.data)
      setLoading(false)
    } catch (e: any) {
      setFetchError(e.message)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [agentId])

  const handleLogWalkin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      // 1. Create Lead
      const leadRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          name: visitorName,
          phone: visitorPhone,
          source: 'walk_in',
          status: 'visit_booked'
        })
      })
      const leadData = await leadRes.json()
      
      // 2. Create Appointment (Done, scheduled now)
      const apptRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: leadData.data.id,
          property_id: visitedPropertyId,
          scheduled_at: new Date().toISOString(),
          status: 'done'
        })
      })
      const apptData = await apptRes.json()
      
      // 3. Immediately ask for feedback
      setShowWalkinModal(false)
      setVisitorName('')
      setVisitorPhone('')
      fetchData() // refresh to get full joined data
      
      // Instead of showing the modal with raw data, let's just trigger it with basic structure
      setShowFeedbackModal({
        id: apptData.data.id,
        lead_id: leadData.data.id,
        leads: { name: visitorName },
        properties: { title: properties.find(p => p.id === visitedPropertyId)?.title || 'Selected Property' }
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // fetch() does NOT throw on 4xx/5xx — check res.ok or a failed save
      // silently closes the modal and the card stays "Needs Feedback".
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showFeedbackModal.id,
          post_visit_result: selectedResult,
          notes: notes,
          status: selectedResult === 'no_show' ? 'no_show' : 'done'
        })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(`Could not save feedback: ${d.error || `server error ${res.status}`}. Please try again.`)
        setIsSubmitting(false)
        return
      }

      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: showFeedbackModal.lead_id, // Might be undefined if walkin, but backend handles gracefully
          type: selectedResult === 'no_show' ? 'visit_no_show' : 'feedback_submitted',
          title: selectedResult === 'no_show' ? '🚫 Visit No-Show Logged' : 'Post-Visit Feedback Logged',
          description: `Outcome: ${selectedResult.replace(/_/g, ' ')}`
        })
      })

      setShowFeedbackModal(null)
      setSelectedResult('')
      setNotes('')
      fetchData()
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmCancelVisit = async () => {
    if (!cancelTarget) return
    if (pinInput !== '1234') {
      setPinError('Incorrect PIN. Default is 1234.')
      return
    }
    setIsCancelling(true)
    setPinError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cancelTarget.id, status: 'cancelled' })
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)

      // Log the cancellation for the activity trail
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: cancelTarget.lead_id,
          type: 'status_change',
          title: 'Site visit cancelled',
          description: 'Visit cancelled manually by agent (PIN verified).'
        })
      }).catch(() => {})

      setCancelTarget(null)
      setPinInput('')
      fetchData()
    } catch (e: any) {
      setPinError(e.message || 'Failed to cancel visit.')
    } finally {
      setIsCancelling(false)
    }
  }

  const now = new Date()
  const upcoming = appointments.filter(a => new Date(a.scheduled_at) >= now && a.status !== 'cancelled')
  const past = appointments.filter(a => new Date(a.scheduled_at) < now || a.status === 'cancelled' || a.status === 'done')

  const renderCard = (a: any) => {
    const d = new Date(a.scheduled_at)
    const isPast = d < now
    const needsFeedback = isPast && !a.post_visit_result && a.status !== 'cancelled' && a.status !== 'no_show'
    const isUpcomingActive = !isPast && a.status !== 'cancelled' && a.status !== 'done' && a.status !== 'no_show'

    return (
      <div key={a.id} style={{ background: needsFeedback ? '#FFFAEB' : '#fff', border: `1px solid ${needsFeedback ? '#F6C000' : 'rgba(26,25,22,0.08)'}`, borderRadius: 14, padding: '16px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', width: 52, minWidth: 52, background: '#F4F3EE', borderRadius: 9, padding: '8px 0', border: '1px solid rgba(26,25,22,0.08)', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#15161B', lineHeight: 1 }}>{d.getDate()}</div>
          <div style={{ fontSize: 10, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{d.toLocaleString('default', { month: 'short' })}</div>
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#15161B', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {a.leads?.name || 'Unknown Lead'}
            {needsFeedback && <span style={{ fontSize: 10, background: '#FFECB3', color: '#B7770D', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Needs Feedback</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6B6860', marginTop: 3 }}>{a.properties?.title || 'General Visit'}</div>
          <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            <span>·</span>
            <span>{a.leads?.phone}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {needsFeedback ? (
            <button
              onClick={() => setShowFeedbackModal(a)}
              style={{ padding: '6px 12px', borderRadius: 8, background: '#F6C000', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
            >
              Log Feedback
            </button>
          ) : (
            <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 500, background: a.status === 'cancelled' || a.status === 'no_show' ? '#FFEBEE' : '#EEF0FE', color: a.status === 'cancelled' || a.status === 'no_show' ? '#C62828' : '#4338CA', textTransform: 'capitalize' }}>
              {a.status.replace('_', ' ')}
            </span>
          )}
          {isUpcomingActive && (
            <button
              onClick={() => { setCancelTarget(a); setPinInput(''); setPinError(null) }}
              title="Cancel this site visit (PIN required)"
              style={{ padding: '6px 12px', borderRadius: 8, background: '#fff', color: '#C0392B', border: '1px solid rgba(192,57,43,0.3)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}
            >
              🔒 Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Appointments</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginTop: 4 }}>Manage site visits and log post-visit feedback for AI nurturing.</div>
        </div>
        <button 
          onClick={() => setShowWalkinModal(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
        >
          + Log Walk-in
        </button>
      </div>

      {fetchError && (
        <div style={{ background: '#FDF0F0', border: '1px solid rgba(192,57,43,0.2)', color: '#8B1A1A', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {fetchError}
        </div>
      )}
      {loading && <div style={{ padding: '40px 0', color: '#9E9B92', fontSize: 14 }}>Loading appointments...</div>}

      {!loading && !fetchError && appointments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9E9B92' }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>No appointments yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Log a walk-in visit or wait for the AI bot to book a site visit automatically.</div>
          <button onClick={() => setShowWalkinModal(true)} style={{ padding: '9px 18px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>+ Log Walk-in</button>
        </div>
      )}

      {!loading && !fetchError && appointments.length > 0 && <>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Upcoming Visits ({upcoming.length})</div>
      {upcoming.length === 0 ? <div style={{ fontSize: 13, color: '#9E9B92', marginBottom: 30 }}>No upcoming visits scheduled.</div> : upcoming.map(renderCard)}

      <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 30, marginBottom: 12 }}>Past Visits ({past.length})</div>
      {past.map(renderCard)}
      </>}

      {/* Log Walk-in Modal */}
      {showWalkinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleLogWalkin} style={{ background: '#fff', borderRadius: 16, width: 400, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Log Walk-in Lead</div>
              <button type="button" onClick={() => setShowWalkinModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: '#6B6860', lineHeight: 1.4 }}>
                This will instantly create a new Lead profile, log a site visit, and initiate the AI's follow-up nurture sequence.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Visitor Name</label>
                <input required value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="e.g. Ramesh Patel" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>WhatsApp Number</label>
                <input required value={visitorPhone} onChange={e => setVisitorPhone(e.target.value)} placeholder="+91 9000000000" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Property Visited</label>
                <select required value={visitedPropertyId} onChange={e => setVisitedPropertyId(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                  <option value="" disabled>Select a property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowWalkinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={isSubmitting || !visitedPropertyId} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: (isSubmitting || !visitedPropertyId) ? 0.7 : 1 }}>
                {isSubmitting ? 'Processing...' : 'Log Visit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Post-Visit Feedback Modal */}
      {showFeedbackModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={submitFeedback} style={{ background: '#fff', borderRadius: 16, width: 450, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Post-Visit Feedback</div>
              <button type="button" onClick={() => { setShowFeedbackModal(null); setSelectedResult(''); setNotes('') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>
            
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: 20, padding: '14px', background: '#F4F3EE', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#6B6860', marginBottom: 2 }}>Lead: <strong>{showFeedbackModal.leads?.name}</strong></div>
                <div style={{ fontSize: 12, color: '#6B6860' }}>Property: {showFeedbackModal.properties?.title}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>How did the visit go?</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { id: 'interested', label: '✅ Interested' },
                      { id: 'follow_up_later', label: '🕒 Follow-up Later' },
                      { id: 'not_interested', label: '❌ Not Interested' },
                      { id: 'no_show', label: '🚫 No-Show' }
                    ].map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedResult(r.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '10px 12px', borderRadius: 8, border: `1px solid ${selectedResult === r.id ? '#1A5FA5' : 'rgba(26,25,22,0.18)'}`, background: selectedResult === r.id ? '#EEF4FC' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: selectedResult === r.id ? '#1A5FA5' : '#6B6860', transition: 'all 0.15s', fontFamily: 'inherit' }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>Agent Notes (Optional)</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Provide details to guide the AI bot's next message..."
                    rows={3}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => { setShowFeedbackModal(null); setSelectedResult(''); setNotes('') }} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={!selectedResult || isSubmitting} style={{ padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: (!selectedResult || isSubmitting) ? 0.5 : 1 }}>
                {isSubmitting ? 'Saving...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Visit — PIN Required Modal */}
      {cancelTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 360, padding: '24px 28px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#15161B', marginBottom: 6 }}>Cancel site visit?</div>
            <div style={{ fontSize: 13, color: '#6B6860', marginBottom: 16, lineHeight: 1.5 }}>
              You are about to cancel the visit for <strong>{cancelTarget.leads?.name || 'this lead'}</strong>
              {cancelTarget.scheduled_at ? ` on ${new Date(cancelTarget.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}.
              This is a key action — enter the master PIN to confirm.
            </div>

            {pinError && (
              <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                ⚠️ {pinError}
              </div>
            )}

            <input
              type="password"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              placeholder="Enter PIN (default 1234)"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && confirmCancelVisit()}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setCancelTarget(null); setPinInput(''); setPinError(null) }} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Keep visit</button>
              <button onClick={confirmCancelVisit} disabled={isCancelling} style={{ padding: '8px 16px', borderRadius: 8, background: '#C0392B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: isCancelling ? 0.7 : 1 }}>{isCancelling ? 'Cancelling...' : 'Confirm Cancel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
