export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'

const FREE_LIMITS = { leads: 10, properties: 5, aiMessages: 100 }

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function firstText(value: any, fallback = 'Unknown') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function shortPreview(value: any, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '...' : text
}

function normalizeMessage(value: any) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sameContent(a: any, b: any) {
  const left = normalizeMessage(a)
  const right = normalizeMessage(b)
  return left && left === right
}

function increment(map: Record<string, number>, key: string | null | undefined, by = 1) {
  if (!key) return
  map[key] = (map[key] || 0) + by
}

function groupRows<T extends Record<string, any>>(rows: T[], key: string) {
  const grouped: Record<string, T[]> = {}
  for (const row of rows) {
    const id = row[key]
    if (!id) continue
    if (!grouped[id]) grouped[id] = []
    grouped[id].push(row)
  }
  return grouped
}

export async function GET() {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error
  if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

  const todayIso = startOfToday().toISOString()
  const sevenDaysIso = daysAgo(7).toISOString()
  const nextSevenIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const [
      agentsRes,
      teamRes,
      leadsRes,
      messagesRes,
      propertiesRes,
      appointmentsRes,
      appointmentsCreatedRes,
      supportTicketsRes,
      supportChatsRes,
      knowledgeGapsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('agents')
        .select('id,created_at,email,name,phone,agency_name,city,state,bot_active,plan,plan_status,plan_expires_at,messages_used,messages_limit,wa_balance,wa_phone_number_id,wa_verified,razorpay_subscription_id')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('team_members')
        .select('agent_id,email,name,role,created_at')
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('leads')
        .select('id,agent_id,name,phone,status,temperature,ai_score,created_at,updated_at,last_message_at,bot_paused')
        .order('updated_at', { ascending: false })
        .limit(800),
      supabaseAdmin
        .from('messages')
        .select('id,agent_id,lead_id,direction,sent_by,status,delivery_status,delivery_error,created_at,content')
        .order('created_at', { ascending: false })
        .limit(1200),
      supabaseAdmin
        .from('properties')
        .select('id,agent_id,title,status,created_at,property_media,photos')
        .order('created_at', { ascending: false })
        .limit(800),
      supabaseAdmin
        .from('appointments')
        .select('id,agent_id,lead_id,property_id,scheduled_at,status,created_at,leads(name,phone),properties(title,location)')
        .gte('scheduled_at', todayIso)
        .lte('scheduled_at', nextSevenIso)
        .order('scheduled_at', { ascending: true })
        .limit(120),
      supabaseAdmin
        .from('appointments')
        .select('id,agent_id,created_at')
        .gte('created_at', sevenDaysIso)
        .order('created_at', { ascending: false })
        .limit(500),
      supabaseAdmin
        .from('support_tickets')
        .select('id,agent_id,email,name,subject,message,status,source,created_at')
        .order('created_at', { ascending: false })
        .limit(120),
      supabaseAdmin
        .from('support_chat_logs')
        .select('id,agent_id,user_message,assistant_reply,escalated,helpful,feedback_note,created_at')
        .order('created_at', { ascending: false })
        .limit(120),
      supabaseAdmin
        .from('knowledge_gaps')
        .select('id,agent_id,lead_id,question,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(120),
    ])

    for (const res of [agentsRes, teamRes, leadsRes, messagesRes, propertiesRes, appointmentsRes, appointmentsCreatedRes, supportTicketsRes, supportChatsRes, knowledgeGapsRes]) {
      if (res.error) throw res.error
    }

    const agents = agentsRes.data || []
    const teamByAgent = groupRows(teamRes.data || [], 'agent_id')
    const leads = leadsRes.data || []
    const messages = messagesRes.data || []
    const properties = propertiesRes.data || []
    const appointments = appointmentsRes.data || []
    const appointmentsCreated = appointmentsCreatedRes.data || []
    const supportTickets = supportTicketsRes.data || []
    const supportChats = supportChatsRes.data || []
    const knowledgeGaps = knowledgeGapsRes.data || []

    const todayMs = new Date(todayIso).getTime()
    const sevenMs = new Date(sevenDaysIso).getTime()
    const isToday = (row: any) => new Date(row.created_at).getTime() >= todayMs
    const isSeven = (row: any) => new Date(row.created_at).getTime() >= sevenMs
    const isFailedMessage = (m: any) => m.status === 'failed' || m.delivery_status === 'failed' || !!m.delivery_error

    const leadsByAgent = groupRows(leads, 'agent_id')
    const messagesByAgent = groupRows(messages, 'agent_id')
    const propertiesByAgent = groupRows(properties, 'agent_id')
    const appointmentsByAgent = groupRows(appointments, 'agent_id')
    const supportTicketsByAgent = groupRows(supportTickets, 'agent_id')
    const supportChatsByAgent = groupRows(supportChats, 'agent_id')
    const gapsByAgent = groupRows(knowledgeGaps, 'agent_id')

    const failedByAgent: Record<string, number> = {}
    const supportByAgent: Record<string, number> = {}
    const openTickets = supportTickets.filter((t: any) => (t.status || 'open') === 'open')
    for (const msg of messages.filter(isFailedMessage)) increment(failedByAgent, msg.agent_id)
    for (const ticket of openTickets) increment(supportByAgent, ticket.agent_id)
    for (const chat of supportChats.filter((c: any) => c.escalated || c.helpful === false)) increment(supportByAgent, chat.agent_id)

    const agentRows = agents.map((agent: any) => {
      const agentLeads = leadsByAgent[agent.id] || []
      const agentMessages = messagesByAgent[agent.id] || []
      const agentProperties = propertiesByAgent[agent.id] || []
      const agentAppointments = appointmentsByAgent[agent.id] || []
      const activeProps = agentProperties.filter((p: any) => (p.status || 'active') === 'active')
      const botMessages = agentMessages.filter((m: any) => m.sent_by === 'bot' && m.direction === 'outbound')
      const inbound = agentMessages.find((m: any) => m.direction === 'inbound')
      const botReply = agentMessages.find((m: any) => m.sent_by === 'bot' && m.direction === 'outbound')
      const sevenActivity = agentLeads.some(isSeven) || agentMessages.some(isSeven) || agentAppointments.some(isSeven)
      const whatsappConnected = !!agent.wa_phone_number_id
      const leadCount = agentLeads.length
      const propertyCount = activeProps.length
      const aiMessageCount = Number(agent.messages_used || botMessages.length || 0)
      const failedCount = failedByAgent[agent.id] || 0
      const supportCount = supportByAgent[agent.id] || 0
      const botPausedCount = agentLeads.filter((l: any) => l.bot_paused).length
      const overLimit = leadCount > FREE_LIMITS.leads || propertyCount > FREE_LIMITS.properties || aiMessageCount > FREE_LIMITS.aiMessages
      const supportClicks = (supportTicketsByAgent[agent.id] || []).length + (supportChatsByAgent[agent.id] || []).length
      const lastActivityCandidates = [
        agent.created_at,
        inbound?.created_at,
        botReply?.created_at,
        (supportTicketsByAgent[agent.id] || [])[0]?.created_at,
        (supportChatsByAgent[agent.id] || [])[0]?.created_at,
        agentLeads[0]?.updated_at || agentLeads[0]?.created_at,
        agentAppointments[0]?.created_at || agentAppointments[0]?.scheduled_at,
      ].filter(Boolean)
      const lastActivity = lastActivityCandidates.length
        ? lastActivityCandidates.reduce((latest: string, current: string) => (
            new Date(current).getTime() > new Date(latest).getTime() ? current : latest
          ))
        : null

      let readiness: 'ready' | 'needs_setup' | 'attention' | 'inactive' = 'ready'
      if (!sevenActivity) readiness = 'inactive'
      if (!whatsappConnected || propertyCount === 0 || agent.bot_active === false) readiness = 'needs_setup'
      if (failedCount > 0 || supportCount > 0 || botPausedCount > 0 || overLimit) readiness = 'attention'

      const owner = (teamByAgent[agent.id] || []).find((m: any) => m.role === 'owner') || (teamByAgent[agent.id] || [])[0]
      const recentConversation = agentMessages
        .slice(0, 12)
        .reverse()
        .map((m: any) => ({
          id: m.id,
          at: m.created_at,
          direction: m.direction,
          sent_by: m.sent_by || 'unknown',
          status: m.status || '',
          delivery_status: m.delivery_status || '',
          content: shortPreview(m.content, 180),
        }))

      const conversationFlags: Array<{ kind: string; at: string | null; preview: string; detail: string }> = []
      for (let i = 1; i < recentConversation.length; i++) {
        const prev = recentConversation[i - 1] as any
        const curr = recentConversation[i] as any
        if (sameContent(prev.content, curr.content)) {
          conversationFlags.push({
            kind: 'duplicate_message',
            at: curr.at,
            preview: curr.content,
            detail: 'Same message repeated back-to-back in the recent conversation window.',
          })
        }
        if (prev.sent_by === curr.sent_by && curr.sent_by === 'bot') {
          conversationFlags.push({
            kind: 'back_to_back_bot',
            at: curr.at,
            preview: curr.content,
            detail: 'Bot sent consecutive outbound messages without an intervening inbound reply.',
          })
        }
      }
      for (const msg of recentConversation) {
        if ((msg as any).status === 'failed' || (msg as any).delivery_status === 'failed') {
          conversationFlags.push({
            kind: 'failed_message',
            at: (msg as any).at,
            preview: (msg as any).content,
            detail: 'Message delivery failed in the stored conversation history.',
          })
        }
      }
      const recentLeads = agentLeads.slice(0, 5).map((lead: any) => ({
        id: lead.id,
        name: firstText(lead.name, 'Unknown lead'),
        phone: lead.phone || '',
        status: lead.status || 'new',
        temperature: lead.temperature || 'new',
        ai_score: lead.ai_score || 0,
        last_message_at: lead.last_message_at,
        bot_paused: !!lead.bot_paused,
      }))

      return {
        id: agent.id,
        agency_name: firstText(agent.agency_name, 'Unnamed agency'),
        owner_name: firstText(owner?.name || agent.name, 'Unknown owner'),
        owner_email: firstText(owner?.email || agent.email, ''),
        city: agent.city || '',
        state: agent.state || '',
        created_at: agent.created_at,
        bot_active: agent.bot_active !== false,
        whatsapp_connected: whatsappConnected,
        whatsapp_label: agent.wa_phone_number_id || '',
        plan_status: agent.plan_status || 'free',
        plan: agent.plan || 'free',
        subscription_active: !!agent.razorpay_subscription_id && agent.plan_status === 'active',
        wa_balance: Number(agent.wa_balance || 0),
        last_activity_at: lastActivity,
        last_inbound_at: inbound?.created_at || null,
        last_bot_reply_at: botReply?.created_at || null,
        readiness,
        counts: {
          leads: leadCount,
          active_properties: propertyCount,
          ai_messages: aiMessageCount,
          failed_sends: failedCount,
          open_support: supportCount,
          bot_paused_leads: botPausedCount,
          upcoming_visits: agentAppointments.length,
          pending_gaps: (gapsByAgent[agent.id] || []).length,
          support_clicks: supportClicks,
        },
        usage: {
          leads: { used: leadCount, limit: FREE_LIMITS.leads },
          properties: { used: propertyCount, limit: FREE_LIMITS.properties },
          aiMessages: { used: aiMessageCount, limit: FREE_LIMITS.aiMessages },
        },
        recent_leads: recentLeads,
        recent_failures: (messagesByAgent[agent.id] || []).filter(isFailedMessage).slice(0, 5).map((m: any) => ({
          id: m.id,
          at: m.created_at,
          reason: shortPreview(m.delivery_error || m.delivery_status || m.status || 'failed', 90),
          preview: shortPreview(m.content, 90),
        })),
        upcoming_visits: agentAppointments.slice(0, 5).map((a: any) => ({
          id: a.id,
          scheduled_at: a.scheduled_at,
          status: a.status || 'upcoming',
          lead_name: a.leads?.name || a.leads?.phone || 'Unknown lead',
          property_title: a.properties?.title || 'Property not linked',
        })),
        support_items: [
          ...(supportTicketsByAgent[agent.id] || []).slice(0, 3).map((t: any) => ({
            id: t.id,
            kind: 'ticket',
            at: t.created_at,
            title: shortPreview(t.subject, 80),
            preview: shortPreview(t.message, 110),
          })),
          ...(supportChatsByAgent[agent.id] || []).filter((c: any) => c.escalated || c.helpful === false).slice(0, 3).map((c: any) => ({
            id: c.id,
            kind: c.helpful === false ? 'negative_feedback' : 'chat_escalation',
            at: c.created_at,
            title: c.helpful === false ? 'Negative support feedback' : 'Support chat escalated',
            preview: shortPreview(c.user_message || c.feedback_note, 110),
          })),
        ].slice(0, 5),
        recent_conversation: recentConversation,
        conversation_flags: conversationFlags.slice(0, 10),
        readiness_checks: {
          whatsapp: whatsappConnected,
          whatsapp_source: agent.wa_phone_number_id ? 'wa_phone_number_id' : '',
          botActive: agent.bot_active !== false,
          hasProperty: propertyCount > 0,
          underLeadLimit: leadCount <= FREE_LIMITS.leads,
          underPropertyLimit: propertyCount <= FREE_LIMITS.properties,
          underAiLimit: aiMessageCount <= FREE_LIMITS.aiMessages,
          noRecentFailures: failedCount === 0,
          noOpenSupport: supportCount === 0,
        },
      }
    })

    const response = {
      generated_at: new Date().toISOString(),
      free_limits: FREE_LIMITS,
      summary: {
        accounts: {
          total: agentRows.length,
          free: agentRows.filter((a: any) => !a.subscription_active).length,
          paid: agentRows.filter((a: any) => a.subscription_active).length,
          active: agentRows.filter((a: any) => a.bot_active).length,
          inactive: agentRows.filter((a: any) => !a.bot_active).length,
          connected: agentRows.filter((a: any) => a.whatsapp_connected).length,
          with_balance: agentRows.filter((a: any) => Number(a.wa_balance || 0) > 0).length,
          support_clicks: agentRows.reduce((sum: number, a: any) => sum + Number(a.counts.support_clicks || 0), 0),
          last_activity: agentRows
            .map((a: any) => a.last_activity_at)
            .filter(Boolean)
            .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null,
        },
        today: {
          signups: agents.filter(isToday).length,
          inbound_leads: leads.filter(isToday).length,
          bot_replies: messages.filter((m: any) => isToday(m) && m.sent_by === 'bot' && m.direction === 'outbound').length,
          visits_booked: appointmentsCreated.filter(isToday).length,
          failed_sends: messages.filter((m: any) => isToday(m) && isFailedMessage(m)).length,
          support_issues: supportTickets.filter(isToday).length + supportChats.filter((c: any) => isToday(c) && (c.escalated || c.helpful === false)).length,
        },
        seven_days: {
          inbound_leads: leads.filter(isSeven).length,
          bot_messages: messages.filter((m: any) => isSeven(m) && m.sent_by === 'bot' && m.direction === 'outbound').length,
          visits_booked: appointmentsCreated.filter(isSeven).length,
          failed_messages: messages.filter((m: any) => isSeven(m) && isFailedMessage(m)).length,
          support_issues: supportTickets.filter(isSeven).length + supportChats.filter((c: any) => isSeven(c) && (c.escalated || c.helpful === false)).length,
          active_agents: agentRows.filter((a: any) => {
            const last = a.last_inbound_at || a.last_bot_reply_at
            return last ? new Date(last).getTime() >= sevenMs : false
          }).length,
        },
        agents: {
          total: agentRows.length,
          ready: agentRows.filter((a: any) => a.readiness === 'ready').length,
          needs_setup: agentRows.filter((a: any) => a.readiness === 'needs_setup').length,
          attention: agentRows.filter((a: any) => a.readiness === 'attention').length,
          inactive: agentRows.filter((a: any) => a.readiness === 'inactive').length,
        },
      },
      agents: agentRows,
      attention: {
        failed_messages: messages.filter(isFailedMessage).slice(0, 10).map((m: any) => ({
          id: m.id,
          agent_id: m.agent_id,
          at: m.created_at,
          reason: shortPreview(m.delivery_error || m.delivery_status || m.status || 'failed', 100),
          preview: shortPreview(m.content, 100),
        })),
        support_tickets: openTickets.slice(0, 10).map((t: any) => ({
          id: t.id,
          agent_id: t.agent_id,
          at: t.created_at,
          subject: shortPreview(t.subject, 90),
          preview: shortPreview(t.message, 100),
        })),
        support_chats: supportChats.filter((c: any) => c.escalated || c.helpful === false).slice(0, 10).map((c: any) => ({
          id: c.id,
          agent_id: c.agent_id,
          at: c.created_at,
          kind: c.helpful === false ? 'negative_feedback' : 'escalated',
          preview: shortPreview(c.user_message || c.feedback_note, 100),
        })),
        knowledge_gaps: knowledgeGaps.slice(0, 10).map((g: any) => ({
          id: g.id,
          agent_id: g.agent_id,
          at: g.created_at,
          question: shortPreview(g.question, 120),
        })),
        bot_paused_leads: leads.filter((l: any) => l.bot_paused).slice(0, 10).map((l: any) => ({
          id: l.id,
          agent_id: l.agent_id,
          name: firstText(l.name, 'Unknown lead'),
          phone: l.phone || '',
          status: l.status || 'new',
        })),
      },
      upcoming_visits: appointments.slice(0, 15).map((a: any) => ({
        id: a.id,
        agent_id: a.agent_id,
        scheduled_at: a.scheduled_at,
        status: a.status || 'upcoming',
        lead_name: a.leads?.name || a.leads?.phone || 'Unknown lead',
        property_title: a.properties?.title || 'Property not linked',
        property_location: a.properties?.location || '',
      })),
    }

    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not load operations panel' }, { status: 500 })
  }
}
