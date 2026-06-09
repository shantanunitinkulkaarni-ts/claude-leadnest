/**
 * Lifecycle nurture email runner — called once/day by /api/cron.
 *
 * For each active agent, works out how many days since signup and sends any
 * eligible nurture step that hasn't been sent yet. Progress is tracked in
 * agents.nurture_emails_sent (text[]).
 *
 * Guardrails:
 *  - Only sends a step within a 3-day window after its `day` threshold, so an
 *    existing/old account never gets the whole sequence blasted at once.
 *  - At most ONE nurture email per agent per run (no inbox flooding).
 *  - Skips cancelled accounts.
 *  - Every failure is swallowed; one bad agent never stops the batch.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { NURTURE_SEQUENCE, NurtureContext } from '@/lib/email'

const WINDOW_DAYS = 3

export async function runNurtureEmails(): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 }

  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select('id, email, name, created_at, plan, plan_status, messages_used, nurture_emails_sent')
    .neq('plan_status', 'cancelled')

  if (error) {
    console.error('[nurture] failed to load agents:', error.message)
    return result
  }

  const now = Date.now()

  for (const agent of (agents || []) as any[]) {
    try {
      if (!agent.email || !agent.created_at) {
        result.skipped++
        continue
      }

      const daysSince = Math.floor((now - new Date(agent.created_at).getTime()) / (24 * 60 * 60 * 1000))
      const alreadySent: string[] = Array.isArray(agent.nurture_emails_sent) ? agent.nurture_emails_sent : []

      // Eligible = threshold crossed, still inside the catch-up window, not yet sent.
      const step = NURTURE_SEQUENCE.find(
        (s) => daysSince >= s.day && daysSince < s.day + WINDOW_DAYS && !alreadySent.includes(s.key)
      )

      if (!step) {
        result.skipped++
        continue
      }

      // Lead count for personalised stats (cheap head count).
      const { count: leadsCount } = await supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)

      const ctx: NurtureContext = {
        leadsCount: leadsCount || 0,
        messagesSent: agent.messages_used || 0,
        plan: agent.plan || 'monthly',
        planStatus: agent.plan_status || 'active',
      }

      const sendResult = await step.send(agent.email, agent.name, ctx)

      if (sendResult.ok) {
        await supabaseAdmin
          .from('agents')
          .update({ nurture_emails_sent: [...alreadySent, step.key] })
          .eq('id', agent.id)
        result.sent++
      } else {
        // Don't mark as sent — retry next run.
        result.errors++
      }
    } catch (e: any) {
      console.error('[nurture] agent', agent?.id, 'error:', e?.message || e)
      result.errors++
    }
  }

  return result
}
