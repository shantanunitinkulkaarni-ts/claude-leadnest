'use client'

import { useState } from 'react'
import { SUPPORT_EMAIL, supportWhatsappLink } from '@/lib/support'
import { FAQS, type QA } from '@/lib/faq'
import SupportChat from '@/components/SupportChat'

function FaqItem({ item, isOpen, onToggle }: { item: QA; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: '1px solid #ECEAE4' }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
          padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 15, fontWeight: 600, color: '#15161B', fontFamily: 'inherit',
        }}
      >
        <span>{item.q}</span>
        <span style={{ color: '#4F46E5', fontSize: 20, lineHeight: 1, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.18s' }}>+</span>
      </button>
      {isOpen && (
        <div style={{ fontSize: 14, color: '#4A4843', lineHeight: 1.7, padding: '0 0 18px' }}>{item.a}</div>
      )}
    </div>
  )
}

function TicketForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/support-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, source: 'help_page' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not submit. Please try again.')
      setDone(true)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const field: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D6D3F0', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  if (done) return (
    <div style={{ background: '#E7F6EC', border: '1px solid #B6E3C6', borderRadius: 10, padding: '16px 18px', fontSize: 14, color: '#1B7A43' }}>
      ✓ Ticket raised — we&apos;ve emailed our team and will get back to you soon{email ? ` at ${email}` : ''}.
    </div>
  )

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <div style={{ background: '#FDF0F0', color: '#8B1A1A', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>⚠️ {err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input style={{ ...field, flex: 1, minWidth: 140 }} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
        <input style={{ ...field, flex: 1, minWidth: 140 }} type="email" placeholder="Your email (for our reply)" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <input style={field} placeholder="Subject" required value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea style={{ ...field, resize: 'vertical' }} rows={4} placeholder="How can we help?" required value={message} onChange={e => setMessage(e.target.value)} />
      <button type="submit" disabled={busy} style={{ alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 9, background: '#4F46E5', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>
        {busy ? 'Sending…' : 'Raise a ticket'}
      </button>
    </form>
  )
}

export default function HelpContent() {
  const [open, setOpen] = useState<string | null>(null)
  const [showTicket, setShowTicket] = useState(false)
  const waLink = supportWhatsappLink('Hi Convorian team, I need help with my account.')

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, color: '#15161B', margin: '0 0 8px' }}>Help & FAQ</h1>
      <p style={{ fontSize: 15, color: '#6B6860', margin: '0 0 32px', lineHeight: 1.6 }}>
        Quick answers to the most common questions — or tap the chat bubble to ask our support assistant.
      </p>

      <SupportChat />

      {FAQS.map(group => (
        <section key={group.section} style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9E9B92', marginBottom: 4 }}>{group.section}</div>
          {group.items.map(item => {
            const key = group.section + '|' + item.q
            return <FaqItem key={key} item={item} isOpen={open === key} onToggle={() => setOpen(open === key ? null : key)} />
          })}
        </section>
      ))}

      {/* Contact / escalation */}
      <div style={{ marginTop: 8, background: 'linear-gradient(135deg,#EEF0FE,#F5F0FE)', border: '1px solid #E0DEF8', borderRadius: 14, padding: '24px 26px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#15161B', marginBottom: 6 }}>Still need help?</div>
        <p style={{ fontSize: 14, color: '#4A4843', lineHeight: 1.6, margin: '0 0 18px' }}>
          Reach our team directly — we usually reply the same day.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 9, background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              💬 Chat on WhatsApp
            </a>
          )}
          <a href={`mailto:${SUPPORT_EMAIL}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 9, background: '#fff', border: '1px solid #D6D3F0', color: '#4F46E5', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            ✉️ {SUPPORT_EMAIL}
          </a>
          <button onClick={() => setShowTicket(s => !s)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 9, background: '#fff', border: '1px solid #D6D3F0', color: '#4F46E5', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            🎫 Raise a ticket
          </button>
        </div>
        {showTicket && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #E0DEF8' }}>
            <TicketForm />
          </div>
        )}
      </div>
    </div>
  )
}
