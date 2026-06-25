// ── Subscription entitlement gate ────────────────────────────────────────────
// Decides whether an agent's bot is allowed to respond right now. Reads the
// existing plan fields (set by signup + the Razorpay webhook). Free-forever tier
// = no time expiry, 100-message AI allowance (lib/planLimits); once that's used
// up an active paid subscription is required to keep replying.
//
// Design: a NULL plan_expires_at means "no gate" (grandfathered / internal/test
// agents) so we never break existing accounts — the gate only bites once an
// expiry is set (trial end or a paid period end).

export type Entitlement = { entitled: boolean; reason: string }

export function agentEntitlement(agent: any, now: number = Date.now()): Entitlement {
  if (!agent) return { entitled: false, reason: 'no_agent' }
  // Superadmin/manual pause — hard off.
  if (agent.bot_active === false) return { entitled: false, reason: 'bot_paused' }
  // Payment failed and retries exhausted.
  if (agent.plan_status === 'halted') return { entitled: false, reason: 'payment_failed' }
  // Trial or paid period has ended (cancelled agents keep access until this date).
  const expires = agent.plan_expires_at ? new Date(agent.plan_expires_at).getTime() : null
  if (expires !== null && expires < now) return { entitled: false, reason: 'expired' }
  // Message quota for the current period (trial = 500; reset by the Razorpay webhook on charge).
  const used = Number(agent.messages_used || 0)
  const limit = Number(agent.messages_limit || 0)
  if (limit > 0 && used >= limit) return { entitled: false, reason: 'quota_exceeded' }
  return { entitled: true, reason: agent.plan_status || 'active' }
}
