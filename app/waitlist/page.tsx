'use client'

import { useState, useRef, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import './waitlist.css'

const WELCOME_MESSAGES: Record<string, string> = {
  'English': "Hi! I'm Aisha, your AI assistant for The Azure Villas. How can I help you today?",
  'Hindi': "नमस्ते! मैं 'द एज़्योर विलाज़' के लिए आपकी एआई सहायक आयशा हूँ। आज मैं आपकी कैसे मदद कर सकती हूँ?",
  'Marathi': "नमस्कार! मी 'द अझ्योर व्हिलाज' साठी तुमची एआय असिस्टंट आयशा आहे. आज मी तुमची कशी मदत करू शकते?",
  'Gujarati': "નમસ્તે! હું 'ધ એઝ્યોર વિલાઝ' માટે તમારી એઆઈ સહાયક આયશા છું. આજે હું તમારી કેવી રીતે મદદ કરી શકું?"
}

export default function WaitlistPage() {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', agencyName: '', currentCrm: '', painPoints: '', featureRequests: ''
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Chat Demo State
  const [language, setLanguage] = useState('English')
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: WELCOME_MESSAGES['English'] }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [demoStep, setDemoStep] = useState(0) // 0: Start, 1: 1st Reply, 2: 2nd Reply, 3: Modal, 4: Done
  const chatBodyRef = useRef<HTMLDivElement>(null)

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
        pain_points: formData.painPoints, feature_requests: formData.featureRequests
      }])
      if (error) throw error
      setStatus('success')
    } catch (err: any) {
      console.error(err)
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

  // Intersection Observer for Scroll Animations
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
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    const hiddenElements = document.querySelectorAll('.animate-up')
    hiddenElements.forEach(el => observer.observe(el))

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
        throw new Error(data.error || 'Failed to send message')
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
        setDemoStep(prev => prev === 2 ? 3 : prev + 1)
      }
    } catch (error) {
      console.error(error)
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I'm having trouble connecting right now." }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const renderMessageContent = (content: string) => {
    if (content.includes('[SHOW_IMAGES]')) {
      const text = content.replace('[SHOW_IMAGES]', '').trim()
      return (
        <div>
          {text && <div style={{ marginBottom: '8px' }}>{text}</div>}
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

  if (status === 'success') {
    return (
      <div className="waitlist-app">
        <div className="wl-form-section" style={{ flex: 1, alignItems: 'center' }}>
          <div className="wl-form-card animate-up" style={{ textAlign: 'center' }}>
            <div className="wl-success">
              <div className="wl-success-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <h3>You're on the list!</h3>
              <p>Thank you for your interest in LeadNest. We'll be in touch as soon as we launch to help you supercharge your real estate conversions.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="waitlist-app">
      {/* Navigation */}
      <nav className="waitlist-nav animate-up">
        <div className="wl-container">
          <div className="wl-logo">
            <div className="wl-logo-dot">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="wl-logo-name">LeadNest</span>
          </div>
          <button 
            onClick={() => document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })}
            className="wl-btn-primary"
            style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '30px' }}
          >
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="wl-hero">
        <div className="wl-container">
          <div className="wl-hero-content animate-up delay-100">
            <h1 className="wl-h1">We are a <em>Conversion Engine</em>, not just a chat bot.</h1>
            <p className="wl-sub">
              Stop losing leads to slow response times. LeadNest instantly engages, qualifies, and nurtures your WhatsApp inquiries 24/7, turning conversations into closed deals.
            </p>
            
            <div className="wl-demo-guide">
              <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--ink)' }}>How to experience the engine:</h4>
            <ul style={{ paddingLeft: '20px', fontSize: '14px', color: 'var(--ink-3)', lineHeight: 1.6 }}>
              <li><strong>Switch languages:</strong> See our native multilingual capabilities in action.</li>
              <li><strong>Ask for photos:</strong> Watch the engine seamlessly share rich media of the property.</li>
              <li><strong>Inquire about price:</strong> Experience our professional qualification flow.</li>
            </ul>
          </div>

          <div className="wl-hero-cta" style={{ marginTop: '32px' }}>
            <button 
              className="wl-btn-primary"
              onClick={() => document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Get Early Access
            </button>
            <div className="wl-hero-guarantee">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              No credit card required
            </div>
          </div>
        </div>

        {/* Live Chat Demo Widget */}
        <div className="wl-hero-visual animate-up delay-200">
          
          <div className="wl-demo-tooltip-container">
            {demoStep === 0 && (
              <div className="wl-demo-tooltip visible">👋 Try chatting with the AI! Click a suggestion below.</div>
            )}
            {demoStep === 1 && (
              <div className="wl-demo-tooltip visible">⚡ Notice the speed? The engine instantly parses intent and responds contextually in under 5 seconds.</div>
            )}
            {demoStep === 2 && (
              <div className="wl-demo-tooltip visible">🎯 Context-aware: It qualifies leads and handles rich media while maintaining a premium tone.</div>
            )}
          </div>

          <div className="wl-mockup-card">
            <div className="wl-mockup-header">
              <div className="wl-mockup-header-left">
                <div className="wl-mockup-dots">
                  <span></span><span></span><span></span>
                </div>
                <div className="wl-mockup-title">Try our AI Demo</div>
              </div>
              <select className="wl-lang-select" value={language} onChange={handleLanguageChange}>
                <option value="English">English</option>
                <option value="Hindi">हिंदी (Hindi)</option>
                <option value="Marathi">मराठी (Marathi)</option>
                <option value="Gujarati">ગુજરાતી (Gujarati)</option>
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
                <span className="wl-hint-label">Try asking:</span>
                <button type="button" className="wl-hint-pill" onClick={() => setChatInput("Can I see some pictures of the villa?")}>"Show me some pictures"</button>
                <button type="button" className="wl-hint-pill" onClick={() => setChatInput("What is the price of these villas?")}>"What is the price?"</button>
              </div>
              <form className="wl-chat-form" onSubmit={sendChatMessage}>
                <input 
                  type="text" 
                  className="wl-chat-input" 
                  placeholder={limitReached ? "Demo complete" : "Ask about The Azure Villas..."} 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={limitReached || isChatLoading}
                />
                <button type="submit" className="wl-chat-send" disabled={limitReached || isChatLoading || !chatInput.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </form>
              {limitReached && <div className="wl-chat-limit-msg">Session limit reached. Please join the waitlist!</div>}
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="wl-trust animate-up delay-300">
        <div className="wl-container">
          <div className="wl-trust-inner">
            <div className="wl-avatars">
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&q=80&fit=crop" alt="Agent 1" /></div>
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&q=80&fit=crop" alt="Agent 2" /></div>
              <div className="wl-avatar"><img src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&q=80&fit=crop" alt="Agent 3" /></div>
              <div className="wl-avatar">500+</div>
            </div>
            <div className="wl-trust-text">Join 500+ forward-thinking real estate agencies on the waitlist</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="wl-features">
        <div className="wl-container">
          <div className="wl-feat-card animate-up delay-100">
            <div className="wl-feat-icon">⚡️</div>
            <h3 className="wl-feat-title">Instant Response</h3>
            <p className="wl-feat-desc">Engage leads within seconds of them reaching out, ensuring they never go cold while waiting for a human.</p>
          </div>
          <div className="wl-feat-card animate-up delay-200">
            <div className="wl-feat-icon">🎯</div>
            <h3 className="wl-feat-title">Smart Qualification</h3>
            <p className="wl-feat-desc">Our AI understands budgets, preferred areas, and property types, segmenting high-intent buyers automatically.</p>
          </div>
          <div className="wl-feat-card animate-up delay-300">
            <div className="wl-feat-icon">📅</div>
            <h3 className="wl-feat-title">Automated Booking</h3>
            <p className="wl-feat-desc">Seamlessly books site visits and syncs directly with your team's calendar without any manual intervention.</p>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="wl-comparison animate-up">
        <div className="wl-container">
          <div className="wl-comp-inner">
            <h2 className="wl-comp-title">Why choose LeadNest?</h2>
            <table className="wl-comp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Traditional Solutions</th>
                  <th>LeadNest</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Response Speed</td>
                  <td>Hours to Days</td>
                  <td className="wl-feat-highlight">Under 5 seconds</td>
                </tr>
                <tr>
                  <td>Lead Nurturing</td>
                  <td>Manual follow-ups</td>
                  <td className="wl-feat-highlight">Context-aware AI</td>
                </tr>
                <tr>
                  <td>Availability</td>
                  <td>9 AM to 6 PM</td>
                  <td className="wl-feat-highlight">24/7/365</td>
                </tr>
                <tr>
                  <td>Setup Time</td>
                  <td>Weeks of training</td>
                  <td className="wl-feat-highlight">5 minutes</td>
                </tr>
                <tr>
                  <td>Introductory Pricing</td>
                  <td>₹10,000+ / month</td>
                  <td className="wl-feat-highlight">₹999 / month</td>
                </tr>
              </tbody>
            </table>

            <div className="wl-pricing animate-up delay-200">
              <div className="wl-pricing-val">₹999 <span>/ month</span></div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '15px', marginTop: '10px' }}>Exclusive early access pricing. Lock in your rate by joining the waitlist.</p>
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
              <p>Tell us about your agency so we can prioritize your access.</p>
            </div>

            {errorMsg && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>{errorMsg}</div>}

            <form onSubmit={handleSubmit}>
              <div className="wl-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="wl-label">Full Name *</label>
                  <input required type="text" name="name" className="wl-input" placeholder="Rajesh Kumar" value={formData.name} onChange={handleChange} />
                </div>
                <div>
                  <label className="wl-label">Phone Number *</label>
                  <input required type="tel" name="phone" className="wl-input" placeholder="+91 9876543210" value={formData.phone} onChange={handleChange} />
                </div>
              </div>

              <div className="wl-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                <label className="wl-label">Current CRM / Software</label>
                <input type="text" name="currentCrm" className="wl-input" placeholder="e.g. Salesforce, Excel, None" value={formData.currentCrm} onChange={handleChange} />
              </div>

              <div className="wl-field">
                <label className="wl-label">Biggest challenge with leads right now?</label>
                <textarea name="painPoints" className="wl-textarea" placeholder="e.g. Leads go cold because my team doesn't reply fast enough." value={formData.painPoints} onChange={handleChange} />
              </div>

              <div className="wl-field">
                <label className="wl-label">What feature is a must-have for you?</label>
                <textarea name="featureRequests" className="wl-textarea" placeholder="e.g. Integration with Facebook Lead Ads." value={formData.featureRequests} onChange={handleChange} />
              </div>

              <button type="submit" className="wl-submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Submitting...' : 'Join the Waitlist'}
                {!status && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>}
              </button>
              <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--ink-4)', marginTop: '20px' }}>
                We respect your privacy. No spam, ever. We'll only contact you regarding your waitlist status.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="wl-footer animate-up">
        <div className="wl-container">
          <div>&copy; {new Date().getFullYear()} LeadNest. All rights reserved.</div>
          <div className="wl-footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact Us</a>
          </div>
        </div>
      </footer>

      {/* Final Demo Modal */}
      {demoStep === 3 && (
        <div className="wl-modal-overlay">
          <div className="wl-modal-content">
            <h2 className="wl-h1" style={{ fontSize: '32px', marginBottom: '16px' }}>Demo Complete</h2>
            <p className="wl-sub" style={{ marginBottom: '32px' }}>
              You've just experienced the future of real estate lead conversion. Ready to automate your WhatsApp inquiries?
            </p>
            <button 
              className="wl-btn-primary" 
              onClick={() => {
                setDemoStep(4);
                document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ width: '100%' }}
            >
              Join the Waitlist Now
            </button>
            <button 
              onClick={() => setDemoStep(4)} 
              style={{ background: 'none', border: 'none', color: 'var(--ink-4)', marginTop: '20px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
