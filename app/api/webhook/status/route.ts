export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractEvents } from '@/lib/deliveryStatus'

// ─── MSG91 / Meta delivery-status callback ───────────────────────────────────
// Configure this URL as the WhatsApp "delivery report" / status webhook in the
// MSG91 dashboard: https://convorian.in/api/webhook/status
//
// Why this exists: a 200 + requestId from the SEND api only means "accepted into
// the queue", NOT delivered. Meta can still reject (bad params, paused template,
// quality/limit, closed 24h window). Without this handler those failures are
// invisible — the Inbox shows the message as sent and nobody knows it bounced.
//
// MSG91's status payload shape varies by account/version, so parsing is delegated
// to lib/deliveryStatus (pure + unit-tested). Here we log the FULL body (so the
// first real callback reveals the exact shape) and stamp the matching row.

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

// Shared-secret gate. MSG91's delivery webhook can't send a custom header, so we
// authenticate via a secret URL query param (?token=...). Rollout is safe: while
// MSG91_STATUS_SECRET is UNSET the endpoint stays open (unchanged behaviour);
// once it's set in Vercel AND the MSG91 delivery-report URL is updated to include
// ?token=<secret>, all unauthenticated callers (fake delivered/failed reports)
// get 401'd. Without this, anyone could POST bogus delivery statuses for any msg.
function statusAuthed(request: NextRequest): boolean {
  const secret = process.env.MSG91_STATUS_SECRET
  if (!secret) return true // not configured yet — see note above
  const token = request.nextUrl.searchParams.get('token')
  return token === secret
}

export async function POST(request: NextRequest) {
  try {
    if (!statusAuthed(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
