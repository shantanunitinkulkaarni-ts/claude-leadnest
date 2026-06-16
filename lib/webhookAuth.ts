import { timingSafeEqual } from 'crypto'

// ─── MSG91 shared-secret header verification ─────────────────────────────────
// MSG91 does not sign payloads with HMAC. Their security mechanism is a custom
// header you configure in the MSG91 dashboard (WhatsApp > Webhook settings):
//   Header name:  x-webhook-secret
//   Header value: <MSG91_WEBHOOK_SECRET env var>
// MSG91 echoes that header on every inbound POST. We compare it constant-time
// to prevent timing-oracle attacks.
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

// ─── Meta X-Hub-Signature-256 stub ───────────────────────────────────────────
// TODO: activate when Meta App Review completes and Meta Cloud API goes live.
//
// Meta signs every webhook POST body with HMAC-SHA256 using WHATSAPP_APP_SECRET:
//   Header: X-Hub-Signature-256: sha256=<hex>
//   Key:    WHATSAPP_APP_SECRET env var
//   Input:  raw request body bytes (must be read before JSON.parse)
//
// Activation checklist:
//   1. Read the raw body BEFORE any parsing (use request.arrayBuffer() or similar).
//   2. Call verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), secret).
//   3. Reject with 403 if false.
//   4. Remove this comment and the NotImplementedError.
//
// import { createHmac } from 'crypto'
// export function verifyMetaSignature(
//   rawBody: Buffer,
//   signatureHeader: string | null,
//   appSecret: string
// ): boolean {
//   if (!signatureHeader?.startsWith('sha256=') || !appSecret) return false
//   const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
//   return verifySharedSecret(signatureHeader, expected)
// }
