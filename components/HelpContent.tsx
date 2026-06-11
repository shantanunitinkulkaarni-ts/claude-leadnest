'use client'

import { useState } from 'react'
import { SUPPORT_EMAIL, supportWhatsappLink } from '@/lib/support'

type QA = { q: string; a: string }

const FAQS: { section: string; items: QA[] }[] = [
  {
    section: 'Getting started',
    items: [
      { q: 'What is Convorian?', a: 'Convorian is an AI WhatsApp assistant built for Indian real-estate agents. It connects to your WhatsApp number and automatically replies to leads, answers their questions, qualifies them, shares property details, and books site visits — 24/7, in multiple Indian languages.' },
      { q: 'How does the AI assistant work?', a: 'When a lead messages your WhatsApp, Convorian reads the message and replies instantly using your property details, areas and tone. It nurtures the lead through the conversation and notifies you when someone is ready to talk or book a visit. You stay in control and can jump into any chat yourself from the Inbox.' },
      { q: 'How do I connect my WhatsApp number?', a: 'During onboarding we guide you through connecting your number via the official WhatsApp Business (Meta) platform. If you need a hand, message us — we offer concierge onboarding for early customers and will set it up with you.' },
      { q: 'What languages does the bot support?', a: 'Convorian handles English, Hindi, Marathi, Gujarati and more — it replies in the language your lead writes in, so conversations feel natural.' },
    ],
  },
  {
    section: 'Billing & plans',
    items: [
      { q: 'How much does Convorian cost?', a: 'Convorian is ₹999 per month. It auto-renews monthly via UPI Autopay, and you can cancel anytime — you keep access until the end of the period you have already paid for.' },
      { q: 'How do I activate or cancel my subscription?', a: 'Go to the Balance screen in your dashboard. Tap "Activate plan" to start, or "Cancel subscription" to stop auto-renewal. Cancelling keeps your access running until your current paid period ends.' },
      { q: 'Where can I find my invoices / receipts?', a: 'On the Balance screen, scroll to "Billing history". Every payment is listed there with a "Receipt" button — open it and use your browser\'s Print → Save as PDF to download a copy. Note: Convorian is run as a sole proprietorship and is not GST-registered, so these are payment receipts, not tax invoices.' },
      { q: 'What is the "WhatsApp balance" for?', a: 'The WhatsApp balance covers Meta\'s per-message charges for proactive (template) messages you send to leads. It is separate from your ₹999 subscription. You can top it up anytime from the Balance screen.' },
    ],
  },
  {
    section: 'Trust & data',
    items: [
      { q: 'Is my data safe?', a: 'Yes. Your leads and conversations are private to your account, secured in our database, and we never share your data with other agents. See our Privacy Policy for full details.' },
      { q: 'Do my leads have to opt in?', a: 'Yes — that keeps you compliant and your WhatsApp number safe. Leads who message you first are automatically opted in. When you add a lead manually, you confirm you have their consent to message them.' },
    ],
  },
]

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

export default function HelpContent() {
  const [open, setOpen] = useState<string | null>(null)
  const waLink = supportWhatsappLink('Hi Convorian team, I need help with my account.')

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, color: '#15161B', margin: '0 0 8px' }}>Help & FAQ</h1>
      <p style={{ fontSize: 15, color: '#6B6860', margin: '0 0 32px', lineHeight: 1.6 }}>
        Quick answers to the most common questions. Can&apos;t find what you need? We&apos;re a message away.
      </p>

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
        </div>
      </div>
    </div>
  )
}
