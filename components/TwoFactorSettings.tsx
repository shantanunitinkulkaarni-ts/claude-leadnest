'use client'

// Opt-in two-factor authentication (TOTP) for agent accounts, via Supabase MFA.
// Fully additive: an agent who does NOT enrol logs in exactly as before — only
// enrolled agents are challenged for a 6-digit code at login (handled in /login).
// Protects the confidential lead data in each agent's account.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type Factor = { id: string; friendly_name?: string | null; status: string }

export default function TwoFactorSettings() {
  const supabase = getSupabase()
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState<Factor[]>([])
  const [enrolling, setEnrolling] = useState(false)
  const [qr, setQr] = useState('')        // Supabase-provided SVG
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp || []).map((f: any) => ({ id: f.id, friendly_name: f.friendly_name, status: f.status })))
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const startEnroll = async () => {
    setMsg(''); setBusy(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` })
    setBusy(false)
    if (error || !data) { setMsg(error?.message || 'Could not start setup.'); return }
    setFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setEnrolling(true)
  }

  const confirmEnroll = async () => {
    setMsg(''); setBusy(true)
    const ch = await supabase.auth.mfa.challenge({ factorId })
    if (ch.error || !ch.data) { setBusy(false); setMsg(ch.error?.message || 'Verification failed.'); return }
    const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() })
    setBusy(false)
    if (v.error) { setMsg('That code didn\'t match — check the time on your phone and try again.'); return }
    setEnrolling(false); setQr(''); setSecret(''); setCode(''); setMsg('Two-factor authentication is now on. 🔒')
    refresh()
  }

  const disable = async (id: string) => {
    setBusy(true)
    await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy(false); setMsg('Two-factor authentication turned off.')
    refresh()
  }

  const enabled = factors.some(f => f.status === 'verified')

  return (
    <div style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, padding: 18, marginTop: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🔒 Two-Factor Authentication</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3, #6b6860)', marginBottom: 12 }}>
        Add a second step at login using an authenticator app (Google Authenticator, Authy). Protects your leads if your password is ever exposed.
      </div>

      {loading ? <div style={{ fontSize: 13, color: '#888' }}>Loading…</div> : !enrolling ? (
        <>
          {enabled ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#1a7f37', fontWeight: 600 }}>✓ Enabled</span>
              {factors.filter(f => f.status === 'verified').map(f => (
                <button key={f.id} onClick={() => disable(f.id)} disabled={busy}
                  style={{ fontSize: 12, color: '#c0392b', background: 'none', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                  Turn off
                </button>
              ))}
            </div>
          ) : (
            <button onClick={startEnroll} disabled={busy} className="btn-next"
              style={{ background: '#4F46E5', borderColor: '#4F46E5' }}>
              {busy ? 'Starting…' : 'Enable 2FA'}
            </button>
          )}
        </>
      ) : (
        <div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>1. Scan this QR in your authenticator app:</div>
          <div style={{ width: 180, height: 180, background: '#fff', padding: 6, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <div style={{ fontSize: 12, color: '#888', margin: '8px 0' }}>or enter this key manually: <code style={{ userSelect: 'all' }}>{secret}</code></div>
          <div style={{ fontSize: 13, margin: '10px 0 6px' }}>2. Enter the 6-digit code it shows:</div>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456" inputMode="numeric"
            style={{ fontSize: 18, letterSpacing: 4, padding: '8px 12px', width: 140, borderRadius: 8, border: '1px solid #ccc' }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button onClick={confirmEnroll} disabled={busy || code.length !== 6} className="btn-next" style={{ background: '#4F46E5', borderColor: '#4F46E5' }}>
              {busy ? 'Verifying…' : 'Verify & turn on'}
            </button>
            <button onClick={() => { setEnrolling(false); setMsg('') }} className="btn-back">Cancel</button>
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.includes('didn') || msg.includes('Could') ? '#c0392b' : '#1a7f37' }}>{msg}</div>}
    </div>
  )
}
