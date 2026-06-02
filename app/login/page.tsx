'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import '../onboarding/onboarding.css'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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

  return (
    <div className="onboarding-app" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="main-content" style={{ maxWidth: 500, width: '100%', margin: '0 auto', paddingTop: '10vh' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="logo-mark" style={{ display: 'inline-flex', background: 'var(--ink)', padding: '8px 16px', borderRadius: 30 }}>
            <div className="logo-dot">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="logo-name" style={{ marginLeft: 8 }}>LeadNest</span>
          </div>
          <h1 className="onboard-headline" style={{ color: 'var(--ink)', marginTop: 24, fontSize: 32 }}>Welcome back</h1>
          <p className="onboard-sub" style={{ color: 'var(--ink-3)' }}>Sign in to manage your automated lead engine</p>
        </div>

        <div className="form-card" style={{ padding: '40px 32px' }}>
          {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 24 }}>{error}</div>}

          <button 
            className="btn-next" 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#fff', color: '#1A1916', border: '1px solid rgba(26,25,22,0.2)', height: 48, cursor: 'pointer' }} 
            disabled={isLoading} 
            onClick={handleGoogleLogin}
          >
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {isLoading ? 'Connecting...' : 'Sign in with Google'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--ink-4)' }}>
            Don't have an account? <span style={{ color: 'var(--green)', cursor: 'pointer', fontWeight: 500 }} onClick={() => router.push('/onboarding')}>Set up your LeadNest</span>
          </div>
        </div>

      </div>
    </div>
  )
}
