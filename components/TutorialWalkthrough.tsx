'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Screen } from '@/app/dashboard/page'

type Rect = { top: number; left: number; width: number; height: number }

interface Step {
  title: string
  text: string
  tip?: string             // optional 💡 tip line in the card
  voice?: string           // spoken narration (falls back to text, emoji-stripped)
  target?: string          // CSS selector to spotlight; omit for a centered card
  navigate?: Screen        // screen to switch to before showing this step
  doneEvent?: string       // if set, Next stays locked until this tour-action fires
  actionHint?: string      // shown while waiting for the user to perform the action
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Convorian',
    text: 'Let us walk through the full bot journey from hello to booked visit, then show where the appointment appears and how follow-up works.',
    voice: 'Welcome to Convorian. Let us walk through the full bot journey from hello to booked visit, then show where the appointment appears and how follow-up works.',
  },
  {
    title: 'Open the demo lead',
    text: 'We added Priya, a sample lead, plus a matching sample property so the bot can follow the exact booking flow. This demo is safe and never goes to WhatsApp.',
    voice: 'We added a sample lead and a matching sample property so the bot can follow the booking flow. This demo is safe and never goes to WhatsApp.',
    tip: 'The sample lead and sample property auto-clean after 5 minutes.',
    navigate: 'inbox',
    target: '[data-tour="nav-inbox"]',
  },
  {
    title: 'Step 1 - Say hi',
    text: 'Tap Hi. The bot will greet the lead and ask for a language preference first.',
    voice: 'Tap Hi. The bot greets the lead and asks for a language preference first.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: 'Tap the suggested reply to continue.',
  },
  {
    title: 'Step 2 - Language and name',
    text: 'Choose a language and share the lead name. The bot should remember both and not ask again later.',
    voice: 'Choose a language and share the lead name. The bot should remember both and not ask again later.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: 'Tap the next suggested reply.',
  },
  {
    title: 'Step 3 - Qualification',
    text: 'Answer the qualification questions like area and budget. This is what lets the bot narrow down the right properties.',
    voice: 'Answer the qualification questions like area and budget. This is what lets the bot narrow down the right properties.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: 'Tap the next suggested reply.',
  },
  {
    title: 'Step 4 - Property match',
    text: 'Now the bot should show a property that matches the saved replies. The card includes price, possession, floor plan, finance, parking, and a recommendation.',
    voice: 'Now the bot should show a property that matches the saved replies. The card includes price, possession, floor plan, finance, parking, and a recommendation.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: 'Tap the next suggested reply.',
  },
  {
    title: 'Step 5 - Book the visit',
    text: 'Pick a visit time, then share an email. The bot stages the visit first and confirms it with the right appointment time.',
    voice: 'Pick a visit time, then share an email. The bot stages the visit first and confirms it with the right appointment time.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: 'Tap the suggested replies to finish booking.',
  },
  {
    title: 'Step 6 - Appointments',
    text: 'Once booked, the visit appears in Appointments. From there you can review it, cancel it with a PIN, or update the follow-up later.',
    voice: 'Once booked, the visit appears in Appointments. From there you can review it, cancel it with a PIN, or update the follow-up later.',
    navigate: 'appointments',
    target: '[data-tour="appt-list"]',
  },
  {
    title: 'Step 7 - Feedback matters',
    text: 'After the visit, log the outcome. That feedback tells the bot what to do next and keeps the nurture flow honest and useful.',
    voice: 'After the visit, log the outcome. That feedback tells the bot what to do next and keeps the nurture flow useful.',
    navigate: 'appointments',
    target: '[data-tour="appt-list"]',
  },
  {
    title: 'You are ready',
    text: 'That is the full journey: greet, qualify, match, book, confirm, manage, and close the loop with feedback. You can replay this tour anytime.',
    voice: 'That is the full journey: greet, qualify, match, book, confirm, manage, and close the loop with feedback.',
  },
]

const PAD = 8

export default function TutorialWalkthrough({ onNavigate, agentId }: { onNavigate?: (s: Screen) => void, agentId?: string }) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [guideRect, setGuideRect] = useState<Rect | null>(null)
  const [completed, setCompleted] = useState(false)
  // Replays from the profile menu are a refresher — never re-lock the
  // hands-on steps (the user already has leads/properties by then).
  const [isReplay, setIsReplay] = useState(false)
  const cleanupTimerRef = useRef<number | null>(null)

  const finish = useCallback(() => {
    localStorage.setItem('leadnest_tutorial_seen', 'true')
    // Land them on the inbox to see their leads + a "you're live" nudge.
    try {
      window.dispatchEvent(new Event('leadnest:go-inbox'))
      window.dispatchEvent(new Event('leadnest:tour-done-toast'))
    } catch { /* ignore */ }
    if (cleanupTimerRef.current) {
      window.clearTimeout(cleanupTimerRef.current)
    }
    if (agentId) {
      cleanupTimerRef.current = window.setTimeout(() => {
        fetch('/api/sample-data', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId }),
        }).catch(() => {})
      }, 5 * 60 * 1000)
    }
    setVisible(false)
    setStep(0)
    setRect(null)
    setCompleted(false)
  }, [agentId])

  // Initial mount — show only if never seen
  useEffect(() => {
    if (!localStorage.getItem('leadnest_tutorial_seen')) {
      setStep(0)
      setVisible(true)
    }
  }, [])

  // Allow re-launching from anywhere (profile menu, settings, etc.)
  useEffect(() => {
    const handler = () => {
      setStep(0)
      setCompleted(false)
      setIsReplay(true)
      if (cleanupTimerRef.current) {
        window.clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
      if (agentId) {
        fetch('/api/sample-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId }),
        }).catch(() => {})
      }
      setVisible(true)
    }
    window.addEventListener('leadnest:restart-tutorial', handler)
    return () => window.removeEventListener('leadnest:restart-tutorial', handler)
  }, [agentId])

  // Reset completion whenever the step changes
  useEffect(() => { setCompleted(false) }, [step])

  // Notify screens when tutorial is visible/hidden — so they can disable inputs, etc.
  useEffect(() => {
    if (visible) window.dispatchEvent(new Event('leadnest:tutorial-visible'))
    else window.dispatchEvent(new Event('leadnest:tutorial-hidden'))
  }, [visible])

  // Auto-advance the simulation: when the user taps a reply (sim-sent completes a
  // sim step), move to the next step automatically after a beat — no Next click.
  useEffect(() => {
    if (!visible || !completed) return
    if (STEPS[step]?.target !== '[data-tour="sim-panel"]') return
    const t = setTimeout(() => { setStep(s => (s < STEPS.length - 1 ? s + 1 : s)) }, 1300)
    return () => clearTimeout(t)
  }, [visible, completed, step])

  // When a simulation step is reached, auto-open the sample lead + start the
  // simulation in the inbox (so the user isn't stuck behind the spotlight).
  useEffect(() => {
    if (!visible) return
    if (STEPS[step]?.target === '[data-tour="sim-panel"]') {
      window.dispatchEvent(new Event('leadnest:start-simulation'))
    }
  }, [visible, step])

  useEffect(() => {
    if (!visible) return
    if (process.env.NODE_ENV === 'production') return
    console.log('[TutorialWalkthrough]', {
      step,
      title: STEPS[step]?.title,
      target: STEPS[step]?.target,
      rect,
      hole: !!(rect && STEPS[step]?.target),
      completed,
    })
  }, [visible, step, rect, completed])

  // Listen for the user completing the current step's required action
  useEffect(() => {
    if (!visible) return
    const need = STEPS[step]?.doneEvent
    if (!need) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === need) setCompleted(true)
    }
    window.addEventListener('leadnest:tour-action', handler as EventListener)
    return () => window.removeEventListener('leadnest:tour-action', handler as EventListener)
  }, [visible, step])

  // Switch screen if this step asks for it
  useEffect(() => {
    if (!visible) return
    const s = STEPS[step]
    if (s?.navigate && onNavigate) onNavigate(s.navigate)
  }, [visible, step, onNavigate])

  // Measure the target element (keep in sync on resize/scroll; scroll into view)
  useEffect(() => {
    if (!visible) return
    const s = STEPS[step]
    if (!s?.target) {
      setRect(null)
      setGuideRect(null)
      return
    }

    const measure = () => {
      const el = document.querySelector(s.target!) as HTMLElement | null
      // Target not mounted yet (we may have just navigated screens). Keep the
      // PREVIOUS spotlight so the dimmer never flashes to centre — the CSS
      // transition then glides smoothly to the new target once it appears.
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      // Bring an off-screen target into view (long screens).
      const vh = window.innerHeight
      if (r.top < 8 || r.bottom > vh - 8) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* ignore */ }
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      if (s.target === '[data-tour="sim-panel"]') {
        const guide = document.querySelector('[data-tour="sim-step-line"]') as HTMLElement | null
        if (guide) {
          const gr = guide.getBoundingClientRect()
          if (gr.width > 0 || gr.height > 0) {
            setGuideRect({ top: gr.top, left: gr.left, width: gr.width, height: gr.height })
          }
        }
      } else {
        setGuideRect(null)
      }
    }

    measure()
    const timers = [60, 140, 260, 420, 650, 900].map(ms => setTimeout(measure, ms))
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [visible, step])

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const hasTarget = !!current.target && !!rect
  const isSimTarget = current.target === '[data-tour="sim-panel"]'
  const isAction = !!current.doneEvent && !isReplay
  const nextLocked = isAction && !completed

  // Action steps sit BELOW the app's own modals (z-index 100+) so the user can
  // actually fill in the form that opens. Informational steps sit on top.
  const zBase = isAction ? 90 : 9000

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  const advance = () => { if (!nextLocked) (isLast ? finish() : setStep(step + 1)) }
  const goBack = step > 0 ? () => setStep(step - 1) : undefined

  // Spotlight geometry: the padded target rect, or a zero-size point when there's
  // no target (→ a single full-screen dim+blur panel, no hole).
  const sp = hasTarget && rect
    ? { top: rect.top - PAD, left: rect.left - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 }
    : { top: vh / 2, left: vw / 2, w: 0, h: 0 }
  const hole = sp.w > 0

  // Card placement.
  const cardW = Math.min(hasTarget ? 340 : 440, Math.max(280, vw - 32))
  const clampLeft = (x: number) => Math.min(Math.max(16, x), Math.max(16, vw - cardW - 16))
  const clampTop = (y: number) => Math.min(Math.max(16, y), Math.max(16, vh - 260))
  let cardStyle: React.CSSProperties
  let cardLeft = clampLeft(vw / 2 - cardW / 2)
  let cardTop = vh / 2 - 170
  let placement: 'right' | 'below' | 'above' | 'bottom' | 'center' = 'center'

  if (current.doneEvent) {
    // Hands-on steps (sim + add lead/property): position to the side of the target
    // so the entire chat/modal window stays visible + unblocked.
    if (current.target === '[data-tour="sim-panel"]' && hasTarget && rect) {
      // Sim steps: position the card to the right of the chat (or left if tight)
      cardLeft = clampLeft(rect.left - cardW - 96)
      cardTop = clampTop(rect.top)
      cardStyle = { top: cardTop, left: cardLeft, textAlign: 'left' }
      placement = 'right'
    } else if (current.target === '[data-tour="sim-panel"]') {
      // Sim steps (no target measured yet): fallback to bottom
      cardLeft = clampLeft(vw / 2 - cardW / 2)
      cardStyle = { bottom: 24, left: cardLeft, textAlign: 'left' }
      placement = 'bottom'
    } else {
      // Modal steps (add lead/property): pin to the bottom, out of the way
      cardLeft = clampLeft(vw / 2 - cardW / 2)
      cardStyle = { bottom: 24, left: cardLeft, textAlign: 'left' }
      placement = 'bottom'
    }
  } else if (hasTarget && rect) {
    const spaceRight = vw - (sp.left + sp.w)
    if (spaceRight >= cardW + 32) {
      cardLeft = clampLeft(sp.left + sp.w + 22)
      cardTop = clampTop(sp.top)
      cardStyle = { top: cardTop, left: cardLeft }
      placement = 'right'
    } else {
      const below = sp.top + sp.h + 22
      if (below + 240 < vh) {
        cardTop = below
        cardLeft = clampLeft(sp.left)
        cardStyle = { top: cardTop, left: cardLeft }
        placement = 'below'
      }
      else {
        cardTop = clampTop(sp.top - 252)
        cardLeft = clampLeft(sp.left)
        cardStyle = { top: cardTop, left: cardLeft }
        placement = 'above'
      }
    }
  } else {
    cardLeft = clampLeft(vw / 2 - cardW / 2)
    cardTop = vh / 2 - 170
    cardStyle = { top: cardTop, left: cardLeft, textAlign: 'center' }
    placement = 'center'
  }

  const ARROW = '#4F46E5'
  const panel: React.CSSProperties = {
    // pointerEvents:none is critical — otherwise the dim panels swallow clicks and
    // the app's own modals (Add Lead / Add Property) become unusable behind the tour.
    position: 'fixed', background: 'rgba(10,12,20,0.62)', backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)', zIndex: zBase, pointerEvents: 'none',
    transition: 'all 0.35s cubic-bezier(.4,0,.2,1)',
  }

  return (
    <>
      <style>{`
        @keyframes tourCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes tourPulse { 0% { box-shadow: 0 0 0 0 rgba(79,70,229,0.45) } 70% { box-shadow: 0 0 0 14px rgba(79,70,229,0) } 100% { box-shadow: 0 0 0 0 rgba(79,70,229,0) } }
        @keyframes tourArrowLeft { 0%,100% { transform: translateX(0) } 50% { transform: translateX(-7px) } }
        @keyframes tourArrowUp { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes tourArrowDown { 0%,100% { transform: translateY(0) } 50% { transform: translateY(7px) } }
        @keyframes tourNextPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(21,22,27,0.0) } 50% { box-shadow: 0 0 0 6px rgba(79,70,229,0.18) } }
        @keyframes tourTapBlink { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>

      {/* Dark + blurred backdrop. Four panels around the hole keep the target
          crisp AND interactive; a single panel when there's no target. */}
      {hole ? (
        <>
          <div style={{ ...panel, top: 0, left: 0, width: '100vw', height: Math.max(0, sp.top) }} />
          <div style={{ ...panel, top: sp.top + sp.h, left: 0, width: '100vw', height: Math.max(0, vh - (sp.top + sp.h)) }} />
          <div style={{ ...panel, top: sp.top, left: 0, width: Math.max(0, sp.left), height: sp.h }} />
          <div style={{ ...panel, top: sp.top, left: sp.left + sp.w, width: Math.max(0, vw - (sp.left + sp.w)), height: sp.h }} />
          {/* Pulsing glow ring around the target */}
          <div style={{ position: 'fixed', top: sp.top, left: sp.left, width: sp.w, height: sp.h, borderRadius: 12, border: `2px solid ${ARROW}`, zIndex: zBase + 1, pointerEvents: 'none', animation: 'tourPulse 1.6s ease-out infinite', transition: 'all 0.35s cubic-bezier(.4,0,.2,1)' }} />
        </>
      ) : (
        <div style={{ ...panel, top: 0, left: 0, width: '100vw', height: '100vh' }} />
      )}

      {/* "Tap here" visual guide during sim steps — below the spotlight */}
      {isSimTarget && hole && (
        <div data-testid="tour-tap-guide" style={{ position: 'fixed', top: guideRect ? Math.max(8, guideRect.top - 52) : Math.min(vh - 52, sp.top + sp.h + 8), left: guideRect ? clampLeft(guideRect.left) : clampLeft(sp.left + sp.w / 2 - 88), zIndex: zBase + 50, pointerEvents: 'none', background: '#4F46E5', color: '#fff', padding: '8px 14px', borderRadius: 24, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', animation: 'tourTapBlink 1.2s ease-in-out infinite', boxShadow: '0 6px 16px rgba(79,70,229,0.4)' }}>
          Tap a reply
        </div>
      )}

      <div key={step} style={{
        position: 'fixed', maxWidth: cardW, width: `min(${cardW}px, calc(100vw - 32px))`,
        background: '#fff', borderRadius: 16, padding: '22px 24px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.30)', zIndex: zBase + 3,
        animation: 'tourCardIn 0.28s cubic-bezier(.4,0,.2,1)',
        ...cardStyle,
      }}>
        <TourCard step={step} current={current} isLast={isLast} centered={placement === 'center'}
          nextLocked={nextLocked} completed={completed}
          onSkip={finish} onNext={advance} onBack={goBack} />
      </div>
    </>
  )
}

function TourCard({ step, current, isLast, centered, nextLocked, completed, onSkip, onNext, onBack }: {
  step: number; current: Step; isLast: boolean; centered?: boolean
  nextLocked: boolean; completed: boolean
  onSkip: () => void; onNext: () => void; onBack?: () => void
}) {
  const pct = Math.round(((step + 1) / STEPS.length) * 100)
  return (
    <>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ flex: 1, height: 4, background: '#ECEAF7', borderRadius: 4, overflow: 'hidden', marginRight: 12 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#4F46E5', borderRadius: 4, transition: 'width 0.3s ease' }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9E9B92', whiteSpace: 'nowrap' }}>{step + 1} / {STEPS.length}</div>
      </div>

      <h2 style={{ fontSize: centered ? 23 : 18, fontWeight: 600, color: '#15161B', marginBottom: 10 }}>{current.title}</h2>
      <p style={{ fontSize: centered ? 15 : 14, color: '#6B6860', lineHeight: 1.6, marginBottom: current.tip ? 12 : 16 }}>{current.text}</p>

      {current.tip && (
        <div style={{ background: '#F6F5FF', border: '1px solid #E7E4FF', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: '#4338CA', lineHeight: 1.5, marginBottom: 16, display: 'flex', gap: 7 }}>
          <span>💡</span><span>{current.tip}</span>
        </div>
      )}

      {current.doneEvent && (
        completed ? (
          <div style={{ background: '#E7F6EC', color: '#1B7A43', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
            ✓ Done! Click Next to continue.
          </div>
        ) : (
          <div style={{ background: '#FEF9E7', color: '#7A5200', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {current.actionHint || 'Complete this step to continue.'}
          </div>
        )
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <button onClick={onSkip} style={{ background: 'none', border: 'none', color: '#9E9B92', fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>
          Skip tour
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: '#F4F3EE', color: '#6B6860', border: 'none', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              Back
            </button>
          )}
          <button
            onClick={onNext}
            disabled={nextLocked}
            title={nextLocked ? 'Complete this step first' : undefined}
            style={{
              background: nextLocked ? '#D9D6CE' : '#15161B',
              color: nextLocked ? '#9E9B92' : '#fff',
              border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              cursor: nextLocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              // Pulse to draw the eye to the next action when it's unlocked.
              animation: nextLocked ? 'none' : 'tourNextPulse 1.4s ease-in-out infinite',
            }}>
            {isLast ? 'Get Started' : 'Next'} {!nextLocked && !isLast ? '→' : ''}
          </button>
        </div>
      </div>
    </>
  )
}
