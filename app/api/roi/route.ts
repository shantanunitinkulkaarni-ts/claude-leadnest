export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────
// ROI Analytics Engine
// Computes every metric an agent needs to see their real ROI
// Average Indian estate agent commission = 1-2% of property value
// Typical residential deal = ₹60L = ₹60,000-1,20,000 commission
// Typical rental deal = 1 month rent = ₹15,000-25,000
// ─────────────────────────────────────────────────────────────────

const AVG_SALE_COMMISSION_PCT = 0.015  // 1.5%
const AVG_SALE_VALUE = 7500000         // ₹75L average deal
const AVG_RENTAL_COMMISSION = 20000    // ₹20K average
const AVG_DEAL_VALUE = AVG_SALE_VALUE * AVG_SALE_COMMISSION_PCT // ₹1.125L

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  const period = request.nextUrl.searchParams.get('period') || '30' // days
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const access = await requireAgentAccess(agentId)
  if ('error' in access) return access.error

  const days = parseInt(period)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString()

  const [
    agentRes,
    allLeadsRes,
    periodLeadsRes,
    prevLeadsRes,
    messagesRes,
    appointmentsRes,
    closedRes,
    propertiesRes,
    activityRes,
    waTransRes,
    dailyLeadsRes,
  ] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('id,status,temperature,intent,ai_score,created_at,budget_min,budget_max').eq('agent_id', agentId),
    supabaseAdmin.from('leads').select('id,status,temperature,intent,ai_score,created_at,budget_min,budget_max').eq('agent_id', agentId).gte('created_at', since),
    supabaseAdmin.from('leads').select('id,status,temperature').eq('agent_id', agentId).gte('created_at', prevSince).lt('created_at', since),
    supabaseAdmin.from('messages').select('id,direction,sent_by,created_at').eq('agent_id', agentId).gte('created_at', since),
    supabaseAdmin.from('appointments').select('*').eq('agent_id', agentId).gte('created_at', since),
    supabaseAdmin.from('leads').select('id,intent,budget_min,budget_max,status').eq('agent_id', agentId).in('status', ['closed_won']),
    supabaseAdmin.from('properties').select('id,status,type,price,rent_per_month').eq('agent_id', agentId),
    supabaseAdmin.from('activity_log').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('wa_transactions').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('leads').select('created_at').eq('agent_id', agentId).gte('created_at', since),
  ])

  const agent = agentRes.data as any
  const allLeads: any[] = allLeadsRes.data || []
  const periodLeads: any[] = periodLeadsRes.data || []
  const prevLeads: any[] = prevLeadsRes.data || []
  const messages: any[] = messagesRes.data || []
  const appointments: any[] = appointmentsRes.data || []
  const closedWon: any[] = closedRes.data || []
  const properties: any[] = propertiesRes.data || []
  const activity: any[] = activityRes.data || []
  const waTransactions: any[] = waTransRes.data || []
  const dailyLeads: any[] = dailyLeadsRes.data || []

  // ── Core funnel metrics ──
  const totalLeads = periodLeads.length
  const prevTotal = prevLeads.length
  const hotLeads = periodLeads.filter(l => l.temperature === 'hot').length
  const warmLeads = periodLeads.filter(l => l.temperature === 'warm').length
  const coldLeads = periodLeads.filter(l => l.temperature === 'cold').length
  const qualifiedLeads = periodLeads.filter(l => ['qualified', 'visit_booked', 'visit_done', 'closed_won'].includes(l.status)).length
  const visitsBooked = appointments.length
  const visitsDone = appointments.filter(a => a.status === 'done').length
  const dealsClosedPeriod = periodLeads.filter(l => l.status === 'closed_won').length
  const totalDeals = closedWon.length

  // ── Conversion rates ──
  const leadToQualified = totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) : '0'
  const qualifiedToVisit = qualifiedLeads > 0 ? ((visitsBooked / qualifiedLeads) * 100).toFixed(1) : '0'
  const visitToDeal = visitsDone > 0 ? ((dealsClosedPeriod / visitsDone) * 100).toFixed(1) : '0'
  const overallConversion = totalLeads > 0 ? ((dealsClosedPeriod / totalLeads) * 100).toFixed(1) : '0'

  // ── Response time (bot vs manual) ──
  const botMessages = messages.filter(m => m.sent_by === 'bot').length
  const totalMessages = messages.length
  const botHandledPct = totalMessages > 0 ? Math.round((botMessages / totalMessages) * 100) : 0

  // ── Revenue / ROI ──
  const estCommission = closedWon.reduce((sum, l) => {
    if (l.intent === 'rent') return sum + AVG_RENTAL_COMMISSION
    const dealVal = l.budget_min ? (l.budget_min + (l.budget_max || l.budget_min)) / 2 : AVG_SALE_VALUE
    return sum + dealVal * AVG_SALE_COMMISSION_PCT
  }, 0)

  // Per-lead commission estimate, split by deal type (rent vs purchase)
  const leadCommission = (l: any) => {
    if (l.intent === 'rent') return AVG_RENTAL_COMMISSION
    const dealVal = l.budget_min ? (l.budget_min + (l.budget_max || l.budget_min)) / 2 : AVG_SALE_VALUE
    return dealVal * AVG_SALE_COMMISSION_PCT
  }

  const periodClosed = periodLeads.filter(l => l.status === 'closed_won')
  const periodCommission = periodClosed.reduce((sum, l) => sum + leadCommission(l), 0)

  // Earned split by type (closed deals in the period)
  const earnedRental = periodClosed.filter(l => l.intent === 'rent').reduce((s, l) => s + leadCommission(l), 0)
  const earnedPurchase = periodClosed.filter(l => l.intent !== 'rent').reduce((s, l) => s + leadCommission(l), 0)

  // Potential commission still in the pipeline (qualified → visit, not yet closed).
  // We never want to show a demoralizing ₹0 — this is the "money on the table" figure.
  const pipelineLeads = allLeads.filter(l => ['qualified', 'visit_booked', 'visit_done'].includes(l.status))
  const potentialRental = pipelineLeads.filter(l => l.intent === 'rent').reduce((s, l) => s + leadCommission(l), 0)
  const potentialPurchase = pipelineLeads.filter(l => l.intent !== 'rent').reduce((s, l) => s + leadCommission(l), 0)
  const potentialTotal = potentialRental + potentialPurchase

  const planCost = agent?.plan === 'annual' ? 799 : 999
  const roiMultiple = planCost > 0 ? Math.round(periodCommission / planCost) : 0
  const roiPct = planCost > 0 ? ((periodCommission - planCost) / planCost * 100).toFixed(0) : '0'

  // ── Lead leakage (leads that went cold or lost) ──
  const lostLeads = periodLeads.filter(l => l.status === 'closed_lost').length
  const coldLeadsCount = periodLeads.filter(l => l.temperature === 'cold').length
  const leakageCount = lostLeads + coldLeadsCount
  const leakagePct = totalLeads > 0 ? ((leakageCount / totalLeads) * 100).toFixed(0) : '0'

  // ── Growth vs previous period ──
  const leadGrowth = prevTotal > 0 ? (((totalLeads - prevTotal) / prevTotal) * 100).toFixed(0) : '0'

  // ── Daily leads chart data (last N days) ──
  const dailyMap: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]
    dailyMap[key] = 0
  }
  dailyLeads.forEach((l: any) => {
    const key = l.created_at.split('T')[0]
    if (dailyMap[key] !== undefined) dailyMap[key]++
  })
  const chartData = Object.entries(dailyMap).map(([date, count]) => ({
    date,
    label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    leads: count
  }))

  // ── Funnel stages ──
  const funnel = [
    { stage: 'Total Leads', count: totalLeads, pct: 100, color: '#6B7280' },
    { stage: 'Engaged', count: periodLeads.filter(l => l.ai_score > 0).length, pct: totalLeads > 0 ? Math.round(periodLeads.filter(l => l.ai_score > 0).length / totalLeads * 100) : 0, color: '#3B82F6' },
    { stage: 'Qualified', count: qualifiedLeads, pct: totalLeads > 0 ? Math.round(qualifiedLeads / totalLeads * 100) : 0, color: '#F59E0B' },
    { stage: 'Visit Booked', count: visitsBooked, pct: totalLeads > 0 ? Math.round(visitsBooked / totalLeads * 100) : 0, color: '#8B5CF6' },
    { stage: 'Deal Closed', count: dealsClosedPeriod, pct: totalLeads > 0 ? Math.round(dealsClosedPeriod / totalLeads * 100) : 0, color: '#10B981' },
  ]

  // ── Properties summary ──
  const activeProperties = properties.filter(p => p.status === 'active').length
  const soldProperties = properties.filter(p => p.status === 'sold' || p.status === 'rented').length

  // ── WA spend ──
  const waSpend = waTransactions.filter(t => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0)

  return NextResponse.json({
    period: days,
    agent: {
      name: agent?.name,
      agency: agent?.agency_name,
      plan: agent?.plan,
      planCost,
      messagesUsed: agent?.messages_used || 0,
      messagesLimit: agent?.messages_limit || 5000,
      waBalance: agent?.wa_balance || 0,
      botActive: agent?.bot_active
    },
    summary: {
      totalLeads, hotLeads, warmLeads, coldLeads,
      qualifiedLeads, visitsBooked, visitsDone,
      dealsClosedPeriod, totalDeals,
      leadGrowth, prevTotal
    },
    conversion: {
      leadToQualified, qualifiedToVisit, visitToDeal, overallConversion
    },
    roi: {
      periodCommission: Math.round(periodCommission),
      totalCommission: Math.round(estCommission),
      planCost, roiMultiple, roiPct,
      waSpend: Math.round(waSpend),
      earnedRental: Math.round(earnedRental),
      earnedPurchase: Math.round(earnedPurchase),
      potentialRental: Math.round(potentialRental),
      potentialPurchase: Math.round(potentialPurchase),
      potentialTotal: Math.round(potentialTotal)
    },
    bot: {
      botHandledPct, totalMessages, botMessages
    },
    leakage: {
      leakageCount, leakagePct, lostLeads, coldLeadsCount
    },
    properties: {
      active: activeProperties, sold: soldProperties, total: properties.length
    },
    charts: {
      daily: chartData,
      funnel
    },
    activity: activity.slice(0, 10),
    waTransactions: waTransactions.slice(0, 10)
  })
}
