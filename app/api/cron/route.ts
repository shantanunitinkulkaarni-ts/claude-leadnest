export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendAppointmentReminder, sendToLead, sendViaMsg91Template, sendWhatsAppTemplate, deductWABalance } from '@/lib/whatsapp'
import { generateNudge } from '@/lib/gemini'
import { runNurtureEmails } from '@/lib/nurture'
import { decideOutreach, pickTemplate, renderTemplate } from '@/lib/outreach'
import { decideNurtureStep, type NurturePlan } from '@/lib/nurtureFlow'

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
    // Approved-template sending master switch (flip on after verifying MSG91 format).
    const TEMPLATES_LIVE = process.env.MSG91_TEMPLATES_LIVE === 'true'
    const TEMPLATE_COST = Number(process.env.MSG91_TEMPLATE_COST || '1') // ₹ per send

    // ── Nurture-flow v2 (full timeline engine) — DARK until flipped on. ──
    // When NURTURE_FLOW_V2=true, the new engine (lib/nurtureFlow) drives BOTH the
    // in-window nudges (3/6/12/23h) AND the post-window plans A→B→C→D, replacing
    // sections 1 + 1b below. Off by default so prod behaviour is unchanged until
    // reviewed on staging. Sections 2-4 (reminders, post-visit, emails) run either way.
    const NURTURE_V2 = process.env.NURTURE_FLOW_V2 === 'true'
    if (NURTURE_V2) {
      await runNurtureFlowV2(now, TEMPLATES_LIVE, TEMPLATE_COST, results)
    }

    if (!NURTURE_V2 && withinQuietHours) {
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
    // Once the free 24h window closes, re-engage quiet leads with an approved
    // Marketing template. Context-driven cadence + value scaling + daytime fit
    // (lib/outreach), capped by agent intensity, credits-gated. The right
    // template + language + named variables are chosen per lead by pickTemplate.
    // Gated by MSG91_TEMPLATES_LIVE so it can be flipped on after a test send.
    if (!NURTURE_V2 && TEMPLATES_LIVE && withinQuietHours) {
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
          if (!agent.msg91_integrated_number) continue // MSG91-routed agents only
          if (Number(agent.wa_balance || 0) < TEMPLATE_COST) continue // budget gate

          const decision = decideOutreach(lead, agent, now)
          if (!decision.send) {
            if ('dormant' in decision && decision.dormant) {
              await supabaseAdmin.from('leads').update({ nurture_state: 'dormant' }).eq('id', lead.id)
            }
            continue
          }

          // Detect the lead's chat language from their most recent inbound text
          // (Devanagari → Hindi; refine to Marathi once that template clears).
          let lang = lead.language || 'en'
          if (!lead.language) {
            const { data: lastIn } = await supabaseAdmin
              .from('messages').select('content').eq('lead_id', lead.id).eq('direction', 'inbound')
              .order('created_at', { ascending: false }).limit(1)
            const txt = lastIn?.[0]?.content || ''
            if (/[ऀ-ॿ]/.test(txt)) lang = 'hi'
          }

          const tmpl = pickTemplate(lead, agent, lang)
          if (!tmpl) continue // nothing suitable/approved

          const reqId = await sendViaMsg91Template(
            agent.msg91_integrated_number, lead.phone, tmpl.name, tmpl.values, tmpl.language
          )
          if (!reqId) { results.errors++; continue }

          await deductWABalance(agent.id, TEMPLATE_COST, `Re-engagement (${tmpl.name}) — ${lead.name || lead.phone}`, tmpl.name, lead.id)
          await supabaseAdmin.from('messages').insert({
            lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
            content: renderTemplate(tmpl.name, tmpl.language, tmpl.values), sent_by: 'bot', wa_message_id: typeof reqId === 'string' ? reqId : null,
          })
          await supabaseAdmin.from('leads').update({
            template_touches: (lead.template_touches || 0) + 1,
            last_template_at: new Date().toISOString(),
          }).eq('id', lead.id)
          await supabaseAdmin.from('activity_log').insert({
            agent_id: agent.id, lead_id: lead.id, type: 'template_sent',
            title: 'Re-engagement message sent', description: `${tmpl.name} (${tmpl.language}) · ${decision.reason}`,
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
          const dt = new Date(appt.scheduled_at)
          const dateStr = dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
          const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          if (TEMPLATES_LIVE) {
            // Approved `visit_reminder` Utility template — delivers even outside
            // the 24h window. Values positional, in template order:
            // {{customer_name}} {{agency_name}} {{property}} {{visit_date}} {{visit_time}}
            const values = [
              { name: 'customer_name', value: (appt.leads.name || '').trim().split(/\s+/)[0] || 'there' },
              { name: 'agency_name', value: ag.agency_name || 'your property advisor' },
              { name: 'property', value: appt.properties?.title || 'your booked visit' },
              { name: 'visit_date', value: dateStr },
              { name: 'visit_time', value: timeStr },
            ]
            const rid = await sendViaMsg91Template(ag.msg91_integrated_number, appt.leads.phone, 'visit_reminder', values, 'en')
            if (rid) {
              await supabaseAdmin.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
              await supabaseAdmin.from('messages').insert({
                lead_id: appt.lead_id, agent_id: ag.id, direction: 'outbound',
                content: renderTemplate('visit_reminder', 'en', values), sent_by: 'bot', wa_message_id: typeof rid === 'string' ? rid : null,
              })
              results.reminders++
            } else results.errors++
          } else {
            // Pre-go-live fallback: free-text (only delivers inside the 24h window).
            const msg = `Hi ${appt.leads.name || 'there'}! Reminder: your site visit${appt.properties?.title ? ` for ${appt.properties.title}` : ''} is on ${dateStr} at ${timeStr}. See you there! 🏠`
            await sendToLead(ag, appt.leads, msg)
            await supabaseAdmin.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
            results.reminders++
          }
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

// ── Nurture-flow v2 executor (used when NURTURE_FLOW_V2=true) ─────────────────
// Drives both phases via the pure engine. In-window = free-text nudge (works in
// the 24h window). Post-window = approved paid template for the chosen plan
// (credits-gated). Plans whose template isn't approved yet are simply skipped
// (logged) until the template exists — see planTemplateForFlow.
type CronResults = { nudges: number; templates: number; reminders: number; errors: number; nurture: any }

// Build Meta's body components from our {name,value} list. Our templates use
// NAMED variables ({{customer_name}}…), so each parameter MUST carry parameter_name
// or Meta rejects the send.
function metaTemplateComponents(values: any): any[] {
  if (!Array.isArray(values) || !values.length) return []
  const parameters = values.map((v: any) =>
    typeof v === 'string'
      ? { type: 'text', text: v }
      : { type: 'text', parameter_name: v.name, text: String(v?.value ?? '') }
  )
  return [{ type: 'body', parameters }]
}

// Log a nurture move to the learning log (the data moat). Never breaks a send.
async function logNurtureMove(lead: any, agentId: string, move: string, channel: string, extra?: any) {
  try {
    await supabaseAdmin.from('nurture_events').insert({
      lead_id: lead.id, agent_id: agentId,
      state: lead.nurture_state || null, move, channel,
      signals: { engagement: lead.engagement || {}, personality: lead.personality || {} },
      meta: extra || null,
    })
  } catch { /* logging must never block the pipeline */ }
}

async function runNurtureFlowV2(nowMs: number, templatesLive: boolean, _templateCost: number, results: CronResults) {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('*, agents(*)')
    .eq('bot_paused', false)
    .eq('opted_in', true)
    .or('nurture_state.is.null,nurture_state.eq.active')
    .not('status', 'in', '("closed_won","closed_lost","visit_booked","visit_done")')
    .not('last_message_at', 'is', null)
    .limit(100)

  for (const lead of (leads || []) as any[]) {
    try {
      const agent = lead.agents
      if (!agent?.bot_active) continue

      const decision = decideNurtureStep(lead, agent, nowMs)
      if (!decision.send) continue

      if (decision.phase === 'in_window') {
        // Only nudge if it's our turn (lead hasn't already replied & is waiting).
        const { data: lastMsg } = await supabaseAdmin
          .from('messages').select('direction').eq('lead_id', lead.id)
          .order('created_at', { ascending: false }).limit(1)
        if (lastMsg?.[0]?.direction === 'inbound') continue

        const intensity = decision.band <= 3 ? 'soft' : decision.band <= 12 ? 'value' : 'window_save'
        const newCount = (lead.window_nudge_count || 0) + 1
        const text = await generateNudge(agent.id, lead.id, intensity as any)
        if (!text) {
          await supabaseAdmin.from('leads').update({ window_nudge_count: newCount, last_nudge_at: new Date().toISOString() }).eq('id', lead.id)
          continue
        }
        const waId = await sendToLead(agent, lead, text)
        await supabaseAdmin.from('messages').insert({
          lead_id: lead.id, agent_id: agent.id, direction: 'outbound', content: text, sent_by: 'bot', wa_message_id: waId || null,
        })
        await supabaseAdmin.from('leads').update({ window_nudge_count: newCount, last_nudge_at: new Date().toISOString() }).eq('id', lead.id)
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'nudge_sent',
          title: `Follow-up sent (in-window ${decision.band}h)`, description: text.slice(0, 140),
        })
        await logNurtureMove(lead, agent.id, `in_window_${decision.band}h_${intensity}`, 'free_text', { wa_message_id: waId })
        results.nudges++
      } else {
        // Post-window: approved Meta template only (out-of-window needs a template).
        if (!templatesLive) continue
        if (!agent.wa_phone_number_id || !agent.wa_access_token) continue // Meta-direct creds required

        let lang = lead.language || 'en'
        if (!lead.language) {
          const { data: lastIn } = await supabaseAdmin.from('messages').select('content').eq('lead_id', lead.id).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1)
          if (/[ऀ-ॿ]/.test(lastIn?.[0]?.content || '')) lang = 'hi'
        }
        const tmpl = planTemplateForFlow(decision.plan, lead, agent, lang)
        if (!tmpl) {
          // Plan's template not approved yet (e.g. open-question / offer). Hold the
          // lead here until the template exists. Logged for visibility.
          console.log(`[nurture-v2] plan ${decision.plan} template pending approval — lead ${lead.id} held`)
          continue
        }
        // Send via Meta Cloud API (the agent pays Meta directly — no wallet markup).
        const reqId = await sendWhatsAppTemplate(agent.wa_phone_number_id, agent.wa_access_token, lead.phone, tmpl.name, tmpl.language, metaTemplateComponents(tmpl.values))
        if (!reqId) { results.errors++; continue }
        await supabaseAdmin.from('messages').insert({
          lead_id: lead.id, agent_id: agent.id, direction: 'outbound',
          content: renderTemplate(tmpl.name, tmpl.language, tmpl.values), sent_by: 'bot',
          wa_message_id: typeof reqId === 'string' ? reqId : null,
        })
        const upd: any = { nurture_plan: decision.plan, last_template_at: new Date().toISOString() }
        if (decision.plan === 'D') upd.plan_d_touches = (lead.plan_d_touches || 0) + 1
        await supabaseAdmin.from('leads').update(upd).eq('id', lead.id)
        await supabaseAdmin.from('activity_log').insert({
          agent_id: agent.id, lead_id: lead.id, type: 'template_sent',
          title: `Nurture plan ${decision.plan} sent`, description: `${tmpl.name} (${tmpl.language})`,
        })
        await logNurtureMove(lead, agent.id, `plan_${decision.plan}`, 'template', { template: tmpl.name })
        results.templates++
      }
    } catch (e) {
      results.errors++
      console.error('[nurture-v2] error for lead', lead.id, e)
    }
  }
}

// Map a post-window plan to an approved template. Plans B (open question) and C
// (offer) need their own templates approved in MSG91 first — until then they
// return null and the lead waits. A (re-approach) and D (routine) reuse the
// already-approved suite via pickTemplate.
function planTemplateForFlow(plan: NurturePlan, lead: any, agent: any, lang: string) {
  if (plan === 'A' || plan === 'D') return pickTemplate(lead, agent, lang)
  // Plan B (open question) + C (offer) — now approved on Meta (EN). Same 3 vars.
  const name = (lead.name || '').trim().split(/\s+/)[0] || 'there'
  const agency = agent?.agency_name || 'your property advisor'
  const area = (Array.isArray(lead.preferred_areas) && lead.preferred_areas[0])
    || (Array.isArray(agent?.areas) && agent.areas[0]) || 'your area'
  const values = [
    { name: 'customer_name', value: name },
    { name: 'agency_name', value: agency },
    { name: 'area', value: area },
  ]
  if (plan === 'B') return { name: 'lead_open_question', language: 'en', values }
  if (plan === 'C') return { name: 'lead_offer', language: 'en', values }
  return null
}
