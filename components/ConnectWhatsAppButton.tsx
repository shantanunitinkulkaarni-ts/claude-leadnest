'use client'

// Embedded Signup "Connect WhatsApp" button (Meta Facebook-Login-for-Business v4).
// Flow: click → Facebook popup (driven by our Configuration ID) → the agent picks
// or creates their WhatsApp Business Account + number → Meta hands us back a `code`
// (via the FB.login callback) plus their waba_id + phone_number_id (via a browser
// postMessage). We send all three to /api/meta/onboard, which activates the number
// and the bot goes live on it.

import { useEffect, useRef, useState } from 'react'

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || ''
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || ''
const GRAPH_VERSION = 'v21.0'

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

let sdkLoading = false
function loadFbSdk() {
  if (typeof window === 'undefined' || window.FB || sdkLoading) return
  sdkLoading = true
  window.fbAsyncInit = function () {
    window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION })
  }
  const s = document.createElement('script')
  s.src = 'https://connect.facebook.net/en_US/sdk.js'
  s.async = true
  s.defer = true
  s.crossOrigin = 'anonymous'
  document.body.appendChild(s)
}

type Props = { agentId: string; onConnected?: () => void }

export default function ConnectWhatsAppButton({ agentId, onConnected }: Props) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  // waba_id + phone_number_id arrive via postMessage, separately from the code.
  const sessionInfo = useRef<{ phone_number_id?: string; waba_id?: string }>({})

  useEffect(() => {
    loadFbSdk()
    const onMessage = (event: MessageEvent) => {
      if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return
      try {
        const data = JSON.parse(event.data)
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data.data) {
          sessionInfo.current = data.data // { phone_number_id, waba_id }
        }
      } catch { /* not an embedded-signup message */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const finish = async (code: string) => {
    const { phone_number_id, waba_id } = sessionInfo.current
    if (!phone_number_id || !waba_id) {
      setStatus('error'); setMessage('Could not read your WhatsApp number — please try again.')
      return
    }
    try {
      const res = await fetch('/api/meta/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, code, wabaId: waba_id, phoneNumberId: phone_number_id }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok) {
        setStatus('done'); setMessage('Connected! Your AI assistant is now live on WhatsApp. 🎉')
        onConnected?.()
      } else if (j.needsAction === 'disable_two_step') {
        setStatus('error')
        setMessage(j.error || 'This number has two-step verification on. Turn it off in WhatsApp, then reconnect.')
      } else {
        setStatus('error'); setMessage(j.error || 'Connection failed — please try again.')
      }
    } catch {
      setStatus('error'); setMessage('Network error — please try again.')
    }
  }

  const launch = () => {
    if (!CONFIG_ID || !APP_ID) {
      setStatus('error'); setMessage('WhatsApp connector is not configured yet.')
      return
    }
    if (!window.FB) {
      setStatus('error'); setMessage('Still loading the connector — please try again in a moment.')
      return
    }
    setStatus('connecting'); setMessage('')
    sessionInfo.current = {}
    window.FB.login(
      (response: any) => {
        const code = response?.authResponse?.code
        if (!code) { setStatus('error'); setMessage('Connection cancelled.'); return }
        finish(code)
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      }
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={launch}
        disabled={status === 'connecting' || status === 'done'}
        className="btn-next"
        style={{ width: '100%', background: '#25D366', borderColor: '#25D366' }}
      >
        {status === 'connecting' ? 'Connecting…' : status === 'done' ? 'Connected ✓' : '🟢 Connect WhatsApp'}
      </button>
      {message && (
        <div style={{ marginTop: 10, fontSize: 13, color: status === 'error' ? '#c0392b' : 'var(--green, #1a7f37)' }}>
          {message}
        </div>
      )}
    </div>
  )
}
