'use client'

import { useState, useEffect } from 'react'

export default function FeedbackGate({ agentId, children }: { agentId: string, children: React.ReactNode }) {
  const [overdueAppointments, setOverdueAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Feedback state
  const [selectedResult, setSelectedResult] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Skip logic
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [iUnderstand, setIUnderstand] = useState(false)

  const fetchOverdue = async () => {
    try {
      const res = await fetch(`/api/appointments?agent_id=${agentId}`)
      const d = await res.json()
      if (d.data) {
        // Find appointments older than 24 hours that are not cancelled/no_show and lack a post_visit_result
        const now = new Date()
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        
        const overdue = d.data.filter((a: any) => {
          if (a.status === 'cancelled' || a.status === 'no_show') return false
          if (a.post_visit_result) return false
          
          const scheduled = new Date(a.scheduled_at)
          return scheduled < twentyFourHoursAgo
        })
        
        setOverdueAppointments(overdue)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOverdue()
  }, [agentId])

  if (loading) return <>{children}</>

  if (overdueAppointments.length === 0) {
    return <>{children}</>
  }

  const currentAppt = overdueAppointments[0]

  const submitFeedback = async (resultType: string, isSkip: boolean = false) => {
    setIsSubmitting(true)
    try {
      // 1. Update appointment
      await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentAppt.id,
          post_visit_result: resultType,
          notes: isSkip ? 'SKIPPED BY AGENT VIA PIN' : notes,
          status: resultType === 'no_show' ? 'no_show' : 'done'
        })
      })

      // 2. Log activity
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          lead_id: currentAppt.lead_id,
          type: isSkip ? 'feedback_skipped' : (resultType === 'no_show' ? 'visit_no_show' : 'feedback_submitted'),
          title: isSkip ? '⚠️ Post-Visit Feedback Skipped' : (resultType === 'no_show' ? '🚫 Visit No-Show Logged' : 'Post-Visit Feedback Logged'),
          description: isSkip 
            ? 'Agent forcefully bypassed feedback. ROI and AI nurturing may be affected.' 
            : `Outcome: ${resultType.replace(/_/g, ' ')}`
        })
      })

      // Refresh to clear the gate or show next overdue
      setSelectedResult('')
      setNotes('')
      setShowSkipConfirm(false)
      setPinInput('')
      setIUnderstand(false)
      fetchOverdue()
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    if (!iUnderstand) return alert('You must check the understanding box.')
    if (pinInput !== '1234') return alert('Incorrect Master PIN.')
    submitFeedback('skipped', true)
  }

  return (
    <>
      {/* Background App (Greyed Out) */}
      <div style={{ opacity: 0.1, pointerEvents: 'none', filter: 'grayscale(100%)', height: '100%', width: '100%' }}>
        {children}
      </div>

      {/* The Hard Gate Overlay */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(10px)' }}>
        <div style={{ background: '#fff', borderRadius: 16, width: 600, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ background: '#C62828', padding: '20px 24px', color: '#fff' }}>
            <div style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
              ⚠️ Action Required: Overdue Visit Feedback
            </div>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.9, lineHeight: 1.5 }}>
              In order to ensure that the AI Agent works properly, visit feedback must be updated accurately. <strong>Else, the automatic nurture sequence will fail and your ROI will be affected.</strong>
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: 20, padding: '16px', background: '#F4F3EE', borderRadius: 8, border: '1px solid rgba(26,25,22,0.08)' }}>
              <div style={{ fontSize: 12, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Pending Appointment</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>{currentAppt.leads?.name} — {currentAppt.properties?.title}</div>
              <div style={{ fontSize: 13, color: '#6B6860', marginTop: 4 }}>
                Scheduled: {new Date(currentAppt.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>

            {!showSkipConfirm ? (
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
                        onClick={() => setSelectedResult(r.id)}
                        style={{ padding: '12px 10px', borderRadius: 8, border: `1px solid ${selectedResult === r.id ? '#1A5FA5' : 'rgba(26,25,22,0.18)'}`, background: selectedResult === r.id ? '#EEF4FC' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: selectedResult === r.id ? '#1A5FA5' : '#6B6860', transition: 'all 0.15s' }}
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
                    placeholder="E.g., Client liked the master bedroom but is negotiating price..."
                    rows={3}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <button onClick={() => setShowSkipConfirm(true)} style={{ background: 'none', border: 'none', color: '#9E9B92', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                    Skip (Not Recommended)
                  </button>
                  <button 
                    onClick={() => submitFeedback(selectedResult)}
                    disabled={!selectedResult || isSubmitting}
                    style={{ padding: '10px 20px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', opacity: (!selectedResult || isSubmitting) ? 0.5 : 1 }}
                  >
                    {isSubmitting ? 'Saving...' : 'Submit Feedback'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#FFF5F5', border: '1px solid #FFCDD2', borderRadius: 8, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#C62828', marginBottom: 12 }}>Bypass Feedback Lock</div>
                
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
                  <input type="checkbox" checked={iUnderstand} onChange={e => setIUnderstand(e.target.checked)} style={{ marginTop: 2, transform: 'scale(1.2)' }} />
                  <span style={{ fontSize: 13, color: '#C62828', lineHeight: 1.4 }}>
                    <strong>I understand</strong> that skipping this feedback blinds the AI bot. If this client is lost due to skipped follow-ups, it will be logged in the analytics reports.
                  </span>
                </label>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#C62828', marginBottom: 6 }}>Enter Master PIN to bypass</label>
                  <input 
                    type="password" 
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value)}
                    placeholder="****"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #FFCDD2', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowSkipConfirm(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Go Back</button>
                  <button onClick={handleSkip} disabled={isSubmitting} style={{ padding: '8px 16px', borderRadius: 8, background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
                    {isSubmitting ? 'Bypassing...' : 'Confirm Bypass'}
                  </button>
                </div>
              </div>
            )}
            
            {overdueAppointments.length > 1 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#9E9B92', marginTop: 16 }}>
                There are {overdueAppointments.length - 1} more overdue appointments after this.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
