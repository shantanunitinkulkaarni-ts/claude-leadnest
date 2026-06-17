'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import LiveChatDemo from '@/components/LiveChatDemo'

const G = {
  dark: '#15161B',
  text: '#15161B',
  muted: '#6B6860',
  border: '#E8E5DF',
  green: '#4F46E5',
  greenLight: '#EEF0FE',
  gold: '#7C3AED',
  blue: '#2563EB',
  red: '#DC2626',
  grad: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
  glow: '0 12px 32px rgba(79,70,229,0.35)',
  glass: 'rgba(255,255,255,0.7)',
}

function Nav() {
  const [menu, setMenu] = useState(false)
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250,250,251,0.72)', borderBottom: `1px solid rgba(232,229,223,0.7)`, backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${G.green}, #4338CA)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>🏠</div>
          <span style={{ fontSize: 16, fontWeight: 600, color: G.dark, letterSpacing: '-0.01em' }}>Convorian</span>
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {['Features', 'Pricing', 'For Agents'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(' ', '')}`} style={{ fontSize: 13, color: G.muted, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}>
              {item}
            </a>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a href="/login" style={{ fontSize: 13, color: G.dark, textDecoration: 'none', fontWeight: 600 }}>
              Log in
            </a>
            <a href="/onboarding" style={{ padding: '8px 18px', borderRadius: 10, background: G.grad, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', boxShadow: '0 6px 16px rgba(79,70,229,0.30)' }}>
              Get Started
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section style={{ background: 'linear-gradient(180deg, #F4F3FF 0%, #FAFAFB 60%)', position: 'relative', overflow: 'hidden', paddingTop: 60, paddingBottom: 80 }}>
      <div style={{ position: 'absolute', width: 520, height: 520, background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)', top: -140, left: -120, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 420, height: 420, background: 'radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)', bottom: -120, right: -80, pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 32px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 20, background: G.greenLight, marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: G.green, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>✨ AI for Real Estate</span>
        </div>

        <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 20 }}>
          <span style={{ color: G.dark }}>Turn Every Lead Into a </span>
          <span style={{ background: G.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Sale</span>
        </h1>

        <p style={{ fontSize: 18, color: G.muted, lineHeight: 1.6, maxWidth: 700, margin: '0 auto 32px', fontWeight: 400 }}>
          Convorian is an AI sales engine built for real estate agents. Your bot answers leads 24/7, qualifies them, books site visits, and tracks ROI. Close deals on autopilot.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <a href="/onboarding" style={{ padding: '14px 32px', borderRadius: 12, background: G.grad, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', border: 'none', boxShadow: G.glow }}>
            Start Free Trial
          </a>
          <a href="#how" style={{ padding: '14px 32px', borderRadius: 12, background: '#fff', border: `1px solid ${G.border}`, color: G.dark, fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
            See How It Works
          </a>
        </div>

        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, color: G.muted, marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span>Zero setup needed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <span>AI-powered replies</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <span>Real ROI tracking</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function LiveDemo() {
  return (
    <section style={{ paddingTop: 72, paddingBottom: 72, background: 'linear-gradient(160deg, #FAFAFB 0%, #F1EFFE 100%)', borderTop: `1px solid ${G.border}`, position: 'relative', overflow: 'hidden' }} id="demo">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 20, background: G.greenLight, marginBottom: 18 }}>
            <span style={{ fontSize: 11, color: G.green, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live demo</span>
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 700, color: G.dark, letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1.15 }}>
            Talk to the AI right now
          </h2>
          <p style={{ fontSize: 16, color: G.muted, lineHeight: 1.6, marginBottom: 24 }}>
            This is the exact engine that will answer your leads. Try it — it responds in seconds, in your language, and qualifies like a real agent.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['🌐', 'Switch language — native Hindi, Marathi & English'],
              ['💬', 'Ask about price, location, or availability — it qualifies in real time'],
              ['🎯', 'Ask about price — experience the qualification flow'],
            ].map(([icon, text]) => (
              <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: G.text }}>
                <span style={{ fontSize: 18 }}>{icon}</span>{text}
              </li>
            ))}
          </ul>
        </div>
        <LiveChatDemo />
      </div>
    </section>
  )
}

function Problem() {
  const issues = [
    { icon: '📱', title: 'Leads go unanswered', desc: 'By the time you reply, they\'ve already messaged 3 other agents' },
    { icon: '⏰', title: 'Manual work kills profit', desc: 'Qualifying, nurturing, and scheduling takes 20+ hours/week' },
    { icon: '🔄', title: 'No follow-up system', desc: 'Hot leads go cold. Nobody is nurturing them until you remember' },
    { icon: '📉', title: 'Leads disappear', desc: 'You never know which leads could have closed or why they went silent' },
  ]

  return (
    <section style={{ paddingTop: 80, paddingBottom: 80, background: '#fff' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: G.dark, letterSpacing: '-0.02em', marginBottom: 16 }}>The Real Estate Agent's Problem</h2>
          <p style={{ fontSize: 16, color: G.muted, maxWidth: 600, margin: '0 auto' }}>You get leads. You lose leads. You don't know why.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ padding: 28, borderRadius: 12, border: `1px solid ${G.border}`, background: '#FAFAFB' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{issue.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: G.dark, marginBottom: 8 }}>{issue.title}</h3>
              <p style={{ fontSize: 13, color: G.muted, lineHeight: 1.6 }}>{issue.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: '24px 32px', borderRadius: 12, background: G.gold, color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Result: You close 2-3 deals/month instead of 6-8</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>Lost commission: ₹1.5-2.5L per month</div>
        </div>
      </div>
    </section>
  )
}

function Solution() {
  const features = [
    {
      num: '1',
      title: 'Instant AI Replies',
      desc: 'Bot replies in <30 seconds. Always. Warmly. In Hindi or English.',
      icon: '⚡'
    },
    {
      num: '2',
      title: 'Smart Qualification',
      desc: 'Bot asks SPIN questions. Scores leads 1-10. No lazy responses.',
      icon: '🎯'
    },
    {
      num: '3',
      title: 'Property Matching',
      desc: 'Bot knows your listings. Suggests perfect matches automatically.',
      icon: '🏡'
    },
    {
      num: '4',
      title: 'Site Visit Booking',
      desc: 'Bot books appointments directly. No back-and-forth needed.',
      icon: '📅'
    },
    {
      num: '5',
      title: 'Lead Nurturing',
      desc: '23-hour keepalive means 40% lower message costs. Smart automation.',
      icon: '🌱'
    },
    {
      num: '6',
      title: 'ROI Dashboard',
      desc: 'See every lead→deal conversion. Track commission. Prove value.',
      icon: '📊'
    },
  ]

  return (
    <section style={{ paddingTop: 80, paddingBottom: 80, background: '#FAFAFB' }} id="features">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: G.dark, letterSpacing: '-0.02em', marginBottom: 16 }}>How Convorian Works</h2>
          <p style={{ fontSize: 16, color: G.muted, maxWidth: 600, margin: '0 auto' }}>A sales engine that works while you sleep</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {features.map((f) => (
            <div key={f.num} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 44, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: G.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Feature {f.num}</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: G.dark, marginBottom: 12 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: G.muted, lineHeight: 1.6, flex: 1 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Proof() {
  return (
    <section style={{ paddingTop: 80, paddingBottom: 80, background: '#fff' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: G.dark, letterSpacing: '-0.02em', marginBottom: 16 }}>The Math That Matters</h2>
          <p style={{ fontSize: 16, color: G.muted }}>Projected outcomes at scale</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
          {[
            { metric: '3x more leads answered', sub: 'In first 24 hours' },
            { metric: '47% faster qualification', sub: 'Bot vs manual process' },
            { metric: '₹4.5L+ commissions/month', sub: 'At scale (200 clients)' },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '24px 20px', borderRadius: 12, background: G.greenLight, borderLeft: `4px solid ${G.green}` }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: G.green, marginBottom: 8 }}>{item.metric}</div>
              <div style={{ fontSize: 13, color: G.muted }}>{item.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 60, padding: '40px', borderRadius: 12, background: '#15161B', color: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>₹999</div>
              <div style={{ fontSize: 13, opacity: 0.6 }}>Your monthly cost</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 32 }}>→</div>
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, color: G.green, marginBottom: 8 }}>₹1.125L average</div>
              <div style={{ fontSize: 13, opacity: 0.6 }}>Commission from 1 closed deal</div>
            </div>
          </div>
          <div style={{ marginTop: 28, fontSize: 18, fontWeight: 600, textAlign: 'center', color: G.gold }}>
            That's 112x ROI on your first deal alone.
          </div>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const router = useRouter()
  return (
    <section style={{ paddingTop: 80, paddingBottom: 80, background: '#FAFAFB' }} id="pricing">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: G.dark, letterSpacing: '-0.02em', marginBottom: 16 }}>Simple Pricing. No Surprises.</h2>
          <p style={{ fontSize: 16, color: G.muted }}>5,000 messages/month included. Add more anytime.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {[
            {
              name: 'Monthly',
              price: '₹999',
              period: '/month',
              desc: 'Pay as you go',
              features: ['5,000 messages/month', 'Unlimited leads', 'AI bot (24/7)', 'Site visit booking', 'ROI dashboard', 'Priority support']
            },
            {
              name: 'Annual',
              price: '₹799',
              period: '/month (₹9,588/year)',
              desc: 'Best value',
              highlight: true,
              features: ['5,000 messages/month', 'Unlimited leads', 'AI bot (24/7)', 'Site visit booking', 'ROI dashboard', 'Priority support', '✨ Early access to new features']
            }
          ].map((plan, i) => (
            <div key={i} style={{ padding: 32, borderRadius: 16, border: plan.highlight ? `2px solid ${G.green}` : `1px solid ${G.border}`, background: plan.highlight ? G.greenLight : '#fff', position: 'relative' }}>
              {plan.highlight && <div style={{ position: 'absolute', top: -12, left: 20, padding: '4px 12px', borderRadius: 20, background: G.green, color: '#fff', fontSize: 11, fontWeight: 600 }}>MOST POPULAR</div>}
              <h3 style={{ fontSize: 18, fontWeight: 600, color: G.dark, marginBottom: 4 }}>{plan.name}</h3>
              <div style={{ fontSize: 13, color: G.muted, marginBottom: 16 }}>{plan.desc}</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: G.dark, marginBottom: 2 }}>{plan.price}</div>
              <div style={{ fontSize: 12, color: G.muted, marginBottom: 24 }}>{plan.period}</div>
              <button onClick={() => router.push('/onboarding')} style={{ width: '100%', padding: '12px 24px', borderRadius: 12, background: plan.highlight ? G.green : '#fff', color: plan.highlight ? '#fff' : G.dark, border: plan.highlight ? 'none' : `1px solid ${G.border}`, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 24 }}>
                Start Free Trial
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.features.map((f, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: G.text }}>
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: '20px 24px', borderRadius: 12, background: '#fff', border: `1px solid ${G.border}`, textAlign: 'center', fontSize: 13, color: G.muted }}>
          💰 Extra messages? Add ₹99 for +1K, ₹249 for +3K, ₹399 for +5K. Billed when used.
        </div>
      </div>
    </section>
  )
}

function CTA() {
  const router = useRouter()
  return (
    <section style={{ paddingTop: 80, paddingBottom: 80, background: 'linear-gradient(135deg, #15161B 0%, #2A2550 100%)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 460, height: 460, background: `radial-gradient(circle, rgba(124,58,237,0.28) 0%, transparent 70%)`, top: -120, right: -120 }} />
      <div style={{ position: 'absolute', width: 360, height: 360, background: `radial-gradient(circle, rgba(79,70,229,0.22) 0%, transparent 70%)`, bottom: -120, left: -80 }} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 32px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <h2 style={{ fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
          Your first deal pays for a year of Convorian
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 32, lineHeight: 1.6 }}>
          Stop losing leads to time delays. Start closing deals on autopilot — 24/7, even while you sleep.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/onboarding')} style={{ padding: '14px 32px', borderRadius: 12, background: G.grad, color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: G.glow }}>
            Start Free Trial (No Card)
          </button>
          {process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP && (
            <a href={`https://wa.me/${process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP.replace(/\D/g, '')}?text=Hi%20Convorian!%20I%20want%20to%20schedule%20a%20demo`} target="_blank" style={{ padding: '14px 32px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
              Chat on WhatsApp
            </a>
          )}
        </div>

        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          <div>✓ Free for 30 days</div>
          <div>✓ No credit card required</div>
          <div>✓ Cancel anytime</div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: '40px 32px', borderTop: `1px solid ${G.border}`, background: '#fff' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: G.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff' }}>🏠</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: G.dark }}>Convorian</span>
          </div>
          <p style={{ fontSize: 13, color: G.muted, lineHeight: 1.6, margin: 0 }}>
            AI-powered WhatsApp automation that helps real estate agents in India answer, qualify, and convert leads 24/7.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: G.dark, marginBottom: 10 }}>Legal</div>
            <a href="/privacy-policy" style={{ display: 'block', fontSize: 13, color: G.muted, textDecoration: 'none', marginBottom: 8 }}>Privacy Policy</a>
            <a href="/terms-of-service" style={{ display: 'block', fontSize: 13, color: G.muted, textDecoration: 'none' }}>Terms of Service</a>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: G.dark, marginBottom: 10 }}>Contact</div>
            <a href="/help" style={{ display: 'block', fontSize: 13, color: G.muted, textDecoration: 'none', marginBottom: 8 }}>Help & FAQ</a>
            <a href="mailto:support@convorian.in" style={{ display: 'block', fontSize: 13, color: G.muted, textDecoration: 'none', marginBottom: 8 }}>support@convorian.in</a>
            <span style={{ display: 'block', fontSize: 13, color: G.muted }}>Pune, Maharashtra, India</span>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1000, margin: '28px auto 0', paddingTop: 20, borderTop: `1px solid ${G.border}`, fontSize: 12, color: G.muted, textAlign: 'center' }}>
        © {new Date().getFullYear()} Convorian. All rights reserved. · convorian.in
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const router = useRouter()
  
  useEffect(() => {
    const checkSession = async () => {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
    }
    checkSession()
  }, [router])

  return (
    <div style={{ background: '#fff' }}>
      <Nav />
      <Hero />
      <LiveDemo />
      <Problem />
      <Solution />
      <Proof />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  )
}
