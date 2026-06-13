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
// Give up on a step after this many failed sends so a permanently-bouncing
// address (e.g. a fake test signup) doesn't error on every 15-min cron tick.
const MAX_SEND_ATTEMPTS = 3
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Failure attempts are tracked in nurture_emails_sent as "<key>#failN" markers,
// kept out of the way of the plain "<key>" success markers. String parsing
// (not regex) to avoid backslash-escaping pitfalls in the digit class.
function failCount(sent: string[], key: string): number {
  const prefix = `${key}#fail`
  let max = 0
  for (const s of sent) {
    if (s.startsWith(prefix)) {
      const n = parseInt(s.slice(prefix.length), 10)
      if (!isNaN(n)) max = Math.max(max, n)
    }
  }
  return max
}

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
      // Skip silently if there's no usable email (fake/blank test signups) —
      // these are not errors, and attempting a send just bounces every run.
      if (!agent.created_at || !agent.email || !EMAIL_RE.test(String(agent.email).trim())) {
        result.skipped++
        continue
      }

      const daysSince = Math.floor((now - new Date(agent.created_at).getTime()) / (24 * 60 * 60 * 1000))
      const alreadySent: string[] = Array.isArray(agent.nurture_emails_sent) ? agent.nurture_emails_sent : []

      // Eligible = threshold crossed, still inside the catch-up window, not yet
      // sent, and not already given-up-on after MAX_SEND_ATTEMPTS failures.
      const step = NURTURE_SEQUENCE.find(
        (s) => daysSince >= s.day && daysSince < s.day + WINDOW_DAYS
          && !alreadySent.includes(s.key)
          && failCount(alreadySent, s.key) < MAX_SEND_ATTEMPTS
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

      // A send can either return {ok:false} or THROW (e.g. Resend rejects the
      // recipient). Treat both as the same recoverable failure so the bounded
      // retry below applies in either case (a throw used to hit the outer catch
      // and loop forever with no marker written).
      let sendResult: { ok: boolean }
      try {
        sendResult = await step.send(agent.email, agent.name, ctx)
      } catch (sendErr: any) {
        console.warn('[nurture] send threw for', step.key, agent.id, '-', sendErr?.message)
        sendResult = { ok: false }
      }

      if (sendResult.ok) {
        // Record success + clear any failure markers for this step.
        const cleaned = alreadySent.filter(s => !s.startsWith(`${step.key}#fail`))
        await supabaseAdmin
          .from('agents')
          .update({ nurture_emails_sent: [...cleaned, step.key] })
          .eq('id', agent.id)
        result.sent++
      } else {
        // Record a bounded failure marker so a bouncing address gives up after
        // MAX_SEND_ATTEMPTS instead of erroring on every run forever.
        const attempts = failCount(alreadySent, step.key) + 1
        const markers = alreadySent.filter(s => !s.startsWith(`${step.key}#fail`))
        await supabaseAdmin
          .from('agents')
          .update({ nurture_emails_sent: [...markers, `${step.key}#fail${attempts}`] })
          .eq('id', agent.id)
        if (attempts >= MAX_SEND_ATTEMPTS) {
          console.warn('[nurture] giving up on', step.key, 'for agent', agent.id, 'after', attempts, 'attempts')
          result.skipped++
        } else {
          result.errors++
        }
      }
    } catch (e: any) {
      console.error('[nurture] agent', agent?.id, 'error:', e?.message || e)
      result.errors++
    }
  }

  return result
}
