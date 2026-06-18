'use client'

import { useState, useRef, useEffect } from 'react'
import './LiveChatDemo.css'

const WELCOME_MESSAGES: Record<string, string> = {
  'English': "Hi! I'm Aisha, your AI assistant for The Azure Villas. How can I help you today?",
  'Hindi': "नमस्ते! मैं 'द एज़्योर विलाज़' के लिए आपकी एआई सहायक आयशा हूँ। आज मैं आपकी कैसे मदद कर सकती हूँ?",
  'Marathi': "नमस्कार! मी 'द अझ्योर व्हिलाज' साठी तुमची एआय असिस्टंट आयशा आहे. आज मी तुमची कशी मदत करू शकते?",
  'Gujarati': "નમસ્તે! હું 'ધ એઝ્યોર વિલાઝ' માટે તમારી એઆઈ સહાયક આયશા છું. આજે હું તમારી કેવી રીતે મદત કરી શકું?"
}

export default function LiveChatDemo() {
  const [language, setLanguage] = useState('English')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: WELCOME_MESSAGES['English'] }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const chatBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
  }, [messages, isChatLoading])

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value
    setLanguage(newLang)
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[newLang] || WELCOME_MESSAGES['English'] }])
    setLimitReached(false)
  }

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

  return (
    <div className="wl-hero-visual" style={{ maxWidth: 440, width: '100%', margin: '0 auto' }}>
      <div className="wl-demo-tooltip-container">
        {demoStep === 0 && <div className="wl-demo-tooltip">👋 Try chatting with the AI below</div>}
        {demoStep === 1 && <div className="wl-demo-tooltip">⚡ Under 5 seconds. The engine parsed intent and responded contextually.</div>}
        {demoStep === 2 && <div className="wl-demo-tooltip">🎯 Context-aware qualification — notice how it handles every detail.</div>}
        {demoStep >= 3 && <div className="wl-demo-tooltip">✅ That's the engine. Sign up to give your own leads this experience.</div>}
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
              placeholder={limitReached ? "Demo complete — sign up to continue!" : "Ask about The Azure Villas..."}
              value={chatInput} onChange={e => setChatInput(e.target.value)}
              disabled={limitReached || isChatLoading}
            />
            <button type="submit" className="wl-chat-send" disabled={limitReached || isChatLoading || !chatInput.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
          {limitReached && <div className="wl-chat-limit-msg">Session complete — sign up to get your own AI engine</div>}
        </div>
      </div>
    </div>
  )
}
