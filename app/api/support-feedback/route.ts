import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Records a 👍/👎 on a support-chat reply. Public (the chat is public); only
// flips the `helpful` flag on a known log row — no data exposure. These quality
// labels are what make future few-shot selection good (vs. picking blind).
export async function POST(req: Request) {
  try {
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
