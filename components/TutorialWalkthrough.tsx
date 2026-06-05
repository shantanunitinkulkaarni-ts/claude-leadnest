'use client'

import { useState, useEffect } from 'react'

export default function TutorialWalkthrough({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const hasSeen = localStorage.getItem('leadnest_tutorial_seen')
    if (hasSeen) {
      onComplete()
    }
  }, [onComplete])

  const steps = [
    { title: "Welcome to LeadNest", text: "This is your command center. Let us show you around so you can start converting leads on autopilot." },
    { title: "Your AI Sales Bot", text: "Here you can see your bot's activity. The AI automatically qualifies leads and schedules site visits for you." },
    { title: "Add your Properties", text: "Head over to the Properties tab to add your listings. The AI will read them and recommend the best matches to your leads." },
    { title: "Manage WhatsApp Balance", text: "Your bot needs WhatsApp balance to send messages. You can top it up anytime in the Settings or Balance tab." },
    { title: "You're all set!", text: "Add a test lead and see the magic happen in the Inbox tab." }
  ]

  if (!mounted) return null
  if (step >= steps.length) {
    localStorage.setItem('leadnest_tutorial_seen', 'true')
    onComplete()
    return null
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 99998,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff', padding: '32px 40px', borderRadius: 24,
        maxWidth: 420, width: '100%', textAlign: 'center',
        boxShadow: '0 24px 48px rgba(0,0,0,0.2)', position: 'relative', zIndex: 99999
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A5FA5', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Step {step + 1} of {steps.length}
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: '#1A1916', marginBottom: 16 }}>{steps[step].title}</h2>
        <p style={{ fontSize: 15, color: '#6B6860', lineHeight: 1.6, marginBottom: 32 }}>
          {steps[step].text}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={() => {
              localStorage.setItem('leadnest_tutorial_seen', 'true')
              onComplete()
            }}
            style={{ background: 'none', border: 'none', color: '#9E9B92', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
          >
            Skip
          </button>
          <button 
            onClick={() => setStep(step + 1)}
            style={{ background: '#1A1916', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
          >
            {step === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
