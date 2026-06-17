import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Convorian — AI WhatsApp Sales Engine for Real Estate'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)',
          padding: '72px 80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -60, right: 180, width: 260, height: 260, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex' }} />

        {/* Logo area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'white', fontSize: 28, fontWeight: 700, display: 'flex' }}>C</div>
          </div>
          <div style={{ color: 'white', fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', display: 'flex' }}>Convorian</div>
        </div>

        {/* Headline */}
        <div style={{ color: 'white', fontSize: 58, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-1px', maxWidth: 760, marginBottom: 28, display: 'flex', flexDirection: 'column' }}>
          <span>AI WhatsApp Assistant</span>
          <span style={{ color: '#a78bfa' }}>for Real Estate Agents</span>
        </div>

        {/* Sub-headline */}
        <div style={{ color: 'rgba(196,181,253,0.85)', fontSize: 24, lineHeight: 1.5, maxWidth: 680, marginBottom: 48, display: 'flex' }}>
          Answer, qualify &amp; book site visits 24/7 — while you sleep.
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['₹999/month', 'WhatsApp-native', 'Real estate AI', 'India-ready'].map((label) => (
            <div key={label} style={{
              padding: '10px 20px', borderRadius: 100, fontSize: 18, fontWeight: 600,
              background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.5)',
              color: '#c4b5fd', display: 'flex',
            }}>{label}</div>
          ))}
        </div>

        {/* Domain */}
        <div style={{ position: 'absolute', bottom: 48, right: 80, color: 'rgba(196,181,253,0.6)', fontSize: 20, display: 'flex' }}>
          convorian.in
        </div>
      </div>
    ),
    { ...size }
  )
}
