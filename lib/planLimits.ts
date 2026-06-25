// ── Free-forever plan limits ─────────────────────────────────────────────────
// The free tier is permanent (no time expiry) but capped to nudge upgrades:
// a small lead + property allowance, and a 100 AI-message allowance. Paid /
// legacy agents (any plan other than 'free') are uncapped — mirroring the
// entitlement design where only the new tier is gated, so existing accounts
// never suddenly hit a wall.

export const FREE_LEAD_CAP = 10
export const FREE_PROPERTY_CAP = 5
export const FREE_MESSAGE_LIMIT = 100

export function isFreePlan(agent: any): boolean {
  return (agent?.plan || '') === 'free'
}
