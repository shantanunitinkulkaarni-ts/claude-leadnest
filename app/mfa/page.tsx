'use client'

// Two-step verification challenge for an already-signed-in session that is still
// at aal1 but has an enrolled TOTP factor. Middleware redirects here for any
// protected page when a challenge is required (notably after Google OAuth, which
// doesn't pass through the login form's inline challenge). On success the session
// becomes aal2 and we send the user to their original destination.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import '../onboarding/onboarding.css'

export default function MfaPage() {
  const router = useRouter()
  const [next, setNext] = useState('/dashboard')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Read the return path from the URL (sanitised against open-redirects).
    const raw = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    const safeNext = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
    setNext(safeNext)

    const supabase = getSupabase()
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        // Not enrolled, or already at aal2 → no challenge needed, move along.
        if (!data || data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') {
          router.replace(safeNext)
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const supabase = getSupabase()
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const factor = (factors?.totp || [])[0]
      if (!factor) throw new Error('No authenticator found on this account.')
      const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (ch.error || !ch.data) throw new Error(ch.error?.message || 'Could not start verification.')
      const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: code.trim() })
      if (v.error) throw new Error("That code didn't match — check your authenticator app and try again.")
      router.replace(next)
    } catch (err: any) {
      setError(err.message); setLoading(false)
    }
  }

  const signOut = async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="onboarding-app" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="main-content" style={{ maxWidth: 440, width: '100%', margin: '0 auto', paddingTop: '14vh' }}>
        <div className="form-card" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>🔒 Two-step verification</div>
          {checking ? (
            <p style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 14 }}>Checking…</p>
          ) : (
            <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
              <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Enter the 6-digit code from your authenticator app to continue.</p>
              {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <input
                required inputMode="numeric" autoFocus value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
              />
              <button type="submit" className="btn-next" style={{ width: '100%' }} disabled={loading || code.length !== 6}>
                {loading ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button type="button" onClick={signOut} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                Sign in with a different account
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
