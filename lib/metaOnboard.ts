// Meta Embedded Signup — server-side onboarding of a client's WhatsApp number.
//
// When an agent completes the in-app Embedded Signup popup, the browser hands us:
//   - code:           an exchangeable OAuth code → a business token scoped to THEIR account
//   - wabaId:         the WhatsApp Business Account they connected
//   - phoneNumberId:  the business phone number on that WABA
//
// We exchange the code for their token, subscribe our app to their WABA, set India
// in-country data storage (DPDP-friendly + required for numbers migrated off another
// BSP), and register the number for Cloud API. The caller stores the creds on the
// agent row. Proven by hand on 2026-06-23 — this codifies that exact flow.

const APP_ID = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || ''
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ''
const GRAPH = 'https://graph.facebook.com/v21.0'

async function graph(
  path: string,
  opts: { method?: string; token?: string; body?: any } = {}
): Promise<{ status: number; json: any }> {
  const { method = 'GET', token, body } = opts
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// Exchange the Embedded Signup code for a business token scoped to the client.
export async function exchangeCodeForToken(code: string): Promise<{ token?: string; error?: string }> {
  if (!APP_ID || !APP_SECRET) return { error: 'META_APP_ID / WHATSAPP_APP_SECRET not configured' }
  const q = `oauth/access_token?client_id=${encodeURIComponent(APP_ID)}&client_secret=${encodeURIComponent(APP_SECRET)}&code=${encodeURIComponent(code)}`
  const { json } = await graph(q)
  if (json?.access_token) return { token: json.access_token }
  return { error: json?.error?.message || 'token exchange failed' }
}

export type OnboardResult = { ok: boolean; pin?: string; error?: string; needsAction?: 'disable_two_step' }

// Subscribe our app to the client's WABA, set India storage, and register the
// number for Cloud API. Adaptive: works for fresh numbers and numbers migrated
// from another BSP (which need India data-localization set, and two-step off).
export async function activateNumber(opts: {
  token: string
  phoneNumberId: string
  wabaId: string
}): Promise<OnboardResult> {
  const { token, phoneNumberId, wabaId } = opts
  const pin = String(Math.floor(100000 + Math.random() * 900000)) // random 6-digit two-step PIN

  // 1. Subscribe our app to the client's WABA — without this, inbound is silently dropped.
  const sub = await graph(`${wabaId}/subscribed_apps`, { method: 'POST', token })
  if (sub.status !== 200 || sub.json?.error) {
    return { ok: false, error: `could not subscribe to WhatsApp account: ${sub.json?.error?.message || sub.status}` }
  }

  // 2. India in-country storage (data residency for DPDP; also required for migrated
  //    numbers before they can register). Best-effort — ignore if already set.
  await graph(`${phoneNumberId}/settings`, {
    method: 'POST',
    token,
    body: { storage_configuration: { status: 'IN_COUNTRY_STORAGE_ENABLED', data_localization_region: 'IN' } },
  })

  // 3. Register the number for Cloud API.
  const reg = await graph(`${phoneNumberId}/register`, {
    method: 'POST',
    token,
    body: { messaging_product: 'whatsapp', pin },
  })
  if (reg.json?.success) return { ok: true, pin }

  // A leftover two-step PIN (common on numbers migrated off another BSP) blocks
  // registration — the agent has to turn it off, then retry.
  const msg = reg.json?.error?.error_user_msg || reg.json?.error?.message || ''
  if (/two-factor|two-step|certificate/i.test(msg)) {
    return {
      ok: false,
      needsAction: 'disable_two_step',
      error: 'This number still has two-step verification (a PIN) enabled. Please turn it off, then reconnect.',
    }
  }

  return { ok: false, error: reg.json?.error?.message || 'number registration failed' }
}
