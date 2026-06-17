import { supabaseAdmin } from './supabase'

// How the bot's own deferral ("let me check and get back to you") becomes a
// trainable FAQ entry: the webhook detects the deferral (detectReplyKnowledgeGap
// in lib/intentSignals.ts) and calls recordKnowledgeGap with the lead's
// question. The agent answers it once in the dashboard; every future prompt
// for that agent (any lead) gets the answer injected via
// formatKnowledgeGapsForPrompt, so the bot doesn't defer on the same question twice.

export function formatKnowledgeGapsForPrompt(gaps: { question: string; answer: string }[]): string {
  if (!gaps || gaps.length === 0) return ''
  const lines = gaps.map(g => `Q: ${g.question}\nA: ${g.answer}`).join('\n\n')
  return `\nAGENT-PROVIDED ANSWERS (facts your agency confirmed for past questions the bot couldn't answer — use them when relevant, don't quote verbatim):\n${lines}\n`
}

export async function recordKnowledgeGap(agentId: string, leadId: string, question: string, botReply: string): Promise<void> {
  const trimmed = (question || '').trim()
  if (!trimmed) return

  // Dedupe: don't pile up duplicate pending tasks for the same question.
  const { data: existing } = await supabaseAdmin
    .from('knowledge_gaps')
    .select('id')
    .eq('agent_id', agentId)
    .eq('status', 'pending')
    .ilike('question', trimmed)
    .limit(1)
  if (existing && existing.length > 0) return

  await supabaseAdmin.from('knowledge_gaps').insert({
    agent_id: agentId,
    lead_id: leadId,
    question: trimmed,
    bot_reply: botReply || null,
    status: 'pending',
  })
}
