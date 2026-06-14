export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ─── MSG91 / Meta delivery-status callback ───────────────────────────────────
// Configure this URL as the WhatsApp "delivery report" / status webhook in the
// MSG91 dashboard: https://convorian.in/api/webhook/status
//
// Why this exists: a 200 + requestId from the SEND api only means "accepted into
// the queue", NOT delivered. Meta can still reject (bad params, paused template,
// quality/limit, closed 24h window). Without this handler those failures are
// invisible — the Inbox shows the message as sent and nobody knows it bounced.
//
// MSG91's status payload shape varies by account/version, so we parse defensively:
// log the FULL body (so the first real callback reveals the exact shape), then
// best-effort match the message row by its provider id and stamp the status.

// Map the many status spellings providers use → our small canonical set.
function normalizeStatus(raw: any): string | null {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return null
  if (/(^|_)deliver/.test(s) || s === 'dlvrd') return 'delivered'
  if (/read|seen/.test(s)) return 'read'
  if (/fail|undeliver|reject|error|bounce/.test(s)) return 'failed'
  if (/sent|submit|accept|queue/.test(s)) return 'sent'
  return s // keep unknown statuses verbatim so we can learn the shape
}

// Pull the first non-empty value across the many field names providers use.
function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

type StatusEvent = { id: string; status: string | null; error: string }

// Flatten the payload into individual {id,status,error} events. MSG91 may send a
// single object, a `data: [...]` array, or nested report structures.
function extractEvents(body: any): StatusEvent[] {
  const events: StatusEvent[] = []
  const candidates: any[] = []
  if (Array.isArray(body)) candidates.push(...body)
  else if (Array.isArray(body?.data)) candidates.push(...body.data)
  else if (Array.isArray(body?.reports)) candidates.push(...body.reports)
  else if (body && typeof body === 'object') candidates.push(body)

  for (const c of candidates) {
    const id = pick(c, ['requestId', 'request_id', 'messageId', 'message_id', 'msgId', 'msg_id', 'id', 'uuid'])
    const status = normalizeStatus(pick(c, ['status', 'eventType', 'event', 'deliveryStatus', 'state']))
    const error = pick(c, ['error', 'errorMessage', 'error_message', 'reason', 'failureReason', 'errorCode', 'error_code'])
    if (id || status) events.push({ id, status, error })
  }
  return events
}

async function handle(body: any) {
  // Full payload so the FIRST real callback reveals the exact provider shape.
  console.log('[delivery-status] payload:', JSON.stringify(body).slice(0, 1500))

  const events = extractEvents(body)
  if (!events.length) {
    console.warn('[delivery-status] no recognizable events in payload')
    return { ok: true, matched: 0 }
  }

  let matched = 0
  for (const ev of events) {
    if (ev.status === 'failed') {
      console.error(`[delivery-status] FAILED id=${ev.id || '?'} reason="${ev.error || 'unknown'}"`)
    }
    if (!ev.id) continue // can't match a row without a provider id

    const update: any = { delivery_updated_at: new Date().toISOString() }
    if (ev.status) update.delivery_status = ev.status
    if (ev.error) update.delivery_error = ev.error

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update(update)
      .eq('wa_message_id', ev.id)
      .select('id')
    if (error) { console.error('[delivery-status] update error:', error.message); continue }
    if (data && data.length) matched += data.length
  }
  return { ok: true, matched }
}

export async function POST(request: NextRequest) {
  try {
    let body: any
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      body = await request.json()
    } else {
      // Some providers post form-encoded reports.
      const text = await request.text()
      try { body = JSON.parse(text) } catch { body = Object.fromEntries(new URLSearchParams(text)) }
    }
    const result = await handle(body)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[delivery-status] handler error:', err?.message)
    // Always 200 so the provider doesn't retry-storm us over our own bug.
    return NextResponse.json({ ok: false, error: err?.message })
  }
}

// MSG91 may verify the callback URL with a GET first.
export async function GET() {
  return new NextResponse('OK', { status: 200 })
}
