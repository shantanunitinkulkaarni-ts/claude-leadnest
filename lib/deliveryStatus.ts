// ─── Delivery-report parsing (provider-agnostic, pure + testable) ────────────
// MSG91/Meta delivery-status callbacks vary in shape by account/version: a single
// object, a `data: [...]` array, or nested reports, with the id/status/error
// under many possible field names. These pure helpers normalise that mess so the
// route handler (app/api/webhook/status) only does the DB write. Kept pure (no
// I/O) so every shape can be unit-tested without a live callback.

export type StatusEvent = { id: string; status: string | null; error: string }

// Map the many status spellings providers use → our small canonical set.
export function normalizeStatus(raw: any): string | null {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return null
  if (/(^|_)deliver/.test(s) || s === 'dlvrd') return 'delivered'
  if (/read|seen/.test(s)) return 'read'
  if (/fail|undeliver|reject|error|bounce/.test(s)) return 'failed'
  if (/sent|submit|accept|queue/.test(s)) return 'sent'
  return s // keep unknown statuses verbatim so we can learn the shape
}

// Pull the first non-empty value across the many field names providers use.
export function pick(obj: any, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return ''
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

const ID_KEYS = ['message_uuid', 'messageUuid', 'requestId', 'request_id', 'messageId', 'message_id', 'msgId', 'msg_id', 'id', 'uuid']
const STATUS_KEYS = ['status', 'eventType', 'event', 'deliveryStatus', 'state']
const ERROR_KEYS = ['error', 'errorMessage', 'error_message', 'reason', 'failureReason', 'errorCode', 'error_code']

// Flatten a callback payload into individual {id,status,error} events. Accepts a
// bare array, a `data`/`reports` array, or a single object.
export function extractEvents(body: any): StatusEvent[] {
  const events: StatusEvent[] = []
  const candidates: any[] = []
  if (Array.isArray(body)) candidates.push(...body)
  else if (Array.isArray(body?.data)) candidates.push(...body.data)
  else if (Array.isArray(body?.reports)) candidates.push(...body.reports)
  else if (body && typeof body === 'object') candidates.push(body)

  for (const c of candidates) {
    const id = pick(c, ID_KEYS)
    const status = normalizeStatus(pick(c, STATUS_KEYS))
    const error = pick(c, ERROR_KEYS)
    if (id || status) events.push({ id, status, error })
  }
  return events
}
