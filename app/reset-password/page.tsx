'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import '../onboarding/onboarding.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')

  // Supabase parses the recovery token from the URL and creates a temporary
  // session. We listen for that, then allow the user to set a new password.
  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setStatus('saving')
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setStatus('done')
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err: any) {
      setError(err.message || 'Could not update password')
      setStatus('idle')
    }
  }

  return (
    <div className="onboarding-app" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="main-content" style={{ maxWidth: 460, width: '100%', margin: '0 auto', paddingTop: '12vh' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 className="onboard-headline" style={{ color: 'var(--ink)', fontSize: 28 }}>Set a new password</h1>
          <p className="onboard-sub" style={{ color: 'var(--ink-3)' }}>Choose a strong password for your account.</p>
        </div>

        <div className="form-card" style={{ padding: '36px 32px' }}>
          {status === 'done' ? (
            <div style={{ background: '#EEF0FE', color: '#4338CA', padding: '14px 16px', borderRadius: 8, fontSize: 14, textAlign: 'center' }}>
              ✓ Password updated! Taking you to your dashboard...
            </div>
          ) : !ready ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
              Verifying your reset link...
              <div style={{ fontSize: 12, marginTop: 12, color: 'var(--ink-4)' }}>
                If this stays here, the link may have expired — <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => router.push('/forgot-password')}>request a new one</span>.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px 16px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>New Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Confirm Password</label>
                <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={status === 'saving'}>
                {status === 'saving' ? 'Saving...' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
