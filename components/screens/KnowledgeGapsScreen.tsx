'use client'
import { useEffect, useState } from 'react'

interface Props { agentId: string }

type Gap = {
  id: string
  question: string
  bot_reply: string | null
  answer: string | null
  status: 'pending' | 'answered' | 'dismissed'
  created_at: string
  answered_at: string | null
}

export default function KnowledgeGapsScreen({ agentId }: Props) {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/knowledge-gaps?agent_id=${agentId}`)
      .then(r => r.json())
      .then(d => { setGaps(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [agentId])

  const submit = async (id: string) => {
    const answer = (drafts[id] || '').trim()
    if (!answer) return
    setSavingId(id)
    await fetch('/api/knowledge-gaps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, answer }),
    })
    setSavingId(null)
    load()
  }

  const dismiss = async (id: string) => {
    setSavingId(id)
    await fetch('/api/knowledge-gaps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    })
    setSavingId(null)
    load()
  }

  if (loading) return <div style={{ padding: '24px 28px', color: '#9E9B92', fontSize: 13 }}>Loading...</div>

  const pending = gaps.filter(g => g.status === 'pending')
  const answered = gaps.filter(g => g.status === 'answered')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ marginBottom: 4, fontSize: 20, fontWeight: 600, color: '#15161B' }}>Train Your Bot</div>
      <div style={{ marginBottom: 24, fontSize: 13, color: '#6B6860' }}>
        When the bot can&apos;t answer a lead&apos;s question, it shows up here. Answer it once — every future lead gets the benefit.
      </div>

      <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Needs your answer ({pending.length})
      </div>
      {pending.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px', color: '#9E9B92', fontSize: 13, marginBottom: 28 }}>
          Nothing pending — the bot hasn&apos;t gotten stuck on anything lately.
        </div>
      )}
      {pending.map(g => (
        <div key={g.id} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 6 }}>{g.question}</div>
          {g.bot_reply && (
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 12 }}>Bot replied: &ldquo;{g.bot_reply}&rdquo;</div>
          )}
          <textarea
            value={drafts[g.id] ?? ''}
            onChange={e => setDrafts({ ...drafts, [g.id]: e.target.value })}
            placeholder="Type the correct answer..."
            rows={2}
            style={{ width: '100%', border: '1px solid rgba(26,25,22,0.12)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => submit(g.id)}
              disabled={savingId === g.id || !(drafts[g.id] || '').trim()}
              style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: savingId === g.id ? 0.6 : 1 }}>
              Save answer
            </button>
            <button
              onClick={() => dismiss(g.id)}
              disabled={savingId === g.id}
              style={{ background: 'transparent', color: '#9E9B92', border: '1px solid rgba(26,25,22,0.12)', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 28, marginBottom: 12, fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Your bot&apos;s FAQ ({answered.length})
      </div>
      {answered.length === 0 && (
        <div style={{ fontSize: 13, color: '#9E9B92' }}>Answered questions will appear here.</div>
      )}
      {answered.map(g => (
        <div key={g.id} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '14px 18px', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B', marginBottom: 4 }}>Q: {g.question}</div>
          <div style={{ fontSize: 13, color: '#3D3B34' }}>A: {g.answer}</div>
        </div>
      ))}
    </div>
  )
}
