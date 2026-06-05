'use client'

import { useState } from 'react'

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [messages, setMessages] = useState<{from: 'user' | 'support', text: string}[]>([
    { from: 'support', text: 'Hi! I am the LeadNest support bot. How can I help you today?' }
  ])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!msg.trim()) return
    setMessages([...messages, { from: 'user', text: msg }])
    setMsg('')
    setTimeout(() => {
      setMessages(prev => [...prev, { from: 'support', text: 'Thanks for reaching out! A support representative will connect with you shortly.' }])
    }, 1000)
  }

  return (
    <>
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, width: 320, height: 400,
          background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column', zIndex: 9999, overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.05)'
        }}>
          <div style={{ padding: '16px 20px', background: '#1A1916', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 500 }}>LeadNest Support</div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start',
                background: m.from === 'user' ? '#1A5FA5' : '#F2F1EB',
                color: m.from === 'user' ? '#fff' : '#1A1916',
                padding: '10px 14px', borderRadius: 12, fontSize: 14,
                maxWidth: '85%'
              }}>
                {m.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} style={{ padding: 12, borderTop: '1px solid #ECEAE0', display: 'flex', gap: 8 }}>
            <input 
              value={msg} 
              onChange={e => setMsg(e.target.value)} 
              placeholder="Type your message..." 
              style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: '1px solid #DFDDD3', outline: 'none', fontSize: 14 }}
            />
            <button type="submit" style={{ background: '#1A5FA5', color: '#fff', border: 'none', borderRadius: 20, padding: '0 16px', fontWeight: 500, cursor: 'pointer' }}>Send</button>
          </form>
        </div>
      )}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 48, height: 48,
          borderRadius: '50%', background: '#1A1916', color: '#fff',
          border: 'none', cursor: 'pointer', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </button>
    </>
  )
}
