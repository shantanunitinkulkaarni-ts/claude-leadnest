'use client'

import { useState, useRef, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import './waitlist.css'

const WELCOME_MESSAGES: Record<string, string> = {
  'English': "Hi! I'm Aisha, your AI assistant for The Azure Villas. How can I help you today?",
  'Hindi': "नमस्ते! मैं 'द एज़्योर विलाज़' के लिए आपकी एआई सहायक आयशा हूँ। आज मैं आपकी कैसे मदद कर सकती हूँ?",
  'Marathi': "नमस्कार! मी 'द अझ्योर व्हिलाज' साठी तुमची एआय असिस्टंट आयशा आहे. आज मी तुमची कशी मदत करू शकते?",
  'Gujarati': "નમસ્તે! હું 'ધ એઝ્યોર વિલાઝ' માટે તમારી એઆઈ સહાયક આયશા છું. આજે હું તમારી કેવી રીતે મદત કરી શકું?"
}

const TESTIMONIALS = [
  {
    quote: "Within the first week, LeadNest responded to 47 leads while I was on site visits. Three of those became qualified appointments. I was amazed.",
    name: "Vikram Nair",
    role: "Senior Agent, Nair Properties, Mumbai",
    img: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&q=80&fit=crop"
  },
  {
    quote: "My team used to spend 3 hours daily just qualifying leads over WhatsApp. Now the bot does it overnight and I wake up to a sorted pipeline.",
    name: "Priya Desai",
    role: "Founder, Desai Realty, Pune",
    img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&q=80&fit=crop"
  },
  {
    quote: "The ROI dashboard sold it for me. I could literally see which leads the bot saved. ₹999 versus ₹2L in commissions is not a decision.",
    name: "Arjun Mehta",
    role: "Director, Mehta Associates, Bangalore",
    img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&q=80&fit=crop"
  }
]

export default function WaitlistPage() {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', agencyName: '', currentCrm: '', painPoints: ''
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [spotsLeft, setSpotsLeft] = useState(47)

  // Calculator state
  const [leadsPerMonth, setLeadsPerMonth] = useState(60)
  const [avgDealValue, setAvgDealValue] = useState(75)
  const [closeRate, setCloseRate] = useState(5)

  // Chat state
  const [language, setLanguage] = useState('English')
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string}[]>([
    { role: 'assistant', content: WELCOME_MESSAGES['English'] }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const chatBodyRef = useRef<HTMLDivElement>(null)

  // ROI calculation
  const commissionPct = 0.015
  const estCommission = Math.round((leadsPerMonth * (closeRate / 100)) * (avgDealValue * 100000) * commissionPct)
  const roiMultiple = Math.round(estCommission / 999)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('waitlist').insert([{
        name: formData.name, email: formData.email, phone: formData.phone,
        agency_name: formData.agencyName, current_crm: formData.currentCrm,
        pain_points: formData.painPoints
      }])
      if (error) throw error
      setStatus('success')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value
    setLanguage(newLang)
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[newLang] || WELCOME_MESSAGES['English'] }])
    setLimitReached(false)
  }

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
  }, [messages, isChatLoading])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.animate-up').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || limitReached || isChatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(newMessages)
    setIsChatLoading(true)
    try {
      const res = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, language })
      })
      const data = await res.json()
      if (res.status === 429) {
        setLimitReached(true)
        setDemoStep(3)
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed')
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
        setDemoStep(prev => Math.min(prev + 1, 2))
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting right now. Please try again." }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const renderMessageContent = (content: string) => {
    if (content.includes('[SHOW_IMAGES]')) {
      const text = content.replace('[SHOW_IMAGES]', '').trim()
      return (
        <div>
          {text && <div style={{ marginBottom: 8 }}>{text}</div>}
          <div className="wl-chat-gallery">
            <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=400&auto=format&fit=crop" alt="Villa exterior" className="wl-gallery-img" />
            <img src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=400&auto=format&fit=crop" alt="Villa pool" className="wl-gallery-img" />
            <img src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=400&auto=format&fit=crop" alt="Villa interior" className="wl-gallery-img" />
          </div>
        </div>
      )
    }
    return content
  }

  const scrollToForm = () => document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })

  if (status === 'success') {
    return (
      <div className="waitlist-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: 480 }}>
          <div className="wl-success-icon" style={{ margin: '0 auto 24px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, marginBottom: 12, color: '#1A1916' }}>
            You are on the list!
          </h3>
          <p style={{ fontSize: 16, color: '#6B6860', lineHeight: 1.6, marginBottom: 24 }}>
            Thank you, {formData.name.split(' ')[0]}. We will reach out to {formData.agencyName || 'your agency'} as soon as we launch.
          </p>
          <div style={{ display: 'inline-block', padding: '10px 20px', background: '#EBF5EE', borderRadius: 8, fontSize: 13, color: '#1A6B4A', fontWeight: 500 }}>
            Founding member pricing locked in: ₹999/month
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="waitlist-app">

      {/* Urgency bar */}
      <div className="wl-urgency-bar">
        <span className="wl-dot-live"></span>
        <strong>{spotsLeft} founding member spots remaining</strong> at ₹999/month — price increases to ₹1,499 at launch
      </div>

      {/* Nav */}
      <nav className="waitlist-nav animate-up">
        <div className="wl-container">
          <div className="wl-logo">
            <div className="wl-logo-dot">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="wl-logo-name">LeadNest</span>
          </div>
          <button className="wl-btn-primary" onClick={scrollToForm} style={{ padding: '10px 22px', fontSize: 13 }}>
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="wl-hero">
        <div className="wl-container">
          <div className="wl-hero-content animate-up delay-100">
            <div className="wl-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI Conversion Engine
            </div>
            <h1 className="wl-h1">We are a <em>Conversion Engine</em>, not just a chatbot.</h1>
            <p className="wl-sub">
              Stop losing leads to slow responses. LeadNest engages, qualifies, and nurtures your WhatsApp inquiries 24/7 — in Hindi, English, or Hinglish — turning every conversation into a closed deal.
            </p>

            <div className="wl-hero-cta">
              <button className="wl-btn-primary" onClick={scrollToForm}>
                Get Early Access
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </button>
              <div className="wl-hero-guarantee">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                No credit card required
              </div>
            </div>

            <div className="wl-demo-guide">
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#1A1916' }}>Try the live demo →</p>
              <ul style={{ paddingLeft: 16, fontSize: 12, color: '#6B6860', lineHeight: 1.7, listStyleType: 'disc' }}>
                <li>Switch language — see native multilingual responses</li>
                <li>Ask for photos — watch rich media sharing in action</li>
                <li>Ask about price — experience the qualification flow</li>
              </ul>
            </div>
          </div>

          {/* Chat Demo */}
          <div className="wl-hero-visual animate-up delay-200">
            <div className="wl-demo-tooltip-container">
              {demoStep === 0 && <div className="wl-demo-tooltip">👋 Try chatting with the AI below</div>}
              {demoStep === 1 && <div className="wl-demo-tooltip">⚡ Under 5 seconds. The engine parsed intent and responded contextually.</div>}
              {demoStep === 2 && <div className="wl-demo-tooltip">🎯 Context-aware qualification — notice how it handles every detail.</div>}
            </div>
            <div className="wl-mockup-card">
              <div className="wl-mockup-header">
                <div className="wl-mockup-header-left">
                  <div className="wl-mockup-dots"><span></span><span></span><span></span></div>
                  <div className="wl-mockup-title">Live AI Demo</div>
                </div>
                <select className="wl-lang-select" value={language} onChange={handleLanguageChange}>
                  <option value="English">English</option>
                  <option value="Hindi">हिंदी</option>
                  <option value="Marathi">मराठी</option>
                  <option value="Gujarati">ગુજરાતી</option>
                </select>
              </div>
              <div className="wl-mockup-body" ref={chatBodyRef}>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`wl-chat-bubble ${msg.role === 'user' ? 'wl-chat-user' : 'wl-chat-bot'}`}>
                    {renderMessageContent(msg.content)}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="wl-chat-bubble wl-chat-bot">
                    <div className="typing-dots"><span></span><span></span><span></span></div>
                  </div>
                )}
              </div>
              <div className="wl-chat-input-area">
                <div className="wl-chat-hints">
                  <span className="wl-hint-label">Try:</span>
                  <button type="button" className="wl-hint-pill" onClick={() => setChatInput("Can I see some pictures?")}>Show pictures</button>
                  <button type="button" className="wl-hint-pill" onClick={() => setChatInput("What is the price?")}>Ask price</button>
                </div>
                <form className="wl-chat-form" onSubmit={sendChatMessage}>
                  <input
                    type="text" className="wl-chat-input"
                    placeholder={limitReached ? "Demo complete — join the waitlist!" : "Ask about The Azure Villas..."}
                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                    disabled={limitReached || isChatLoading}
                  />
                  <button type="submit" className="wl-chat-send" disabled={limitReached || isChatLoading || !chatInput.trim()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                </form>
                {limitReached && <div className="wl-chat-limit-msg">Session complete — join the waitlist to access your own engine</div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="wl-trust animate-up">
        <div className="wl-container">
          <div className="wl-trust-inner">
            <div className="wl-avatars">
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&q=80&fit=crop" alt="Agent" /></div>
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&q=80&fit=crop" alt="Agent" /></div>
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&q=80&fit=crop" alt="Agent" /></div>
              <div className="wl-avatar">+</div>
            </div>
            <div className="wl-trust-text"><strong>Real estate agents across Pune, Mumbai &amp; Bangalore</strong> are on the waitlist</div>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="wl-roi-calc">
        <div className="wl-container">
          <div className="wl-roi-inner">
            <div className="animate-up">
              <div className="wl-roi-label">ROI Calculator</div>
              <h2 className="wl-roi-title">See exactly what<br /><em>you stand to earn</em></h2>
              <p className="wl-roi-sub">
                The average agent misses 40% of leads due to slow response. LeadNest captures every one. Move the sliders to see your potential.
              </p>
            </div>
            <div className="wl-calc-card animate-up delay-200">
              <div className="wl-calc-row">
                <div className="wl-calc-label">Leads per month</div>
                <input type="range" className="wl-calc-slider" min="10" max="300" value={leadsPerMonth}
                  onChange={e => setLeadsPerMonth(parseInt(e.target.value))} />
                <div className="wl-calc-val">{leadsPerMonth} leads/month</div>
              </div>
              <div className="wl-calc-row">
                <div className="wl-calc-label">Average property value</div>
                <input type="range" className="wl-calc-slider" min="20" max="500" step="5" value={avgDealValue}
                  onChange={e => setAvgDealValue(parseInt(e.target.value))} />
                <div className="wl-calc-val">₹{avgDealValue}L avg deal</div>
              </div>
              <div className="wl-calc-row">
                <div className="wl-calc-label">Your current close rate</div>
                <input type="range" className="wl-calc-slider" min="1" max="20" value={closeRate}
                  onChange={e => setCloseRate(parseInt(e.target.value))} />
                <div className="wl-calc-val">{closeRate}% of leads close</div>
              </div>
              <div className="wl-calc-divider"></div>
              <div className="wl-calc-result">
                <div className="wl-calc-result-label">Estimated monthly commission</div>
                <div className="wl-calc-result-num">
                  {estCommission >= 100000
                    ? `₹${(estCommission / 100000).toFixed(1)}L`
                    : `₹${estCommission.toLocaleString('en-IN')}`}
                </div>
                <div className="wl-calc-result-sub">
                  That is {roiMultiple > 0 ? `${roiMultiple}×` : '—'} your LeadNest investment
                </div>
              </div>
              <div className="wl-calc-footnote">
                Based on 1.5% avg commission. LeadNest captures leads you currently miss.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="wl-features">
        <div className="wl-container">
          <div className="wl-feat-card animate-up delay-100">
            <div className="wl-feat-icon">⚡</div>
            <h3 className="wl-feat-title">Instant response</h3>
            <p className="wl-feat-desc">Engages every lead within 30 seconds — even at 2 AM. No lead goes unanswered ever again.</p>
          </div>
          <div className="wl-feat-card animate-up delay-200">
            <div className="wl-feat-icon">🎯</div>
            <h3 className="wl-feat-title">Smart qualification</h3>
            <p className="wl-feat-desc">SPIN-based questions score leads 1–10. Hot leads get escalated. Cold leads get nurtured automatically.</p>
          </div>
          <div className="wl-feat-card animate-up delay-300">
            <div className="wl-feat-icon">📅</div>
            <h3 className="wl-feat-title">Automated bookings</h3>
            <p className="wl-feat-desc">Bot books site visits directly in the conversation. You wake up with a full calendar — zero manual effort.</p>
          </div>
          <div className="wl-feat-card animate-up delay-100">
            <div className="wl-feat-icon">🌐</div>
            <h3 className="wl-feat-title">Hindi, English, Marathi</h3>
            <p className="wl-feat-desc">Detects and matches the lead&#39;s language automatically. Hinglish, full Hindi, formal English — all handled.</p>
          </div>
          <div className="wl-feat-card animate-up delay-200">
            <div className="wl-feat-icon">📊</div>
            <h3 className="wl-feat-title">ROI dashboard</h3>
            <p className="wl-feat-desc">See every lead-to-deal conversion. Track commission earned. Renewal becomes a no-brainer.</p>
          </div>
          <div className="wl-feat-card animate-up delay-300">
            <div className="wl-feat-icon">🔒</div>
            <h3 className="wl-feat-title">Zero leakage</h3>
            <p className="wl-feat-desc">23-hour keep-alive logic ensures no lead goes cold. Every enquiry gets a follow-up — automatically.</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="wl-testimonials">
        <div className="wl-container">
          <div className="wl-section-label animate-up">Early access feedback</div>
          <h2 className="wl-section-title animate-up delay-100">Agents who saw it in action</h2>
          <p className="wl-section-sub animate-up delay-200">From our beta testing with real estate teams across India</p>
          <div className="wl-testi-grid">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className={`wl-testi-card animate-up delay-${(i + 1) * 100}`}>
                <div className="wl-testi-stars">★★★★★</div>
                <p className="wl-testi-quote">&ldquo;{t.quote}&rdquo;</p>
                <div className="wl-testi-author">
                  <img src={t.img} alt={t.name} className="wl-testi-avatar" />
                  <div>
                    <div className="wl-testi-name">{t.name}</div>
                    <div className="wl-testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="wl-comparison animate-up">
        <div className="wl-container">
          <div className="wl-comp-inner">
            <div className="wl-section-label" style={{ textAlign: 'left' }}>Why LeadNest</div>
            <h2 className="wl-section-title" style={{ textAlign: 'left', fontSize: 34 }}>Built for Indian real estate. Nothing else.</h2>
            <table className="wl-comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Traditional / Manual</th>
                  <th>LeadNest</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Response speed</td><td>Hours to days</td><td className="wl-feat-highlight">Under 30 seconds</td></tr>
                <tr><td>Lead nurturing</td><td>Manual follow-ups</td><td className="wl-feat-highlight">Context-aware AI</td></tr>
                <tr><td>Availability</td><td>9 AM to 6 PM</td><td className="wl-feat-highlight">24/7/365</td></tr>
                <tr><td>Languages</td><td>Agent dependent</td><td className="wl-feat-highlight">Hindi, English, Marathi, Gujarati</td></tr>
                <tr><td>Lead scoring</td><td>None</td><td className="wl-feat-highlight">AI scores 1–10 automatically</td></tr>
                <tr><td>ROI visibility</td><td>None</td><td className="wl-feat-highlight">Full commission dashboard</td></tr>
                <tr><td>Pricing</td><td>₹5,000–₹10,000/month</td><td className="wl-feat-highlight">₹999/month</td></tr>
              </tbody>
            </table>
            <div className="wl-pricing">
              <div className="wl-pricing-val">₹999 <span>/ month</span></div>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 8 }}>Founding member rate. Locked in forever for early access joiners.</p>
              <div className="wl-founding-tag">Founding member pricing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist Form */}
      <section className="wl-form-section animate-up" id="waitlist-form">
        <div className="wl-container">
          <div className="wl-form-card">
            <div className="wl-form-header">
              <h2>Secure your spot</h2>
              <p>Founding member pricing — ₹999/month, locked in forever. Only {spotsLeft} spots left.</p>
            </div>

            {errorMsg && (
              <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="wl-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="wl-label">Full Name *</label>
                  <input required type="text" name="name" className="wl-input" placeholder="Rajesh Kumar" value={formData.name} onChange={handleChange} />
                </div>
                <div>
                  <label className="wl-label">Phone Number *</label>
                  <input required type="tel" name="phone" className="wl-input" placeholder="+91 98765 43210" value={formData.phone} onChange={handleChange} />
                </div>
              </div>

              <div className="wl-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="wl-label">Work Email *</label>
                  <input required type="email" name="email" className="wl-input" placeholder="rajesh@agency.com" value={formData.email} onChange={handleChange} />
                </div>
                <div>
                  <label className="wl-label">Agency Name *</label>
                  <input required type="text" name="agencyName" className="wl-input" placeholder="SK Properties" value={formData.agencyName} onChange={handleChange} />
                </div>
              </div>

              <div className="wl-field">
                <label className="wl-label">Biggest challenge with leads right now?</label>
                <textarea name="painPoints" className="wl-textarea" placeholder="e.g. Leads go cold because my team replies too slowly..." value={formData.painPoints} onChange={handleChange} />
              </div>

              <button type="submit" className="wl-submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Submitting...' : (
                  <>
                    Join the Waitlist — Lock in ₹999/month
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                  </>
                )}
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#9E9B92', marginTop: 16 }}>
                No spam. No credit card. We will only contact you about your waitlist status.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="wl-footer animate-up">
        <div className="wl-container">
          <div className="wl-footer-copy">&copy; {new Date().getFullYear()} LeadNest. All rights reserved.</div>
          <div className="wl-footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </footer>

      {/* Demo complete modal */}
      {demoStep === 3 && (
        <div className="wl-modal-overlay">
          <div className="wl-modal-content">
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 12, color: '#1A1916' }}>
              That is the engine.
            </h2>
            <p style={{ fontSize: 15, color: '#6B6860', marginBottom: 28, lineHeight: 1.6 }}>
              You just experienced what your leads will feel — instant, contextual, multilingual. Ready to automate your WhatsApp?
            </p>
            <button className="wl-btn-primary" style={{ width: '100%', justifyContent: 'center', borderRadius: 10 }}
              onClick={() => { setDemoStep(4); scrollToForm(); }}>
              Join the Waitlist — Secure ₹999/month
            </button>
            <button onClick={() => setDemoStep(4)}
              style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#9E9B92', cursor: 'pointer', fontSize: 13 }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
