'use client'

import { useState, useEffect, useCallback } from 'react'
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
    title: 'Welcome to Convorian 👋',
    text: "Let's take a quick hands-on tour. First you'll watch the AI handle a sample lead live, then add your own — by the end you'll know how to run the whole app.",
    voice: "Welcome to Convorian. Let's take a quick hands-on tour. First you'll watch the AI handle a sample lead, then add your own.",
  },
  {
    title: 'Try the bot — right now 🤖',
    text: 'We added "Priya (Sample Lead)" + sample properties so you can see the bot work before connecting WhatsApp. Click Next — we\'ll open her chat for you, and you just tap the suggested replies. Nothing goes to WhatsApp; it\'s a safe practice run.',
    voice: "We added a sample lead called Priya so you can see the bot work before connecting WhatsApp. Click Next, and just tap the suggested replies. Nothing goes out over WhatsApp — it's a safe practice run.",
    tip: 'This whole conversation is a simulation — totally safe to experiment.',
    navigate: 'inbox',
    target: '[data-tour="nav-inbox"]',
  },
  {
    title: 'Step 1 — The greeting',
    text: 'Tap the suggested "Hi" in the chat. The bot greets the lead warmly and asks their preferred language — its very first qualification move.',
    voice: 'Tap the suggested Hi. The bot greets the lead and asks their preferred language — its first qualification step.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: '👉 Tap a suggested reply in the chat to continue.',
  },
  {
    title: 'Step 2 — Understanding the need',
    text: 'Tap the next suggested reply. From plain English the bot extracts buy-vs-rent, the area, and the BHK — no forms, just natural conversation.',
    voice: 'Tap the next reply. From plain English, the bot works out whether they want to buy or rent, the area, and the number of bedrooms — no forms.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: '👉 Tap the suggested reply.',
  },
  {
    title: 'Step 3 — Qualifying the lead',
    text: 'Keep answering what it asks (name, budget). The bot builds a full profile so it only ever shows the RIGHT properties — never wasting the lead\'s time or yours.',
    voice: 'Keep answering — name, budget. The bot builds a full profile so it only ever shows the right properties.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: '👉 Tap a suggested reply.',
  },
  {
    title: 'Step 4 — The perfect match',
    text: 'Now the bot presents a property from YOUR list that fits — with real, verified details (it never invents facts). Tap the reply to show interest.',
    voice: 'Now the bot presents a property from your list that fits, with real verified details. It never invents facts. Tap to show interest.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: '👉 Tap the suggested reply.',
  },
  {
    title: 'Step 5 — Booking the visit',
    text: 'Give a day/time and your email — the bot books the site visit and emails the confirmation to BOTH you and the lead. Tap through to finish, then click Next.',
    voice: 'Give a day, time, and your email. The bot books the site visit and emails the confirmation to both you and the lead. Tap through to finish.',
    navigate: 'inbox',
    target: '[data-tour="sim-panel"]',
    doneEvent: 'sim-sent',
    actionHint: '👉 Tap the suggested replies to finish booking.',
  },
  {
    title: 'The visit is booked 🎉',
    text: 'The bot just qualified the lead and booked a site visit — completely on its own. Here it is on your Appointments page.',
    voice: 'The bot just qualified the lead and booked a site visit, completely on its own. Here it is on your Appointments page.',
    navigate: 'appointments',
    target: '[data-tour="appt-list"]',
  },
  {
    title: 'Manage every appointment',
    text: 'Every booked visit lands here. You can reschedule or CANCEL it right here (cancelling needs your PIN). After a visit, log the feedback so the bot follows up to close the deal.',
    voice: 'Every booked visit lands here. You can reschedule or cancel it, which needs your PIN. After a visit, log the feedback so the bot follows up to close the deal.',
    tip: 'Logging visit feedback is what powers the bot\'s follow-ups — don\'t skip it.',
    navigate: 'appointments',
    target: '[data-tour="appt-list"]',
  },
  {
    title: 'Your AI Sales Bot',
    text: 'This is your profile and bot switch. When active, the bot qualifies leads, answers on WhatsApp, and books site visits 24/7. Pausing it needs your PIN (default 1234).',
    voice: 'This is your bot switch. When active, the bot answers, qualifies, and books visits 24/7. Pausing it needs your PIN — the default is one two three four.',
    tip: 'Change your PIN from Settings — the default 1234 is for everyone.',
    target: '[data-tour="agent-card"]',
  },
  {
    title: 'Now add your own Lead',
    text: 'Click "+ Add Lead", enter a name and WhatsApp number, and save. (Leads also arrive automatically when someone messages you.) Try it now — this unlocks once your lead is added.',
    voice: 'Now add your own lead. Click Add Lead, enter a name and WhatsApp number, and save. This unlocks once your lead is added.',
    navigate: 'leads',
    target: '[data-tour="add-lead"]',
    doneEvent: 'lead-added',
    actionHint: '👉 Add a lead using the highlighted button to continue.',
  },
  {
    title: 'Add your own Property',
    text: 'Click "+ Add detailed property" and fill in price, location, BHK and features. Your AI uses these to recommend matches to leads. Add one to continue.',
    voice: 'Add your own property. Click Add detailed property and fill in price, location, bedrooms and features. The AI uses these to match leads.',
    navigate: 'properties',
    target: '[data-tour="add-property"]',
    doneEvent: 'property-added',
    actionHint: '👉 Add a property using the highlighted button to continue.',
  },
  {
    title: 'Track your ROI',
    text: 'See pipeline value, conversion rates, and estimated commission — split across rentals and purchases — so you always know what Convorian earns you.',
    voice: 'Track your ROI here — pipeline value, conversion rates, and estimated commission, so you always know what Convorian earns you.',
    navigate: 'analytics',
    target: '[data-tour="nav-analytics"]',
  },
  {
    title: 'Connect WhatsApp',
    text: 'When you\'re ready to go live, connect your WhatsApp number here. WhatsApp messages are billed directly by Meta to your own account — no markup from us. Our team can help with setup.',
    voice: "When you're ready to go live, connect your WhatsApp number here. Messages are billed directly by Meta to your own account, with no markup from us.",
    tip: 'Not sure how? Our team will help you connect — just ask from here.',
    navigate: 'balance',
    target: '[data-tour="wa-topup"]',
  },
  {
    title: "You're all set! 🎉",
    text: "That's the whole flow: experience the bot → add leads & properties → let it convert them → log visit feedback to close. Replay this tour anytime from the profile menu (top-right).",
    voice: "That's it — you're all set. Experience the bot, add your leads and properties, and let it convert them. You can replay this tour anytime from the profile menu.",
  },
]

const PAD = 8

export default function TutorialWalkthrough({ onNavigate }: { onNavigate?: (s: Screen) => void }) {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [completed, setCompleted] = useState(false)
  // Replays from the profile menu are a refresher — never re-lock the
  // hands-on steps (the user already has leads/properties by then).
  const [isReplay, setIsReplay] = useState(false)

  const finish = useCallback(() => {
    localStorage.setItem('leadnest_tutorial_seen', 'true')
    // Land them on the inbox to see their leads + a "you're live" nudge.
    try {
      window.dispatchEvent(new Event('leadnest:go-inbox'))
      window.dispatchEvent(new Event('leadnest:tour-done-toast'))
    } catch { /* ignore */ }
    setVisible(false)
    setStep(0)
    setRect(null)
    setCompleted(false)
  }, [])

  // Initial mount — show only if never seen
  useEffect(() => {
    if (!localStorage.getItem('leadnest_tutorial_seen')) {
      setStep(0)
      setVisible(true)
    }
  }, [])

  // Allow re-launching from anywhere (profile menu, settings, etc.)
  useEffect(() => {
    const handler = () => { setStep(0); setCompleted(false); setIsReplay(true); setVisible(true) }
    window.addEventListener('leadnest:restart-tutorial', handler)
    return () => window.removeEventListener('leadnest:restart-tutorial', handler)
  }, [])

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
    if (!s?.target) { setRect(null); return }

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
  let placement: 'right' | 'below' | 'above' | 'bottom' | 'center' = 'center'

  if (current.doneEvent) {
    // Hands-on steps (sim + add lead/property): position to the side of the target
    // so the entire chat/modal window stays visible + unblocked.
    if (current.target === '[data-tour="sim-panel"]' && hasTarget && rect) {
      // Sim steps: position the card to the right of the chat (or left if tight)
      const spaceRight = vw - (rect.left + rect.width)
      if (spaceRight >= cardW + 32) {
        cardStyle = { top: clampTop(rect.top), left: clampLeft(rect.left + rect.width + 16), textAlign: 'left' }
        placement = 'right'
      } else {
        const spaceLeft = rect.left
        if (spaceLeft >= cardW + 16) {
          // Snap the card's right edge to the chat's left edge (no gap)
          cardStyle = { top: clampTop(rect.top), left: clampLeft(rect.left - cardW), textAlign: 'left' }
          placement = 'right'
        } else {
          cardStyle = { top: clampTop(rect.top - 252), left: clampLeft(rect.left), textAlign: 'left' }
          placement = 'above'
        }
      }
    } else if (current.target === '[data-tour="sim-panel"]') {
      // Sim steps (no target measured yet): fallback to bottom
      cardStyle = { bottom: 24, left: clampLeft(vw / 2 - cardW / 2), textAlign: 'left' }
      placement = 'bottom'
    } else {
      // Modal steps (add lead/property): pin to the bottom, out of the way
      cardStyle = { bottom: 24, left: clampLeft(vw / 2 - cardW / 2), textAlign: 'left' }
      placement = 'bottom'
    }
  } else if (hasTarget && rect) {
    const spaceRight = vw - (sp.left + sp.w)
    if (spaceRight >= cardW + 32) {
      cardStyle = { top: clampTop(sp.top), left: clampLeft(sp.left + sp.w + 22) }
      placement = 'right'
    } else {
      const below = sp.top + sp.h + 22
      if (below + 240 < vh) { cardStyle = { top: below, left: clampLeft(sp.left) }; placement = 'below' }
      else { cardStyle = { top: clampTop(sp.top - 252), left: clampLeft(sp.left) }; placement = 'above' }
    }
  } else {
    cardStyle = { top: vh / 2 - 170, left: clampLeft(vw / 2 - cardW / 2), textAlign: 'center' }
    placement = 'center'
  }

  // Animated arrow pointing at the target (only for non-action targeted steps).
  const ARROW = '#4F46E5'
  let arrow: React.ReactNode = null
  if (hole && (placement === 'right' || placement === 'below' || placement === 'above')) {
    const cx = sp.left + sp.w / 2
    const cy = sp.top + sp.h / 2
    if (placement === 'right') {
      arrow = <div style={{ position: 'fixed', top: cy - 9, left: sp.left + sp.w + 4, zIndex: zBase + 2, width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderRight: `13px solid ${ARROW}`, filter: `drop-shadow(0 0 4px ${ARROW})`, animation: 'tourArrowLeft 0.9s ease-in-out infinite', transition: 'top .35s, left .35s' }} />
    } else if (placement === 'below') {
      arrow = <div style={{ position: 'fixed', top: sp.top + sp.h + 4, left: cx - 9, zIndex: zBase + 2, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: `13px solid ${ARROW}`, filter: `drop-shadow(0 0 4px ${ARROW})`, animation: 'tourArrowUp 0.9s ease-in-out infinite', transition: 'top .35s, left .35s' }} />
    } else {
      arrow = <div style={{ position: 'fixed', top: sp.top - 17, left: cx - 9, zIndex: zBase + 2, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `13px solid ${ARROW}`, filter: `drop-shadow(0 0 4px ${ARROW})`, animation: 'tourArrowDown 0.9s ease-in-out infinite', transition: 'top .35s, left .35s' }} />
    }
  }

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

      {arrow}

      {/* "Tap here" visual guide during sim steps */}
      {current.target === '[data-tour="sim-panel"]' && hole && (
        <div style={{ position: 'fixed', bottom: sp.top + sp.h + 12, left: sp.left + sp.w / 2 - 60, zIndex: zBase + 2, background: '#4F46E5', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', animation: 'tourTapBlink 1.2s ease-in-out infinite', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
          ↓ Tap a reply
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
