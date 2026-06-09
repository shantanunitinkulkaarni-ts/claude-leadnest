export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWindowKeepalive, sendAppointmentReminder } from '@/lib/whatsapp'

// This route is called by Vercel Cron every 15 minutes
// Add to vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }] }

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = { keepalive: 0, reminders: 0, errors: 0 }

  try {
    // ── 1. WINDOW KEEP-ALIVE ──
    // Find leads where window expires in 1 hour (60 min from now)
    // and we haven't sent a keepalive in the last 2 hours
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const { data: keepaliveLeads } = await supabaseAdmin
      .from('leads')
      .select('*, agents(*)')
      .lt('window_expires_at', twoHoursFromNow)
      .gt('window_expires_at', oneHourFromNow) // window expires in 1-2 hours
      .eq('bot_paused', false)
      .not('status', 'in', '("closed_won","closed_lost")')
      .or(`window_keepalive_sent_at.is.null,window_keepalive_sent_at.lt.${twoHoursAgo}`)

    for (const lead of (keepaliveLeads || []) as any[]) {
      try {
        if (lead.agents?.bot_active && lead.agents?.wa_phone_number_id) {
          await sendWindowKeepalive(lead.agents, lead)
          results.keepalive++
        }
      } catch (e) {
        results.errors++
        console.error('Keepalive error for lead', lead.id, e)
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
        if (appt.agents?.wa_phone_number_id && appt.leads?.phone) {
          await sendAppointmentReminder(appt.agents, appt.leads, appt, appt.properties)

          // Mark reminder sent
          await supabaseAdmin
            .from('appointments')
            .update({ reminder_sent: true })
            .eq('id', appt.id)

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
    const now = new Date().toISOString()

    const { data: doneVisits } = await supabaseAdmin
      .from('appointments')
      .select('*, leads(*), agents(*)')
      .eq('status', 'upcoming') // still marked upcoming but time has passed
      .eq('post_visit_prompted', false)
      .lt('scheduled_at', now) // in the past
      .gte('scheduled_at', today.toISOString())

    for (const visit of (doneVisits || []) as any[]) {
      try {
        if (visit.agents?.wa_phone_number_id && visit.agents?.wa_access_token) {
          const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
          await sendWhatsAppMessage(
            visit.agents.wa_phone_number_id,
            visit.agents.wa_access_token,
            visit.agents.phone, // send to AGENT not lead
            `Site visit with ${visit.leads?.name || visit.leads?.phone} was today. How did it go?\n\nReply:\n1 - Interested, continue nurturing\n2 - Follow up in 7 days\n3 - Not interested, close lead`
          )

          await supabaseAdmin
            .from('appointments')
            .update({ post_visit_prompted: true, status: 'done' })
            .eq('id', visit.id)
        }
      } catch (e) {
        results.errors++
      }
    }

    return NextResponse.json({ ok: true, ...results })

  } catch (err: any) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
