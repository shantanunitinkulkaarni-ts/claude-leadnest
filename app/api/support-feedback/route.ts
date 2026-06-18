import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// Public endpoint — cap per IP so it can't be used to flood/scribble over
// support_chat_logs rows. Generous limit (a real chat fires a few of these).
const FEEDBACK_IP_LIMIT = 20
const FEEDBACK_WINDOW_MS = 60_000

// Records a 👍/👎 on a support-chat reply. Public (the chat is public); only
// flips the `helpful` flag on a known log row — no data exposure. These quality
// labels are what make future few-shot selection good (vs. picking blind).
export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(`feedback:${ip}`, FEEDBACK_IP_LIMIT, FEEDBACK_WINDOW_MS).allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }
    const { log_id, helpful, note } = await req.json()
    if (!log_id || typeof helpful !== 'boolean') {
      return NextResponse.json({ error: 'log_id and helpful required' }, { status: 400 })
    }
    const update: any = { helpful }
    if (typeof note === 'string' && note.trim()) update.feedback_note = note.trim().slice(0, 500)
    await supabaseAdmin.from('support_chat_logs').update(update).eq('id', log_id)
    return NextResponse.json({ ok: true })
  } catch {
    // Non-critical — never surface an error to the chat UI.
    return NextResponse.json({ ok: false })
  }
}
