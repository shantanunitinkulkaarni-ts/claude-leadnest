export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendAppointmentReminder, sendToLead, sendViaMsg91Template, deductWABalance } from '@/lib/whatsapp'
import { generateNudge } from '@/lib/gemini'
import { runNurtureEmails } from '@/lib/nurture'
import { decideOutreach } from '@/lib/outreach'

export const maxDuration = 60

// Called every 15 minutes. On Vercel Hobby (max 1 cron/day) the real driver is
// the GitHub Action .github/workflows/nurture-cron.yml, which hits this route
// with the CRON_SECRET. Idempotent — guarded by timestamps/counters per lead.

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = { nudges: 0, templates: 0, reminders: 0, errors: 0, nurture: { sent: 0, skipped: 0, errors: 0 } }

  try {
    // ── 1. IN-WINDOW FOLLOW-UP NUDGES (3h / 10h / 23h) ──
    // Re-engage leads who went quiet, while their free 24h window is still open.
    // Bands: 1st nudge after 3h, 2nd after 10h, 3rd ("window save") after 23h.
    // Counter resets to 0 on any inbound (handled in the webhook).
    const now = Date.now()
    const H = (n: number) => n * 60 * 60 * 1000
    // IST quiet hours: only send 9 AM–8 PM IST so we never ping at night.
    const istHour = new Date(now + 5.5 * H(1)).getUTCHours()
    const withinQuietHours = istHour >= 9 && istHour < 20

    if (withinQuietHours) {
      // Window still open (lead messaged in the last 24h), not closed/paused/opted-out.
      const windowOpenAfter = new Date(now - H(24)).toISOString()
      const { data: quietLeads } = await supabaseAdmin
        .from('leads')
        .select('*, agents(*)')
        .gt('last_message_at', windowOpenAfter)
        .eq('bot_paused', false)
        .eq('opted_in', true)
        .or('nurture_state.is.null,nurture_state.eq.active')
        .not('status', 'in', '("closed_won","closed_lost")')
        .lt('window_nudge_count', 3)
        .limit(40)

      for (const lead of (quietLeads || []) as any[]) {
        try {
          const agent = lead.agents
          if (!agent?.bot_active) continue

          const lastMsgMs = lead.last_message_at ? new Date(lead.last_message_at).getTime() : 0
          const elapsed = now - lastMsgMs
          const count = lead.window_nudge_count || 0
          const lastNudgeMs = lead.last_nudge_at ? new Date(lead.last_nudge_at).getTime() : 0

          // Decide whether THIS lead is due for its next nudge.
          let intensity: 'soft' | 'value' | 'window_save' | null = null
          if (count === 0 && elapsed >= H(3) && elapsed < H(10)) intensity = 'soft'
          else if (count === 1 && elapsed >= H(10) && elapsed < H(23)) intensity = 'value'
          else if (count === 2 && elapsed >= H(23) && elapsed < H(24)) intensity = 'window_save'
          if (!intensity) continue
          // Never two nudges within 2h (safety vs clock skew / double runs).
          if (lastNudgeMs && now - lastNudgeMs < H(2)) continue

          // Only nudge if the LAST message was ours (lead hasn't already replied
          // and is waiting on nothing). Cheap check on the most recent message.
          const { data: lastMsg } = await supabaseAdmin
            .from('messages').select('direction').eq('lead_id', lead.id)
            .order('created_at', { ascending: false }).limit(1)
          if (lastMsg?.[0]?.direction === 'inbound') continue // their turn, don't nudge

          const text = await generateNudge(agent.id, lead.id, intensity)
          if (!text) {
            // Engine chose SKIP (nothing new to say) — still advance the counter
            // so we don't re-evaluate this band forever.
            await supabaseAdmin.from('leads').update({ window_nudge_count: count + 1, last_nudge_at: new Date().toISOString() }).eq('id', lead.id)
            continue
          }

          const waId = await sendToLead(agent, lead, text)
          await supabaseAdmin.from('messages').insert({
            lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
            content: text, sent_by: 'bot', wa_message_id: waId || null,
          })
          await supabaseAdmin.from('leads').update({
            window_nudge_count: count + 1,
            last_nudge_at: new Date().toISOString(),
          }).eq('id', lead.id)
          await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'nudge_sent',
            title: 'Follow-up sent by AI', description: text.slice(0, 140),
          })
          results.nudges++
        } catch (e) {
          results.errors++
          console.error('Nudge error for lead', lead.id, e)
        }
      }
    }

    // ── 1b. PAID TEMPLATE RE-ENGAGEMENT (window closed) ──
    // Once the free 24h window has closed, re-engage quiet leads with the
    // approved Marketing template. Context-driven cadence (lib/outreach), agent
    // intensity, daytime/weekend fit, capped, credits-gated. Disabled until the
    // template is configured (MSG91_NURTURE_TEMPLATE).
    const NURTURE_TEMPLATE = process.env.MSG91_NURTURE_TEMPLATE || ''
    const TEMPLATE_LANG = process.env.MSG91_NURTURE_TEMPLATE_LANG || 'en'
    const TEMPLATE_COST = Number(process.env.MSG91_TEMPLATE_COST || '1') // ₹ per send
    if (NURTURE_TEMPLATE && withinQuietHours) {
      const windowClosedBefore = new Date(now - H(24)).toISOString()
      const { data: dormantCandidates } = await supabaseAdmin
        .from('leads')
        .select('*, agents(*)')
        .lt('last_message_at', windowClosedBefore) // 24h window is closed
        .eq('bot_paused', false)
        .eq('opted_in', true)
        .or('nurture_state.is.null,nurture_state.eq.active')
        .not('status', 'in', '("closed_won","closed_lost")')
        .limit(60)

      for (const lead of (dormantCandidates || []) as any[]) {
        try {
          const agent = lead.agents
          if (!agent?.bot_active) continue
          // Only MSG91-routed agents can send this template today.
          if (!agent.msg91_integrated_number) continue
          // Budget gate — never send without credits.
          if (Number(agent.wa_balance || 0) < TEMPLATE_COST) continue

          const decision = decideOutreach(lead, agent, now)
          if (!decision.send) {
            if ('dormant' in decision && decision.dormant) {
              await supabaseAdmin.from('leads').update({ nurture_state: 'dormant' }).eq('id', lead.id)
            }
            continue
          }

          const reqId = await sendViaMsg91Template(
            agent.msg91_integrated_number, lead.phone, NURTURE_TEMPLATE, decision.values, TEMPLATE_LANG
          )
          if (!reqId) { results.errors++; continue }

          await deductWABalance(agent.id, TEMPLATE_COST, `Re-engagement template — ${lead.name || lead.phone}`, NURTURE_TEMPLATE, lead.id)
          await supabaseAdmin.from('messages').insert({
            lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
            content: `[template: ${NURTURE_TEMPLATE}] re-engagement`, sent_by: 'bot', wa_message_id: typeof reqId === 'string' ? reqId : null,
          })
          await supabaseAdmin.from('leads').update({
            template_touches: (lead.template_touches || 0) + 1,
            last_template_at: new Date().toISOString(),
          }).eq('id', lead.id)
          await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'template_sent',
            title: 'Re-engagement message sent', description: decision.reason,
          })
          results.templates++
        } catch (e) {
          results.errors++
          console.error('Template outreach error for lead', lead.id, e)
        }
      }
    }

    // ── 2. APPOINTMENT REMINDERS ──
    // Find appointments scheduled for tomorrow, reminder not yet sent
    const tomorrowStart = new Date()
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    tomorrowStart.setHours(0, 0, 0, 0)

    const tomorrowEnd = new Date()
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
    tomorrowEnd.setHours(23, 59, 59, 999)

    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select('*, leads(*), agents(*), properties(*)')
      .eq('status', 'upcoming')
      .eq('reminder_sent', false)
      .gte('scheduled_at', tomorrowStart.toISOString())
      .lte('scheduled_at', tomorrowEnd.toISOString())

    for (const appt of (appointments || []) as any[]) {
      try {
        const ag = appt.agents
        if (!ag || !appt.leads?.phone) continue

        if (ag.msg91_integrated_number) {
          // MSG91: no approved reminder template yet → free-text (works if the
          // lead's 24h window is open; harmless no-op otherwise). Template
          // upgrade tracked in HANDOFF.
          const dt = new Date(appt.scheduled_at)
          const dateStr = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
          const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          const msg = `Hi ${appt.leads.name || 'there'}! Reminder: your site visit${appt.properties?.title ? ` for ${appt.properties.title}` : ''} is on ${dateStr} at ${timeStr}. See you there! 🏠`
          await sendToLead(ag, appt.leads, msg)
          await supabaseAdmin.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
          results.reminders++
        } else if (ag.wa_phone_number_id) {
          await sendAppointmentReminder(ag, appt.leads, appt, appt.properties)
          await supabaseAdmin.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
          results.reminders++
        }
      } catch (e) {
        results.errors++
        console.error('Reminder error for appointment', appt.id, e)
      }
    }

    // ── 3. POST-VISIT PROMPTS ──
    // Find appointments that happened today and need post-visit follow-up
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nowIso = new Date().toISOString()

    const { data: doneVisits } = await supabaseAdmin
      .from('appointments')
      .select('*, leads(*), agents(*)')
      .eq('status', 'upcoming') // still marked upcoming but time has passed
      .eq('post_visit_prompted', false)
      .lt('scheduled_at', nowIso) // in the past
      .gte('scheduled_at', today.toISOString())

    for (const visit of (doneVisits || []) as any[]) {
      try {
        const ag = visit.agents
        if (!ag) continue
        // Notify the AGENT their visit happened (dashboard FeedbackGate is the
        // primary capture; this WhatsApp ping is a best-effort nudge).
        const msg = `Site visit with ${visit.leads?.name || visit.leads?.phone} was today. How did it go? Log the outcome in your Convorian dashboard so the AI can follow up and close.`
        const agentAsRecipient = { phone: ag.phone }
        if (ag.msg91_integrated_number || ag.wa_phone_number_id) {
          await sendToLead(ag, agentAsRecipient, msg)
        }
        await supabaseAdmin
          .from('appointments')
          .update({ post_visit_prompted: true, status: 'done' })
          .eq('id', visit.id)
      } catch (e) {
        results.errors++
      }
    }

    // ── 4. NURTURE / LIFECYCLE EMAILS ──
    // Runs daily: welcome follow-ups, value recaps, upgrade nudges.
    try {
      results.nurture = await runNurtureEmails()
    } catch (e) {
      console.error('Nurture email run failed:', e)
    }

    return NextResponse.json({ ok: true, ...results })

  } catch (err: any) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
