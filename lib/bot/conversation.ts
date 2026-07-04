import { supabaseAdmin } from '../supabase'
import type { ChatEntry } from './types'
import { MAX_HISTORY } from './types'

export async function loadOrCreateLead(agentId: string, phone: string) {
  let { data: leadRaw } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .eq('phone', phone)
    .maybeSingle()

  if (!leadRaw) {
    const { data: newLead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        agent_id: agentId,
        phone,
        bot_stage: 'greeting',
        chat_history: [],
        language: null,
        source: 'whatsapp_inbound',
        last_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error || !newLead) {
      console.error('[ai-bot] could not create lead:', error)
      return null
    }
    leadRaw = newLead
  }

  return leadRaw as any
}

export function appendUserMessage(lead: any, message: string): ChatEntry[] {
  const history: ChatEntry[] = Array.isArray(lead.chat_history) ? lead.chat_history : []
  history.push({ role: 'user', text: message, ts: new Date().toISOString() })
  return history
}

export function buildConversationText(history: ChatEntry[]) {
  return history
    .slice(-MAX_HISTORY)
    .map(e => `${e.role === 'user' ? 'Customer' : 'Bot'}: ${e.text}`)
    .join('\n')
}

export async function saveLeadHistory(leadId: string, updates: Record<string, any>) {
  await supabaseAdmin.from('leads').update(updates).eq('id', leadId)
}

export async function saveOutboundMessages(rows: any[]) {
  if (rows.length === 0) return
  await supabaseAdmin.from('messages').insert(rows)
}

export function outboundMessageRow(args: {
  leadId: string
  agentId: string
  content: string
  waMessageId?: string | null
  sent: boolean
}) {
  return {
    lead_id: args.leadId,
    agent_id: args.agentId,
    direction: 'outbound',
    content: args.content,
    sent_by: 'bot',
    wa_message_id: args.waMessageId || null,
    status: args.sent ? 'sent' : 'failed',
  }
}
