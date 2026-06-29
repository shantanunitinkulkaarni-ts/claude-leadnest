import { timingSafeEqual, createHmac } from 'crypto'

// ─── Shared-secret header verification ───────────────────────────────────────
// Used by the dashboard "simulate lead" form post, which sends a custom header:
//   Header name:  x-webhook-secret
//   Header value: <WEBHOOK_SIMULATE_SECRET env var>
// Compared constant-time to prevent timing-oracle attacks.
export function verifySharedSecret(
  incoming: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!incoming || !expected) return false
  try {
    const a = Buffer.from(incoming, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    // timingSafeEqual requires equal-length buffers — unequal length is an
    // immediate mismatch (don't short-circuit with early return; keep timing uniform).
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ─── Meta X-Hub-Signature-256 verification ───────────────────────────────────
// Meta signs every webhook POST body with HMAC-SHA256 using the app secret:
//   Header: X-Hub-Signature-256: sha256=<hex>
//   Key:    WHATSAPP_APP_SECRET env var (Meta app → Settings → Basic → App Secret)
//   Input:  the raw request body (read with request.text() BEFORE JSON.parse)
// Returns false if the secret/header is missing — so Meta inbound is rejected
// until WHATSAPP_APP_SECRET is configured.
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !appSecret) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return verifySharedSecret(signatureHeader, expected)
}
