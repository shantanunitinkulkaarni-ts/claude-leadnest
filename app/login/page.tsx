'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import '../onboarding/onboarding.css'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('email')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Opt-in 2FA: only shown to agents who enrolled a TOTP factor in Settings.
  const [mfaPrompt, setMfaPrompt] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  // After a password/OTP sign-in, route to the right place — but if the agent
  // has 2FA on, ask for their 6-digit code first. Non-enrolled agents skip this
  // entirely (nextLevel stays 'aal1'), so no one can be locked out.
  const finishLogin = async (supabase: any, userId: string) => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      setMfaPrompt(true)
      setIsLoading(false)
      return
    }
    await routeIn(supabase, userId)
  }

  const routeIn = async (supabase: any, userId: string) => {
    const { data: sa } = await supabase
      .from('superadmins').select('auth_user_id').eq('auth_user_id', userId).maybeSingle()
    router.push(sa ? '/admin' : '/dashboard')
  }

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const supabase = getSupabase()
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const factor = (factors?.totp || [])[0]
      if (!factor) throw new Error('No authenticator found.')
      const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (ch.error) throw ch.error
      const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: mfaCode.trim() })
      if (v.error) throw new Error('That code didn\'t match — check your authenticator app and try again.')
      const { data: u } = await supabase.auth.getUser()
      await routeIn(supabase, u.user!.id)
    } catch (err: any) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setIsLoading(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined
        }
      })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
      setIsLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const supabase = getSupabase()
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      if (data.session) {
        // Superadmins (who may have no agency) go straight to /admin; agents with
        // 2FA on are challenged first (finishLogin handles both).
        await finishLogin(supabase, data.session.user.id)
      } else {
        setError('Please verify your email before logging in.')
        setIsLoading(false)
      }
    } catch (err: any) {
      setError(err.message)
      setIsLoading(false)
    }
  }


  return (
    <div className="onboarding-app" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="main-content" style={{ maxWidth: 500, width: '100%', margin: '0 auto', paddingTop: '10vh' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="logo-mark" style={{ display: 'inline-flex', background: 'var(--ink)', padding: '8px 16px', borderRadius: 30 }}>
            <div className="logo-dot">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="logo-name" style={{ marginLeft: 8 }}>TING</span>
          </div>
          <h1 className="onboard-headline" style={{ color: 'var(--ink)', marginTop: 24, fontSize: 32 }}>Welcome back</h1>
          <p className="onboard-sub" style={{ color: 'var(--ink-3)' }}>Sign in to manage your automated lead engine</p>
        </div>

        <div className="form-card" style={{ padding: '40px 32px' }}>
          {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 24 }}>{error}</div>}
          {msg && <div style={{ background: '#EEF0FE', color: '#4338CA', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 24 }}>{msg}</div>}

          {mfaPrompt && (
            <form onSubmit={handleMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>🔒 Two-step verification</div>
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>Enter the 6-digit code from your authenticator app.</p>
              </div>
              <input required inputMode="numeric" value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus
                style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} placeholder="123456" />
              <button type="submit" className="btn-next" style={{ width: '100%' }} disabled={isLoading || mfaCode.length !== 6}>
                {isLoading ? 'Verifying...' : 'Verify & continue'}
              </button>
            </form>
          )}

          {!mfaPrompt && (<>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid rgba(26,25,22,0.1)' }}>
            <button onClick={() => { setAuthMethod('google'); setError(''); setMsg(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: authMethod === 'google' ? '2px solid var(--ink)' : '2px solid transparent', color: authMethod === 'google' ? 'var(--ink)' : 'var(--ink-4)', fontWeight: authMethod === 'google' ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>Google</button>
            <button onClick={() => { setAuthMethod('email'); setError(''); setMsg(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: authMethod === 'email' ? '2px solid var(--ink)' : '2px solid transparent', color: authMethod === 'email' ? 'var(--ink)' : 'var(--ink-4)', fontWeight: authMethod === 'email' ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>Email</button>
          </div>

          {authMethod === 'google' && (
            <button 
              className="btn-next" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#fff', color: '#15161B', border: '1px solid rgba(26,25,22,0.2)', height: 48, cursor: 'pointer' }} 
              disabled={isLoading} 
              onClick={handleGoogleLogin}
            >
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              {isLoading ? 'Connecting...' : 'Sign in with Google'}
            </button>
          )}

          {authMethod === 'email' && (
            <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="you@agency.com" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="••••••••" />
              </div>
              <div style={{ textAlign: 'right', marginTop: -6 }}>
                <span onClick={() => router.push('/forgot-password')} style={{ fontSize: 12, color: 'var(--green)', cursor: 'pointer', fontWeight: 500 }}>Forgot password?</span>
              </div>
              <button type="submit" className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign in with Email'}
              </button>
            </form>
          )}

          </>)}

          <div style={{ textAlign: 'center', marginTop: 30, fontSize: 13, color: 'var(--ink-4)' }}>
            Don't have an account? <span style={{ color: 'var(--green)', cursor: 'pointer', fontWeight: 500 }} onClick={() => router.push('/onboarding')}>Set up your TING</span>
          </div>
        </div>
      </div>
    </div>
  )
}
