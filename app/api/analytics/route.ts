export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  // Run all queries in parallel
  const [leadsRes, messagesRes, appointmentsRes, agentRes] = await Promise.all([
    supabaseAdmin.from('leads').select('temperature, status, source, created_at').eq('agent_id', agentId),
    supabaseAdmin.from('messages').select('direction, sent_by, created_at').eq('agent_id', agentId),
    supabaseAdmin.from('appointments').select('status, created_at').eq('agent_id', agentId),
    supabaseAdmin.from('agents').select('messages_used, messages_limit, wa_balance').eq('id', agentId).single()
  ])

  const leads = leadsRes.data || []
  const messages = messagesRes.data || []
  const appointments = appointmentsRes.data || []
  const agent = agentRes.data

  // Compute stats
  const totalLeads = leads.length
  const hotLeads = leads.filter(l => l.temperature === 'hot').length
  const warmLeads = leads.filter(l => l.temperature === 'warm').length
  const coldLeads = leads.filter(l => l.temperature === 'cold').length
  const botMessages = messages.filter(m => m.sent_by === 'bot').length
  const totalMessages = messages.length
  const botHandled = totalMessages > 0 ? Math.round((botMessages / totalMessages) * 100) : 0
  const visitsBooked = appointments.length
  const closedWon = leads.filter(l => l.status === 'closed_won').length
  const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : '0'

  return NextResponse.json({
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    botHandled,
    visitsBooked,
    closedWon,
    conversionRate,
    messagesUsed: agent?.messages_used || 0,
    messagesLimit: agent?.messages_limit || 5000,
    waBalance: agent?.wa_balance || 0
  })
}
