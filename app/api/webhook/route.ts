export const dynamic = "force-dynamic"
// Engine can take a GLM attempt (8s) + retry (20s) + DB work — without this Vercel
// kills the function mid-run and Meta/MSG91 retry the webhook, causing double replies.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateBotReply } from '@/lib/gemini'
import { sendWhatsAppMessage, sendViaMsg91 } from '@/lib/whatsapp'
import { shouldBotReply } from '@/lib/botGating'
import * as chrono from 'chrono-node'

const PROVIDER = process.env.WHATSAPP_PROVIDER || 'meta'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  const tStart = Date.now()
  try {
    const contentType = request.headers.get('content-type') || ''
    let fromPhone = '', messageText = '', waMessageId = '', phoneNumberId = '', forcedAgentId = ''
    let incomingProvider: 'meta' | 'twilio' | 'msg91' = PROVIDER === 'twilio' ? 'twilio' : 'meta'
    let msg91IntegratedNumber = ''

    if (PROVIDER === 'twilio' || contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      fromPhone = (params.get('From') || '').replace('whatsapp:', '').trim()
      // Normalize: always ensure + prefix for consistent DB matching
      if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone
      messageText = params.get('Body') || ''
      waMessageId = params.get('MessageSid') || ''
      forcedAgentId = params.get('AgentId') || ''
      phoneNumberId = 'twilio'
      if (!messageText || !fromPhone) return new NextResponse('OK', { status: 200 })
    } else {
      const body = await request.json()
      // ── MSG91 (BSP) inbound — detected by its distinctive fields ──
      if (body.integratedNumber && (body.customerNumber || body.messages)) {
        incomingProvider = 'msg91'
        msg91IntegratedNumber = String(body.integratedNumber)
        fromPhone = body.customerNumber ? '+' + String(body.customerNumber).replace(/^\+/, '') : ''
        messageText = body.text || ''
        waMessageId = body.uuid || ''
        if (body.contentType && body.contentType !== 'text') return NextResponse.json({ status: 'ignored_non_text' })
        if (!messageText || !fromPhone) return NextResponse.json({ status: 'no_text' })
      } else if (body.object === 'whatsapp_business_account') {
        // ── Meta Cloud API inbound ──
        const value = body.entry?.[0]?.changes?.[0]?.value
        if (!value?.messages?.length) return NextResponse.json({ status: 'no_messages' })
        const incomingMsg = value.messages[0]
        phoneNumberId = value.metadata?.phone_number_id || ''
        fromPhone = incomingMsg.from || ''
        messageText = incomingMsg.text?.body || ''
        waMessageId = incomingMsg.id || ''
        if (!messageText || !phoneNumberId) return NextResponse.json({ status: 'no_text' })
      } else {
        return NextResponse.json({ status: 'ignored' })
      }
    }

    let agent: any = null
    if (incomingProvider === 'msg91') {
      // Map the MSG91 business number that received the message → its owning agent
      // (multi-tenant). Numbers are stored digits-only; normalise before matching.
      const inboundNum = msg91IntegratedNumber.replace(/\D/g, '')
      if (inboundNum) {
        const { data } = await supabaseAdmin
          .from('agents').select('*')
          .eq('msg91_integrated_number', inboundNum)
          .maybeSingle()
        agent = data
      }
      // Fallback for single-number setups (e.g. founder's own test SIM): route to
      // the agent named in MSG91_TEST_AGENT_ID when no number match is found.
      if (!agent) {
        const testId = process.env.MSG91_TEST_AGENT_ID
        if (testId) {
          const { data } = await supabaseAdmin.from('agents').select('*').eq('id', testId).single()
          agent = data
        }
      }
    } else if (forcedAgentId) {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('id', forcedAgentId).single()
      agent = data
    } else if (PROVIDER === 'twilio') {
      const testAgentId = process.env.TWILIO_TEST_AGENT_ID
      if (testAgentId) {
        const { data } = await supabaseAdmin.from('agents').select('*').eq('id', testAgentId).single()
        agent = data
      } else {
        const { data } = await supabaseAdmin.from('agents').select('*').eq('bot_active', true).limit(1).single()
        agent = data
      }
    } else {
      const { data } = await supabaseAdmin.from('agents').select('*').eq('wa_phone_number_id', phoneNumberId).eq('wa_verified', true).single()
      agent = data
    }

    if (!agent) {
      console.log('Webhook Debug: Agent not found')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'agent_not_found' })
    }
    // Agent-level gates (bot off / limit reached / subscription lapsed),
    // centralised + unit-tested in lib/botGating.ts. 'active' agents are never
    // blocked by expiry (protects demo/comp/legacy/trial-not-yet-expired).
    {
      const gate = shouldBotReply({
        bot_active: agent.bot_active,
        messages_used: agent.messages_used,
        messages_limit: agent.messages_limit,
        plan_status: agent.plan_status,
        plan_expires_at: agent.plan_expires_at,
      })
      if (!gate.reply) {
        console.log('Webhook Debug: bot gated —', gate.reason)
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: gate.reason })
      }
    }

    // Early dedup: Meta/MSG91 retry deliveries, so the same message can arrive
    // more than once. Cheap pre-check here; the authoritative guard is the
    // unique-index-protected insert below (atomic, race-proof).
    if (waMessageId) {
      const { data: existing } = await supabaseAdmin.from('messages').select('id').eq('wa_message_id', waMessageId).eq('direction', 'inbound').limit(1)
      if (existing && existing.length > 0) {
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'duplicate' })
      }
    }

    const now = new Date().toISOString()
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let { data: leads } = await supabaseAdmin.from('leads')
      .select('*')
      .eq('agent_id', agent.id)
      .or(`phone.eq.${fromPhone},phone.eq.${fromPhone.replace('+', '')}`)
      .order('created_at', { ascending: false })
      .limit(1)
      
    let lead: any = leads?.[0] || null

    if (!lead) {
      const { data: newLead, error: leadInsertError } = await supabaseAdmin.from('leads').insert({
        agent_id: agent.id, phone: fromPhone, last_message_at: now,
        window_expires_at: windowExpiry, status: 'new', temperature: 'new',
        // Lead messaged the business first → implied opt-in consent (Meta-compliant)
        opted_in: true, opt_in_at: now, opt_in_source: 'whatsapp_inbound'
      }).select().single()
      if (leadInsertError || !newLead) {
        console.error('Webhook: Failed to create lead', leadInsertError)
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'lead_create_failed' })
      }
      lead = newLead
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'lead_created',
        title: 'New lead created', description: `First message from ${fromPhone}`
      })
    } else {
      await supabaseAdmin.from('leads').update({ last_message_at: now, window_expires_at: windowExpiry }).eq('id', lead.id)
    }

    // Atomic dedup: the unique index on inbound wa_message_id makes this insert
    // fail with 23505 if a concurrent retry already recorded the same message —
    // the loser exits WITHOUT generating a second reply.
    const { error: inboundInsertError } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'inbound',
      content: messageText, wa_message_id: waMessageId || null, sent_by: 'lead'
    })
    if (inboundInsertError) {
      if (inboundInsertError.code === '23505') {
        console.log('Webhook Debug: duplicate inbound message (unique index), skipping')
        return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'duplicate' })
      }
      console.error('Webhook: Failed to record inbound message', inboundInsertError)
      // Don't reply if we couldn't record the message — a retry will reprocess it cleanly.
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'message_insert_failed' })
    }

    if (lead.bot_paused) {
      console.log('Webhook Debug: Lead is in manual mode (bot paused)')
      return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'manual_mode' })
    }

    console.log(`Webhook Debug: Calling engine for lead ${lead.phone} with message: "${messageText}"`)
    const tEngine = Date.now()
    let reply: string, metadata: any
    try {
      const result = await generateBotReply(agent.id, lead.id, messageText)
      reply = result.reply
      metadata = result.metadata
    } catch (engineErr: any) {
      console.error('Webhook: engine error, using fallback reply', engineErr.message)
      reply = `Thank you for reaching out! Our team will get back to you shortly. 🙏`
      metadata = {}
    }
    console.log(`Webhook Timing: engine took ${Date.now() - tEngine}ms`)
    console.log(`Webhook Debug: Engine replied with: "${reply}" and metadata:`, metadata)

    const leadUpdates: any = { updated_at: now }
    if (metadata.score) leadUpdates.ai_score = metadata.score
    if (metadata.temperature) leadUpdates.temperature = metadata.temperature
    if (metadata.intent) leadUpdates.intent = metadata.intent
    if (metadata.areas) leadUpdates.preferred_areas = metadata.areas
    if (metadata.budget_min) leadUpdates.budget_min = metadata.budget_min
    if (metadata.budget_max) leadUpdates.budget_max = metadata.budget_max
    if (metadata.timeline) leadUpdates.timeline = metadata.timeline
    if (metadata.name) leadUpdates.name = metadata.name
    if (metadata.score >= 7) leadUpdates.status = 'qualified'
    else if (metadata.score >= 4) leadUpdates.status = 'contacted'

    // 1. Check for Cancellation
    if (metadata.appointment_status === 'cancelled' || /(cancel|drop|abort)[\s\S]*?(visit|appointment|viewing|meeting)/i.test(reply)) {
       console.log('APPT-DEBUG: Cancellation detected');
       leadUpdates.status = 'contacted'; // reset status
       
       const { data: existingAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'upcoming')
        .limit(1)
        
       if (existingAppts && existingAppts.length > 0) {
         await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', existingAppts[0].id);
         await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'status_change',
            title: 'Site visit cancelled',
            description: 'Lead cancelled their scheduled site visit via WhatsApp.'
         })
       }
    } else {
      // 2. Ultimate fallback: If Gemini stubbornly omits appointment_booked_time from JSON,
      if (!metadata.appointment_booked_time && /(confirm|lock in|schedule|set|book|confirmed|updat|reschedul|chang)[\s\S]*?(visit|appointment|viewing|tomorrow|today|at\s+\d+|on\s+\d+)/i.test(reply)) {
         console.log('APPT-DEBUG: Regex fallback triggered — extracting time from reply text using chrono-node')
         const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
         const parsedResults = chrono.parse(reply, nowIST, { forwardDate: true });
         
         if (parsedResults && parsedResults.length > 0) {
             const comp = parsedResults[0].start;
             
             if (!comp.isCertain('hour')) {
                 console.log('APPT-DEBUG: Chrono found a date but no explicit time, ignoring to avoid aggressive booking.')
             } else {
                 const year = comp.get('year') || nowIST.getUTCFullYear();
                 const month = comp.get('month') ? (comp.get('month') as number) - 1 : nowIST.getUTCMonth();
                 const day = comp.get('day') || nowIST.getUTCDate();
                 const hours = comp.get('hour') || 0;
                 const minutes = comp.get('minute') || 0;

                 const istMs = Date.UTC(year, month, day, hours, minutes, 0) - (5.5 * 60 * 60 * 1000);
                 metadata.appointment_booked_time = new Date(istMs).toISOString();
                 console.log('APPT-DEBUG: Chrono extracted appointment time (IST->UTC):', metadata.appointment_booked_time)
             }
         } else {
             console.log('APPT-DEBUG: Regex matched but chrono could not find a date in reply')
         }
      }

      console.log('APPT-DEBUG: metadata.appointment_booked_time =', metadata.appointment_booked_time || 'NOT SET')

    if (metadata.appointment_booked_time) {
      let parsedDate = new Date(metadata.appointment_booked_time);
      if (isNaN(parsedDate.getTime())) {
         parsedDate = new Date(Date.now() + 24 * 60 * 60 * 1000); 
         console.log('APPT-DEBUG: Date was unparseable, using fallback:', parsedDate.toISOString())
      }
      
      leadUpdates.status = 'visit_booked'
      
      let safePropertyId = null;
      if (metadata.matched_property_id) {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.matched_property_id);
          safePropertyId = isUUID ? metadata.matched_property_id : null;
      }

      // Check if there is already an upcoming appointment for this lead
      const { data: existingAppts } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'upcoming')
        .limit(1)

      let apptData, apptError;
      
      if (existingAppts && existingAppts.length > 0) {
        // Troll detection: Check how many times they have rescheduled
        const { count: rescheduleCount } = await supabaseAdmin
          .from('activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .eq('title', 'Site visit rescheduled by AI')

        if (rescheduleCount !== null && rescheduleCount >= 3) {
          // Reschedule limit reached: block this time change and bring in a
          // human — but KEEP THE BOT ON. Pausing here left leads talking to a
          // wall (no replies at all) while the agent never noticed the silent
          // activity-log entry. Now: bot keeps answering, agent gets an email.
          console.log('APPT-DEBUG: Reschedule limit (>=3). Blocking change, alerting agent, bot stays on.')
          reply = "Noted! Since we've moved this a few times, our team will personally call you to lock in the final time — that way it's settled in one go. Meanwhile, I'm right here for anything else you'd like to know. 😊"

          // Alert the agent ONCE per lead (email + activity log), not on every attempt.
          const { data: prevHandover } = await supabaseAdmin
            .from('activity_log').select('id')
            .eq('lead_id', lead.id).eq('type', 'human_handover').limit(1)
          if (!prevHandover || prevHandover.length === 0) {
            await supabaseAdmin.from('activity_log').insert({
              agent_id: agent.id, lead_id: lead.id, type: 'human_handover',
              title: 'Action needed: call this lead to fix the visit time',
              description: `${lead.name || lead.phone} has rescheduled 3+ times. The bot has stopped changing the appointment — please call them to confirm a final time.`
            })
            try {
              const { sendEmail } = await import('@/lib/email')
              if (agent.email) {
                await sendEmail({
                  to: agent.email,
                  subject: `Action needed: ${lead.name || lead.phone} keeps rescheduling — please call them`,
                  html: `<p>Hi ${agent.name || ''},</p><p><strong>${lead.name || 'A lead'} (${lead.phone})</strong> has rescheduled their site visit 3+ times. Your AI assistant has stopped changing the appointment and told them your team will call to fix a final time.</p><p><strong>Please call them to confirm the visit.</strong> The bot is still answering their other questions in the meantime.</p>`
                })
              }
            } catch (mailErr: any) {
              console.error('Handover email failed (non-critical):', mailErr?.message)
            }
          }

          // Skip updating the appointment time in DB
          metadata.appointment_booked_time = null
        } else {
          console.log('APPT-DEBUG: Found existing upcoming appointment, updating time to:', parsedDate.toISOString())
          const res = await supabaseAdmin.from('appointments').update({
            scheduled_at: parsedDate.toISOString(),
            property_id: safePropertyId || undefined // don't clear it if they just rescheduled
          }).eq('id', existingAppts[0].id).select()
          apptData = res.data
          apptError = res.error
        }
      } else {
        console.log('APPT-DEBUG: Inserting new appointment — agent_id:', agent.id, 'lead_id:', lead.id, 'property_id:', safePropertyId, 'scheduled_at:', parsedDate.toISOString())
        const res = await supabaseAdmin.from('appointments').insert({
          agent_id: agent.id,
          lead_id: lead.id,
          property_id: safePropertyId,
          scheduled_at: parsedDate.toISOString(),
          status: 'upcoming'
        }).select()
        apptData = res.data
        apptError = res.error
      }
      
      if (metadata.appointment_booked_time) {
        if (apptError) {
          console.error('APPT-DEBUG: SAVE FAILED:', apptError)
        } else {
          console.log('APPT-DEBUG: SAVE SUCCESS:', apptData)
        }
        
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'visit_booked',
          title: existingAppts && existingAppts.length > 0 ? 'Site visit rescheduled by AI' : 'Site visit booked by AI',
          description: `Scheduled for ${parsedDate.toLocaleString('en-IN')}`
        })
      }
    } // end of Book/Reschedule Logic
    }

    await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

    if (metadata.score) {
      await supabaseAdmin.from('activity_log').insert({
        agent_id: agent.id, lead_id: lead.id, type: 'score_updated',
        title: `Lead scored ${metadata.score}/10 — ${metadata.temperature || 'unknown'}`,
        description: `Intent: ${metadata.intent || '?'} | Budget: ${metadata.budget_min ? `₹${metadata.budget_min/100000}L` : '?'}`
      })
    }

    // Save bot reply to DB first — ensures simulation mode always shows the reply
    const { data: outboundMsg } = await supabaseAdmin.from('messages').insert({
      lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
      content: reply, sent_by: 'bot'
    }).select('id').single()

    // Then attempt WhatsApp delivery (non-blocking — simulation works even if this fails)
    try {
      let outWaId: string | null
      if (incomingProvider === 'msg91') {
        outWaId = await sendViaMsg91(msg91IntegratedNumber, fromPhone, reply)
      } else {
        const toPhone = PROVIDER === 'twilio' ? `whatsapp:${fromPhone}` : fromPhone
        outWaId = await sendWhatsAppMessage(agent.wa_phone_number_id, agent.wa_access_token, toPhone, reply)
      }
      if (outWaId && outboundMsg?.id) {
        // Stamp the exact row we just inserted (order/limit are not valid on updates).
        await supabaseAdmin.from('messages')
          .update({ wa_message_id: outWaId })
          .eq('id', outboundMsg.id)
      }
      console.log(`Webhook Debug: WhatsApp sent. ID: ${outWaId}`)
    } catch (waErr: any) {
      console.log(`Webhook Debug: WhatsApp send failed (simulation mode OK): ${waErr.message}`)
    }

    await supabaseAdmin.from('agents').update({ messages_used: (agent.messages_used || 0) + 2 }).eq('id', agent.id)

    console.log(`Webhook Timing: total ${Date.now() - tStart}ms (lead ${lead.phone})`)
    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'ok' })

  } catch (err: any) {
    console.error('Webhook error:', err)
    return PROVIDER === 'twilio' ? new NextResponse('OK', { status: 200 }) : NextResponse.json({ status: 'error', message: err.message }, { status: 500 })
  }
}
