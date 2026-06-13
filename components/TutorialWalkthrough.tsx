'use client'

import { useState, useEffect, useCallback } from 'react'
import { Screen } from '@/app/dashboard/page'

type Rect = { top: number; left: number; width: number; height: number }

interface Step {
  title: string
  text: string
  target?: string          // CSS selector to spotlight; omit for a centered card
  navigate?: Screen        // screen to switch to before showing this step
  doneEvent?: string       // if set, Next stays locked until this tour-action fires
  actionHint?: string      // shown while waiting for the user to perform the action
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Convorian 👋',
    text: "Let's take a quick hands-on tour. You'll actually add your first lead and property as we go — by the end you'll know how to run the whole app."
  },
  {
    title: 'Your AI Sales Bot',
    text: 'This is your profile and bot switch. When active, the bot qualifies leads, answers on WhatsApp, and books site visits 24/7. Pausing it needs your PIN (default 1234).',
    target: '[data-tour="agent-card"]'
  },
  {
    title: 'Step 1 — Add your first Lead',
    text: 'Click "+ Add Lead", enter a name and WhatsApp number, and save. (Leads also arrive automatically when someone messages you.) Try it now — this step unlocks once your lead is added.',
    navigate: 'leads',
    target: '[data-tour="add-lead"]',
    doneEvent: 'lead-added',
    actionHint: '👉 Add a lead using the highlighted button to continue.'
  },
  {
    title: 'Step 2 — Add your first Property',
    text: 'Click "+ Add detailed property" and fill in price, location, BHK and features. Your AI uses these to recommend matches to leads. Add one to continue.',
    navigate: 'properties',
    target: '[data-tour="add-property"]',
    doneEvent: 'property-added',
    actionHint: '👉 Add a property using the highlighted button to continue.'
  },
  {
    title: 'Step 3 — The Inbox',
    text: 'Every conversation lives here. The bot replies on its own, but you can "Take over" to chat manually, "Simulate lead" to test it, or "Book visit" to schedule a site visit.',
    navigate: 'inbox',
    target: '[data-tour="nav-inbox"]'
  },
  {
    title: 'Step 4 — Appointments',
    text: 'Booked site visits show here. After a visit, log the feedback — the AI uses your notes to follow up and push the lead toward a purchase. This is how Convorian closes deals.',
    navigate: 'appointments',
    target: '[data-tour="nav-appointments"]'
  },
  {
    title: 'Track your ROI',
    text: 'See pipeline value, conversion rates, and estimated commission — split across rentals and purchases — so you always know what Convorian earns you.',
    navigate: 'analytics',
    target: '[data-tour="nav-analytics"]'
  },
  {
    title: 'WhatsApp Balance',
    text: 'Your bot uses WhatsApp balance to send messages. Top it up here whenever you need — quick amounts or a custom value.',
    navigate: 'balance',
    target: '[data-tour="wa-topup"]'
  },
  {
    title: "You're all set! 🎉",
    text: "That's the whole flow: add leads → list properties → let the bot convert them → log visit feedback to close. Replay this tour anytime from the profile menu (top-right)."
  }
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

  // Measure the target element (and keep it in sync on resize/scroll)
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
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    measure()
    // The target may live in a screen we just navigated to — retry while it mounts
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

  // ── Single persistent overlay tree ─────────────────────────────────────────
  // The dimmer + spotlight + card stay MOUNTED across every step and animate
  // between positions. Unmounting between steps is what caused the old
  // "flash-bang" (full dark flash, then a new spotlight popping in).

  // Spotlight geometry: a real target, or a zero-size point at screen centre
  // (the 9999px shadow still dims the whole screen evenly → no flash).
  const sp = hasTarget && rect
    ? { top: rect.top - PAD, left: rect.left - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 }
    : { top: vh / 2, left: vw / 2, w: 0, h: 0 }

  // Card placement. Every position is clamped inside the viewport so the card
  // can never render off-screen. Action steps (which open the app's own modal)
  // pin the card to the bottom-centre as a stable instruction banner instead of
  // chasing the highlighted button behind the modal.
  const cardW = hasTarget ? 320 : 420
  const clampLeft = (x: number) => Math.min(Math.max(16, x), Math.max(16, vw - cardW - 16))
  const clampTop = (y: number) => Math.min(Math.max(16, y), Math.max(16, vh - 240))
  let cardStyle: React.CSSProperties
  let arrow: React.ReactNode = null

  if (isAction) {
    // Bottom-centre banner — out of the way of the form modal, always on-screen.
    cardStyle = { bottom: 24, left: clampLeft(vw / 2 - cardW / 2), textAlign: 'left' }
  } else if (hasTarget && rect) {
    const spaceRight = vw - (sp.left + sp.w)
    const placeRight = spaceRight >= cardW + 28 // only go right if it actually fits
    if (placeRight) {
      cardStyle = { top: clampTop(sp.top), left: clampLeft(sp.left + sp.w + 18) }
      arrow = (
        <div style={{
          position: 'fixed', top: rect.top + rect.height / 2 - 8,
          left: sp.left + sp.w + 4, zIndex: zBase + 2,
          width: 0, height: 0, borderTop: '8px solid transparent', borderBottom: '8px solid transparent',
          borderRight: '12px solid #fff', filter: 'drop-shadow(-2px 0 2px rgba(0,0,0,0.08))',
          transition: 'top 0.35s cubic-bezier(.4,0,.2,1), left 0.35s cubic-bezier(.4,0,.2,1)'
        }} />
      )
    } else {
      // Below the target if there's room, else above it — always clamped.
      const below = sp.top + sp.h + 18
      const placeBelow = below + 240 < vh
      cardStyle = { top: clampTop(placeBelow ? below : sp.top - 240), left: clampLeft(sp.left) }
    }
  } else {
    cardStyle = { top: vh / 2 - 170, left: clampLeft(vw / 2 - cardW / 2), textAlign: 'center' }
  }

  return (
    <>
      <style>{`@keyframes tourCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
      {/* Dimmer + spotlight (one element, animates between steps) */}
      <div style={{
        position: 'fixed', top: sp.top, left: sp.left, width: sp.w, height: sp.h,
        borderRadius: 10,
        boxShadow: `0 0 0 9999px rgba(0,0,0,${isAction ? 0.5 : 0.6})`,
        border: sp.w > 0 ? '2px solid #4F46E5' : 'none',
        zIndex: zBase, pointerEvents: 'none',
        transition: 'all 0.35s cubic-bezier(.4,0,.2,1)'
      }} />
      {arrow}
      {/* keyed by step → gentle fade/slide per step, while overlay stays put */}
      <div key={step} style={{
        position: 'fixed', maxWidth: cardW, width: '100%',
        background: '#fff', borderRadius: 16, padding: '24px 28px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)', zIndex: zBase + 3,
        animation: 'tourCardIn 0.28s cubic-bezier(.4,0,.2,1)',
        ...cardStyle
      }}>
        <TourCard step={step} current={current} isLast={isLast} centered={!hasTarget} nextLocked={nextLocked} completed={completed} onSkip={finish} onNext={advance} onBack={goBack} />
      </div>
    </>
  )
}

function TourCard({ step, current, isLast, centered, nextLocked, completed, onSkip, onNext, onBack }: {
  step: number; current: Step; isLast: boolean; centered?: boolean
  nextLocked: boolean; completed: boolean
  onSkip: () => void; onNext: () => void; onBack?: () => void
}) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A5FA5', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Step {step + 1} of {STEPS.length}
      </div>
      <h2 style={{ fontSize: centered ? 24 : 19, fontWeight: 600, color: '#15161B', marginBottom: 12 }}>{current.title}</h2>
      <p style={{ fontSize: centered ? 15 : 14, color: '#6B6860', lineHeight: 1.6, marginBottom: 16 }}>{current.text}</p>

      {/* Action status banner for hand-holding steps */}
      {current.doneEvent && (
        completed ? (
          <div style={{ background: '#EEF0FE', color: '#4338CA', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
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
              cursor: nextLocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
            }}>
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}
