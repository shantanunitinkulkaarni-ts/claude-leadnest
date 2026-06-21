export const dynamic = "force-dynamic"
export const maxDuration = 60

// ─── AI-first bot test webhook ────────────────────────────────────────────────
// This route receives MSG91 webhook events for the TEST number (15559777365).
// It uses the new AI-first bot engine (lib/ai-bot.ts).
// Production webhook (/api/webhook) is NOT touched.
//
// MSG91 should be configured to point to:
//   https://convorian.in/api/webhook/ai
// for the test integrated number only.

import { NextRequest, NextResponse } from 'next/server'
import { handleAiBotMessage } from '@/lib/ai-bot'

import { supabaseAdmin } from '@/lib/supabase'

// Fallback test agent if no agent found by integrated number
const TEST_AGENT_ID = process.env.AI_BOT_TEST_AGENT_ID || 'b6ece25c-8bfd-4d1e-98e5-e2eff5ffe726'

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = ''
    let messageText = ''
    let integratedNumber = ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
    } else {
      const body = await request.json()

      if (body.integratedNumber && (body.customerNumber || body.messages)) {
        integratedNumber = String(body.integratedNumber)
        fromPhone = body.customerNumber
          ? '+' + String(body.customerNumber).replace(/^\+/, '')
          : ''

        // Extract message text (same multi-source logic as main webhook)
        const pick = (...xs: any[]) => {
          for (const x of xs) if (typeof x === 'string' && x.trim()) return x
          return ''
        }
        let btn = body.button
        if (typeof btn === 'string') { try { btn = JSON.parse(btn) } catch {} }

        messageText = pick(
          body.text,
          btn?.text, btn?.payload, btn?.title, btn?.value,
          typeof body.button === 'string' && !body.button.startsWith('{') ? body.button : '',
          body.buttonText, body.button_text, body.payload,
          body.interactive?.button_reply?.title, body.interactive?.button_reply?.id,
          body.interactive?.list_reply?.title, body.interactive?.list_reply?.id,
          body.content?.text,
          typeof body.content === 'string' ? body.content : '',
          body.message?.text,
          body.title,
        )
      }
    }

    if (!fromPhone || !messageText) {
      return NextResponse.json({ status: 'no_text' })
    }

    // Non-text media (images, stickers etc.) — politely decline
    if (!messageText.trim()) {
      return NextResponse.json({ status: 'non_text_ignored' })
    }

    console.log(`[webhook/ai] message from ${fromPhone}: "${messageText.slice(0, 100)}"`)

    // Look up agent by MSG91 integrated number (same as old webhook)
    let agentId = TEST_AGENT_ID
    if (integratedNumber) {
      const inboundNum = integratedNumber.replace(/\D/g, '')
      const { data: agentRow } = await supabaseAdmin
        .from('agents')
        .select('id')
        .eq('msg91_integrated_number', inboundNum)
        .maybeSingle()
      if (agentRow?.id) agentId = agentRow.id
    }

    // Run AI bot (non-blocking — respond 200 immediately)
    handleAiBotMessage({
      phone: fromPhone,
      message: messageText.trim(),
      agentId,
      integratedNumber: integratedNumber || String(process.env.MSG91_TEST_INTEGRATED_NUMBER || ''),
    }).catch(err => {
      console.error('[webhook/ai] handleAiBotMessage error:', err)
    })

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[webhook/ai] parse error:', err)
    return NextResponse.json({ status: 'error' }, { status: 200 }) // Always 200 to MSG91
  }
}

// MSG91 uses GET for webhook verification
export async function GET() {
  return NextResponse.json({ status: 'ai-bot webhook active' })
}
