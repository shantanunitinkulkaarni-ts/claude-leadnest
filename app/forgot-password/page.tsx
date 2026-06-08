'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import '../onboarding/onboarding.css'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setStatus('sending')
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
      })
      if (error) throw error
      setStatus('sent')
    } catch (err: any) {
      setError(err.message || 'Could not send reset email')
      setStatus('idle')
    }
  }

  return (
    <div className="onboarding-app" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="main-content" style={{ maxWidth: 460, width: '100%', margin: '0 auto', paddingTop: '12vh' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 className="onboard-headline" style={{ color: 'var(--ink)', fontSize: 28 }}>Reset your password</h1>
          <p className="onboard-sub" style={{ color: 'var(--ink-3)' }}>We&apos;ll email you a link to set a new password.</p>
        </div>

        <div className="form-card" style={{ padding: '36px 32px' }}>
          {status === 'sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: '#EEF0FE', color: '#4338CA', padding: '14px 16px', borderRadius: 8, fontSize: 14, marginBottom: 20 }}>
                ✓ Check your inbox — if an account exists for <strong>{email}</strong>, a reset link is on its way.
              </div>
              <button className="btn-next" style={{ width: '100%' }} onClick={() => router.push('/login')}>Back to login</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px 16px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending...' : 'Send reset link'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-4)' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => router.push('/login')}>Back to login</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
