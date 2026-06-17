import crypto from 'crypto'

// ─────────────────────────────────────────
// Razorpay Subscriptions helper (UPI Autopay / card mandates)
// Centralises auth + the few API calls we need so routes stay thin.
// All calls use the REST API directly (no SDK dependency).
// ─────────────────────────────────────────

const API = 'https://api.razorpay.com/v1'

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
}

async function rzpFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init?.headers || {})
    }
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.description || `Razorpay API error (${res.status})`
    throw new Error(msg)
  }
  return json
}

// Create (or reuse) a Razorpay customer for this agent.
export async function createCustomer(params: { name?: string; email: string; contact?: string }): Promise<string> {
  try {
    const c = await rzpFetch('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: params.name || params.email,
        email: params.email,
        contact: params.contact || undefined,
        fail_existing: 0 // return existing customer instead of erroring
      })
    })
    return c.id
  } catch (e: any) {
    // If the customer already exists Razorpay still returns it with fail_existing:0,
    // so a throw here is a genuine error.
    throw e
  }
}

// Create a subscription against the ₹999/month plan. The agent authorises the
// UPI Autopay mandate via Checkout using the returned subscription id.
export async function createSubscription(params: {
  planId: string
  customerId?: string
  totalCount?: number
  notes?: Record<string, string>
}): Promise<any> {
  return rzpFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: params.planId,
      customer_notify: 1,
      // total_count is required; 120 monthly cycles ≈ 10 years (effectively "until cancelled").
      total_count: params.totalCount || 120,
      customer_id: params.customerId || undefined,
      notes: params.notes || undefined
    })
  })
}

export async function fetchSubscription(subscriptionId: string): Promise<any> {
  return rzpFetch(`/subscriptions/${subscriptionId}`)
}

// Cancel a subscription. By default at cycle end so the agent keeps access
// for the period they already paid for.
export async function cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<any> {
  return rzpFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 })
  })
}

// Verify the Checkout callback signature for a subscription authorisation.
// For subscriptions the signature is HMAC_SHA256(payment_id + '|' + subscription_id).
export function verifyCheckoutSignature(params: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${params.razorpay_payment_id}|${params.razorpay_subscription_id}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(params.razorpay_signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Verify a Razorpay webhook payload signature (raw body + webhook secret).
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
