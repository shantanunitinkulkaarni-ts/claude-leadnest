export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'
import { decideNurtureStep } from '@/lib/nurtureFlow'

// ─── Nurture-flow simulator (superadmin / CRON-gated) ────────────────────────
// Lets us SEE the full conversion timeline without waiting hours/days. It runs
// the pure engine (lib/nurtureFlow) — it never sends anything and never writes.
//
//   POST {}                      → "timeline": walk a synthetic lead through every
//                                  stage (3h→6h→12h→23h, then Plan A→B→C→D) and
//                                  show what the bot would do at each point.
//   POST { lead_id, at? }        → run the decision for ONE real lead, optionally
//                                  at a simulated time `at` (ISO). Dry — no send.
//
// To actually fire a send for end-to-end testing, set NURTURE_FLOW_V2=true (after
// applying 02_nurture_flow.sql) and hit /api/cron with the CRON_SECRET.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const H = 60 * 60 * 1000
  const DAY = 24 * H

  // ── One real lead, optionally at a simulated time ──
  if (body.lead_id) {
    const { data: lead } = await supabaseAdmin.from('leads').select('*, agents(*)').eq('id', body.lead_id).maybeSingle()
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    const nowMs = body.at ? new Date(body.at).getTime() : Date.now()
    const decision = decideNurtureStep(lead, lead.agents, nowMs)
    return NextResponse.json({ mode: 'lead', at: new Date(nowMs).toISOString(), decision })
  }

  // ── Synthetic timeline walk (no DB) ──
  // Anchor "now" at 10:00 IST so the daytime/quiet-hours gates pass and the whole
  // sequence is visible in one call. Each step rebuilds the lead state the cron
  // would have written after the previous send.
  const morning = Date.UTC(2026, 5, 1, 4, 30, 0) // 10:00 IST
  const baseLead: any = { status: 'new', opted_in: true, bot_paused: false, nurture_state: 'active' }

  const steps: { label: string; lead: any; nowMs: number }[] = [
    { label: '2h after message (too soon)', lead: { ...baseLead, window_nudge_count: 0, last_message_at: iso(morning - 2 * H) }, nowMs: morning },
    { label: '3h → nudge #1', lead: { ...baseLead, window_nudge_count: 0, last_message_at: iso(morning - 3.5 * H) }, nowMs: morning },
    { label: '6h → nudge #2', lead: { ...baseLead, window_nudge_count: 1, last_message_at: iso(morning - 6.5 * H) }, nowMs: morning },
    { label: '12h → nudge #3', lead: { ...baseLead, window_nudge_count: 2, last_message_at: iso(morning - 12.5 * H) }, nowMs: morning },
    { label: '23h → nudge #4 (last in-window)', lead: { ...baseLead, window_nudge_count: 3, last_message_at: iso(morning - 23.5 * H) }, nowMs: morning },
    { label: 'Day 1 (window closed) → Plan A', lead: { ...baseLead, window_nudge_count: 4, last_message_at: iso(morning - 25 * H) }, nowMs: morning },
    { label: 'Day ~3.5 → Plan B (open question)', lead: { ...baseLead, nurture_plan: 'A', last_message_at: iso(morning - 5 * DAY), last_template_at: iso(morning - 3 * DAY) }, nowMs: morning },
    { label: 'Day ~9 → Plan C (offer)', lead: { ...baseLead, nurture_plan: 'B', last_message_at: iso(morning - 12 * DAY), last_template_at: iso(morning - 6 * DAY) }, nowMs: morning },
    { label: 'Day ~20 → Plan D (routine)', lead: { ...baseLead, nurture_plan: 'C', last_message_at: iso(morning - 25 * DAY), last_template_at: iso(morning - 11 * DAY) }, nowMs: morning },
    { label: 'Plan D repeat (every ~4 days once steady)', lead: { ...baseLead, nurture_plan: 'D', plan_d_touches: 3, last_message_at: iso(morning - 60 * DAY), last_template_at: iso(morning - 4 * DAY) }, nowMs: morning },
    { label: 'At 11pm IST → blocked (quiet hours)', lead: { ...baseLead, window_nudge_count: 0, last_message_at: iso(Date.UTC(2026, 5, 1, 17, 30, 0) - 4 * H) }, nowMs: Date.UTC(2026, 5, 1, 17, 30, 0) },
    { label: 'Visit booked → flow stops', lead: { ...baseLead, status: 'visit_booked', window_nudge_count: 0, last_message_at: iso(morning - 5 * H) }, nowMs: morning },
  ]

  const timeline = steps.map(s => ({ label: s.label, decision: decideNurtureStep(s.lead, {}, s.nowMs) }))
  return NextResponse.json({ mode: 'timeline', note: 'Pure engine preview — nothing sent or written.', timeline })
}

function iso(ms: number) { return new Date(ms).toISOString() }
