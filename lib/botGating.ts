// ─────────────────────────────────────────
// Bot gating — the single source of truth for "should the AI reply to this
// message?". Extracted as a PURE function so every scenario is unit-testable
// (this is what prevents silent "the bot stopped replying" bugs).
//
// Order of checks matters only for the returned reason; any block stops the bot.
// ─────────────────────────────────────────

export type BotGateInput = {
  bot_active?: boolean | null            // agent-level kill switch (sidebar toggle)
  messages_used?: number | null
  messages_limit?: number | null
  plan_status?: string | null           // active | trial | pending | cancelled | halted
  plan_expires_at?: string | null       // ISO date the plan is paid through
  lead_bot_paused?: boolean | null      // per-lead manual takeover (Inbox)
}

export type BotGateReason =
  | 'ok' | 'bot_paused' | 'limit_reached' | 'subscription_inactive' | 'manual_mode'

export type BotGateResult = { reply: boolean; reason: BotGateReason }

export function shouldBotReply(a: BotGateInput, now: number = Date.now()): BotGateResult {
  // 1. Agent turned the bot off entirely.
  if (a.bot_active === false) return { reply: false, reason: 'bot_paused' }

  // 2. Monthly message allowance exhausted.
  const used = a.messages_used ?? 0
  const limit = a.messages_limit ?? Infinity
  if (used >= limit) return { reply: false, reason: 'limit_reached' }

  // 3. Subscription lapsed. 'active' is never blocked (protects demo/comp/legacy).
  //    'trial' lapses like cancelled/pending once past the paid-through date.
  const planStatus = a.plan_status || 'active'
  const expired = a.plan_expires_at ? new Date(a.plan_expires_at).getTime() < now : false
  const lapsed = planStatus === 'halted'
    || ((planStatus === 'cancelled' || planStatus === 'pending' || planStatus === 'trial') && expired)
  if (lapsed) return { reply: false, reason: 'subscription_inactive' }

  // 4. A human has taken over THIS conversation.
  if (a.lead_bot_paused) return { reply: false, reason: 'manual_mode' }

  return { reply: true, reason: 'ok' }
}
