export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireLeadAccess } from '@/lib/apiAuth'
import { handleAiBotMessage } from '@/lib/ai-bot'

// Onboarding simulation: the agent types AS the lead and the REAL bot replies —
// but nothing is sent over WhatsApp (simulate mode). The inbound + the bot's
// replies are saved to the inbox so the agent watches the real conversation.
// Only allowed on a SAMPLE lead, so the live bot can never be driven this way.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const leadId = body.lead_id
  const message = String(body.message || '').trim()
  if (!leadId || !message) return NextResponse.json({ error: 'lead_id and message required' }, { status: 400 })

  const access = await requireLeadAccess(leadId)
  if ('error' in access) return access.error

  const { data: lead } = await supabaseAdmin
    .from('leads').select('id, phone, agent_id, is_sample').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.is_sample) {
    return NextResponse.json({ error: 'Simulation is only available on the sample lead' }, { status: 400 })
  }

  // Save the inbound (lead) message so it shows in the inbox.
  await supabaseAdmin.from('messages').insert({
    lead_id: lead.id, agent_id: lead.agent_id, direction: 'inbound', content: message, sent_by: 'lead',
  })

  // Run the real bot in simulate mode (no WhatsApp send). Channel is a dummy —
  // simulate mode skips every send call, so no real creds are needed.
  try {
    await handleAiBotMessage({
      phone: lead.phone,
      message,
      agentId: lead.agent_id,
      channel: { phoneNumberId: '', accessToken: '' } as any,
      simulate: true,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Simulation failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
