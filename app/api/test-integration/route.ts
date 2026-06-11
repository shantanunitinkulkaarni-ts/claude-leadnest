export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  // Debug-only endpoint: writes mock data. Locked behind CRON_SECRET so it
  // can't be triggered (or used to enumerate/seed data) by the public.
  const auth = headers().get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Not found', { status: 404 })
  }
  const testAgentId = process.env.TWILIO_TEST_AGENT_ID
  let passed = 0
  let failed = 0
  const logs: string[] = []

  function assert(condition: boolean, msg: string) {
    if (condition) {
      logs.push(`✅ PASS: ${msg}`)
      passed++
    } else {
      logs.push(`❌ FAIL: ${msg}`)
      failed++
    }
  }

  try {
    // 1. Verify Agent
    const { data: agentRaw } = await supabaseAdmin.from('agents').select('*').eq('id', testAgentId).single()
    const agent = agentRaw as any
    assert(agent !== null, 'Test Agent exists in the database')
    assert(agent?.bot_active === true, 'Test Agent bot is active')

    // 2. Mock inbound lead
    const testPhone = `+91000000${Math.floor(Math.random() * 9999)}`
    logs.push(`\nTesting Webhook logic for new lead: ${testPhone}`)
    
    // Call the webhook internal logic or simulate the payload
    const whPayload = new URLSearchParams()
    whPayload.append('From', `whatsapp:${testPhone}`)
    whPayload.append('Body', 'Hi, I am looking for a 3BHK in Wakad.')
    whPayload.append('MessageSid', 'SM' + Math.random().toString(36).substring(7))
    whPayload.append('AgentId', testAgentId as string)

    const whRes = await fetch(`http://127.0.0.1:3000/api/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: whPayload.toString()
    })
    assert(whRes.ok, 'Webhook accepted the inbound payload')

    // Wait a moment for async db inserts inside webhook
    await new Promise(r => setTimeout(r, 2000))

    // 3. Verify Database State
    const { data: leadsRaw } = await supabaseAdmin.from('leads').select('*').eq('phone', testPhone)
    const leads = leadsRaw as any[]
    assert(leads && leads.length === 1, 'Lead was successfully created')
    const lead = leads?.[0]

    if (lead) {
      const { data: messagesRaw } = await supabaseAdmin.from('messages').select('*').eq('lead_id', lead.id)
      const messages = messagesRaw as any[]
      assert(messages && messages.length >= 2, 'Inbound and outbound messages logged')
      const outbound = messages?.find((m: any) => m.direction === 'outbound')
      assert(!!outbound, 'Bot generated outbound reply')
      
      // cleanup lead
      await supabaseAdmin.from('leads').delete().eq('id', lead.id)
    }

    logs.push(`\n--- TEST SUITE COMPLETE ---`)
    logs.push(`Passed: ${passed} | Failed: ${failed}`)

    return NextResponse.json({ status: failed === 0 ? 'success' : 'failure', logs })
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message, stack: err.stack, logs })
  }
}
