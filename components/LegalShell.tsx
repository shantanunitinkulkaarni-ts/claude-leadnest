import Link from 'next/link'
import SmartBackLink from './SmartBackLink'

// Shared chrome (header + footer) for legal pages — keeps Convorian branding
// consistent and gives Meta reviewers clear navigation + contact info.
export default function LegalShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FAFAFB', minHeight: '100vh', fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #E8E5DF', background: '#fff' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.webp" alt="Convorian" width={28} height={28} style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#15161B', letterSpacing: '-0.01em' }}>Convorian</span>
          </Link>
          <SmartBackLink style={{ fontSize: 13, color: '#4F46E5', fontWeight: 600, textDecoration: 'none' }} />
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 64px' }}>
        <div style={{ background: '#fff', border: '1px solid #E8E5DF', borderRadius: 16, padding: '40px 44px', boxShadow: '0 4px 24px rgba(20,22,27,0.04)' }}>
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E8E5DF', background: '#fff' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px', textAlign: 'center', fontSize: 13, color: '#6B6860' }}>
          <div style={{ marginBottom: 6 }}>
            <Link href="/help" style={{ color: '#4F46E5', textDecoration: 'none', margin: '0 10px' }}>Help & FAQ</Link>
            <Link href="/privacy-policy" style={{ color: '#4F46E5', textDecoration: 'none', margin: '0 10px' }}>Privacy Policy</Link>
            <Link href="/terms-of-service" style={{ color: '#4F46E5', textDecoration: 'none', margin: '0 10px' }}>Terms of Service</Link>
          </div>
          © {new Date().getFullYear()} Convorian · Pune, Maharashtra, India · <a href="mailto:support@convorian.in" style={{ color: '#4F46E5', textDecoration: 'none' }}>support@convorian.in</a>
        </div>
      </footer>
    </div>
  )
}
