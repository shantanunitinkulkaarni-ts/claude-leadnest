export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/apiAuth'
import { sendViaMsg91Template } from '@/lib/whatsapp'
import { supabaseAdmin } from '@/lib/supabase'
import { renderTemplate } from '@/lib/outreach'

// Superadmin-only: fire ONE template to a chosen number to verify the MSG91
// named-variable format renders correctly before enabling broad sending.
// Body: { integrated_number, to, template, language, values: {name:value} }
export async function POST(request: NextRequest) {
  // Accept either a superadmin session OR the cron secret (so it can be fired
  // server-side for the one-time MSG91 format verification).
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const integrated = String(body.integrated_number || process.env.CONVORIAN_WA_NUMBER || '').replace(/\D/g, '')
    const to = String(body.to || '').replace(/\D/g, '')
    const template = String(body.template || '')
    const language = String(body.language || 'en')
    const values = (body.values && typeof body.values === 'object') ? body.values : {}
    if (!integrated || !to || !template) {
      return NextResponse.json({ error: 'integrated_number, to and template are required' }, { status: 400 })
    }
    const reqId = await sendViaMsg91Template(integrated, to, template, values, language)

    // Best-effort: log the rendered message into the matching lead's inbox so it
    // shows up like a real send (values must be {name,value}[] to render).
    if (reqId && Array.isArray(values)) {
      try {
        const { data: agent } = await supabaseAdmin.from('agents').select('id').eq('msg91_integrated_number', integrated).maybeSingle()
        if (agent) {
          const { data: lead } = await supabaseAdmin.from('leads').select('id')
            .eq('agent_id', agent.id).or(`phone.eq.+${to},phone.eq.${to}`)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (lead) {
            await supabaseAdmin.from('messages').insert({
              lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
              content: renderTemplate(template, language, values as any), sent_by: 'bot',
              wa_message_id: typeof reqId === 'string' ? reqId : null,
            })
          }
        }
      } catch { /* logging is non-critical for a test */ }
    }

    return NextResponse.json({ ok: !!reqId, requestId: reqId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
