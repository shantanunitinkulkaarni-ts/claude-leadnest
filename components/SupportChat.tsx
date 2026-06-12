'use client'

import { useState, useRef, useEffect } from 'react'
import { SUPPORT_EMAIL, supportWhatsappLink, supportWhatsappConfigured } from '@/lib/support'

type Msg = { from: 'user' | 'support'; text: string; logId?: string; rated?: 'up' | 'down' }

const GREETING: Msg = {
  from: 'support',
  text: "Hi! I'm Convorian's support assistant. Ask me about setup, billing, invoices or your account — I'll help, or connect you to our team.",
}

// WhatsApp / email escalation — shown when the assistant hands off to a human.
function Escalation({ context }: { context: string }) {
  const [copied, setCopied] = useState(false)
  const waLink = supportWhatsappLink(`Hi Convorian support, I need help.\n\n(From support chat) ${context}`.slice(0, 600))
  const copyEmail = () => {
    try { navigator.clipboard.writeText(SUPPORT_EMAIL) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #E0DEF8', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#15161B', marginBottom: 8 }}>Talk to our team</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {supportWhatsappConfigured() && waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: '#25D366', color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
            💬 Chat on WhatsApp
          </a>
        )}
        {/* mailto AND copy — mailto silently does nothing when no mail app is
            configured, so the address is always visible + copyable. */}
        <a href={`mailto:${SUPPORT_EMAIL}`} onClick={copyEmail}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: '#fff', border: '1px solid #D6D3F0', color: '#4F46E5', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
          ✉️ {SUPPORT_EMAIL}
        </a>
      </div>
      <div style={{ fontSize: 11, color: copied ? '#1B7A43' : '#9E9B92', marginTop: 8 }}>
        {copied ? '✓ Email address copied to clipboard' : 'Tap the email to copy the address.'}
      </div>
    </div>
  )
}

export default function SupportChat({ agentId }: { agentId?: string } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, loading, escalated, isOpen])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = msg.trim()
    if (!text || loading) return
    setMsg('')
    // Resuming the conversation dismisses the escalation card — it re-appears
    // only if the assistant escalates again.
    setEscalated(false)
    const next: Msg[] = [...messages, { from: 'user', text }]
    setMessages(next)
    setLoading(true)
    try {
      // API expects {role, content}; map our {from, text} shape.
      const payload = next.map(m => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }))
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, agent_id: agentId }),
      })
      const data = await res.json()
      const reply = data.response || "I'm having trouble right now — please use Contact support below."
      setMessages(prev => [...prev, { from: 'support', text: reply, logId: data.log_id || undefined }])
      if (data.escalate) setEscalated(true)
    } catch {
      setMessages(prev => [...prev, { from: 'support', text: 'I could not reach the server. Please use Contact support below.' }])
      setEscalated(true)
    } finally {
      setLoading(false)
    }
  }

  // End-of-chat feedback (replaces the old per-message thumbs — too noisy).
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const handleClose = () => {
    const hadConversation = messages.some(m => m.from === 'user')
    if (hadConversation && !feedbackSent && !showFeedback) {
      setShowFeedback(true)
      return
    }
    setShowFeedback(false)
    setIsOpen(false)
  }

  const submitFeedback = (helpful: boolean) => {
    setFeedbackSent(true)
    const lastLogged = [...messages].reverse().find(m => m.logId)
    if (lastLogged?.logId) {
      // Fire-and-forget — feedback is a quality signal, not blocking.
      fetch('/api/support-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: lastLogged.logId, helpful }),
      }).catch(() => {})
    }
    setTimeout(() => { setShowFeedback(false); setIsOpen(false) }, 900)
  }

  const lastUser = [...messages].reverse().find(m => m.from === 'user')?.text || ''

  return (
    <>
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, width: 340, height: 460,
          background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', zIndex: 9999, overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.06)'
        }}>
          <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Convorian Support</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Usually replies instantly</div>
            </div>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          <div ref={bodyRef} style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFAFB' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: m.from === 'user' ? '#4F46E5' : '#fff',
                  color: m.from === 'user' ? '#fff' : '#2A2925',
                  border: m.from === 'user' ? 'none' : '1px solid #ECEAE4',
                  padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap'
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && <div style={{ fontSize: 12, color: '#9E9B92' }}>Assistant is typing…</div>}
            {escalated && <Escalation context={lastUser} />}
            {showFeedback && (
              <div style={{ background: '#fff', border: '1px solid #E0DEF8', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                {feedbackSent ? (
                  <div style={{ fontSize: 13, color: '#1B7A43', fontWeight: 500 }}>Thank you for your feedback!</div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#15161B', marginBottom: 10 }}>Before you go — was this conversation helpful?</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={() => submitFeedback(true)}
                        style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #D6D3F0', background: '#fff', color: '#1B7A43', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Yes, it helped
                      </button>
                      <button onClick={() => submitFeedback(false)}
                        style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #D6D3F0', background: '#fff', color: '#C0392B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Not really
                      </button>
                      <button onClick={() => { setShowFeedback(false); setIsOpen(false) }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: '#9E9B92', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Skip
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <form onSubmit={handleSend} style={{ padding: 12, borderTop: '1px solid #ECEAE0', display: 'flex', gap: 8 }}>
            <input
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              style={{ flex: 1, padding: '9px 13px', borderRadius: 20, border: '1px solid #DFDDD3', outline: 'none', fontSize: 13.5, fontFamily: 'inherit' }}
            />
            <button type="submit" disabled={loading || !msg.trim()}
              style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 20, padding: '0 18px', fontWeight: 600, cursor: loading || !msg.trim() ? 'default' : 'pointer', fontSize: 13.5, opacity: loading || !msg.trim() ? 0.6 : 1 }}>
              Send
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open support chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 52, height: 52,
          borderRadius: '50%', background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', color: '#fff',
          border: 'none', cursor: 'pointer', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(79,70,229,0.4)'
        }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </button>
    </>
  )
}
