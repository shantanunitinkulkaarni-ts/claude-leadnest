export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'

// ─── Train-the-bot data export (THE MOAT) ────────────────────────────────────
// Exports an agency's accumulated "bot couldn't answer → human answered" Q&A as
// structured, RAG-ready data. This is the proprietary asset: the longer an agency
// runs, the richer its corpus, the harder it is to switch away. Designed so a
// future automated model can ingest it and answer new gaps on its own.
//
//   GET /api/admin/training-export?agent_id=...          → JSON corpus
//   GET /api/admin/training-export?agent_id=...&format=md → Markdown (RAG doc)
//
// Superadmin or CRON gated. Read-only.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  const agentId = request.nextUrl.searchParams.get('agent_id')
  const format = request.nextUrl.searchParams.get('format')
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  const { data: agent } = await supabaseAdmin.from('agents').select('id, agency_name, name').eq('id', agentId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 })

  // Answered gaps = the trained corpus. Pending = what still needs answering.
  const { data: gaps } = await supabaseAdmin
    .from('knowledge_gaps')
    .select('question, answer, bot_reply, status, created_at, answered_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })

  const answered = (gaps || []).filter(g => g.status === 'answered' && g.answer)
    .map(g => ({ question: g.question, answer: g.answer, answered_at: g.answered_at }))
  const pending = (gaps || []).filter(g => g.status === 'pending')
    .map(g => ({ question: g.question, bot_reply: g.bot_reply, created_at: g.created_at }))

  // Unanswered "bot couldn't answer" events (with AI summaries) — extra training signal.
  const { data: fallbacks } = await supabaseAdmin
    .from('activity_log')
    .select('description, metadata, created_at')
    .eq('agent_id', agentId)
    .eq('type', 'bot_fallback')
    .order('created_at', { ascending: false })
    .limit(200)

  const corpus = {
    agency: agent.agency_name || agent.name || agent.id,
    agent_id: agent.id,
    generated_at: new Date().toISOString(),
    counts: { answered: answered.length, pending: pending.length, fallback_events: (fallbacks || []).length },
    answered,
    pending,
    fallback_events: (fallbacks || []).map((f: any) => ({
      question: f.metadata?.question || f.description,
      reason: f.metadata?.reason,
      ai_summary: f.metadata?.ai_summary,
      at: f.created_at,
    })),
  }

  if (format === 'md') {
    const lines: string[] = []
    lines.push(`# TING training corpus — ${corpus.agency}`)
    lines.push(`_Generated ${corpus.generated_at} · ${answered.length} answered, ${pending.length} pending_`, '')
    lines.push('## Confirmed answers (use these to answer leads)')
    for (const a of answered) lines.push(`\n**Q:** ${a.question}\n\n**A:** ${a.answer}`)
    if (pending.length) {
      lines.push('', '## Open questions (need an answer)')
      for (const p of pending) lines.push(`- ${p.question}`)
    }
    return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
  }

  return NextResponse.json(corpus)
}
