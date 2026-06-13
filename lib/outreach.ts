// ─── Post-24h template re-engagement: the decision engine ────────────────────
// Decides, for a quiet lead whose free 24h window has CLOSED, whether *now* is
// a good moment to spend one paid Marketing-template touch. Context-driven, not
// fixed intervals: a decaying cadence, scaled by lead value and timed for when
// real-estate leads actually act (daytime; weekends for visit-minded leads).
//
// The approved template text is fixed by Meta; the "intelligence" is WHEN to
// send, HOW OFTEN (by agent intensity), and the variable values we fill in.

export type OutreachIntensity = 'gentle' | 'balanced' | 'persistent'

type IntensityCfg = { maxTouches: number; baseGapDays: number; growth: number }

// gap before touch N ≈ baseGapDays * growth^N → gaps GROW each time (decaying cadence).
const INTENSITY: Record<OutreachIntensity, IntensityCfg> = {
  gentle: { maxTouches: 3, baseGapDays: 3.0, growth: 2.0 }, // ~2 weeks then stop
  balanced: { maxTouches: 5, baseGapDays: 2.0, growth: 1.8 }, // ~3–4 weeks
  persistent: { maxTouches: 8, baseGapDays: 1.5, growth: 1.6 }, // ~2 months
}

const MS_DAY = 24 * 60 * 60 * 1000

export type OutreachDecision =
  | { send: false; dormant?: boolean; reason: string }
  | { send: true; reason: string }

// Hot leads are chased sooner/closer; cold ones get longer gaps.
function valueMultiplier(lead: any): number {
  const t = lead.temperature
  if (t === 'hot' || (lead.ai_score || 0) >= 8) return 0.6
  if (t === 'warm' || (lead.ai_score || 0) >= 4) return 0.85
  if (t === 'cold') return 1.6
  return 1.0 // 'new'/unknown
}

// Daytime only, and weekend-aware for visit-minded leads. `nowMs` is epoch ms;
// we compute the wall clock in IST.
function isGoodTime(nowMs: number, lead: any): boolean {
  const ist = new Date(nowMs + 5.5 * 60 * 60 * 1000)
  const hour = ist.getUTCHours() // already shifted to IST
  const dow = ist.getUTCDay() // 0=Sun … 6=Sat
  // Never at night. Two natural check-phone windows: late morning, early evening.
  const goodHour = (hour >= 10 && hour < 13) || (hour >= 16 && hour < 20)
  if (!goodHour) return false
  // Visit-minded leads convert around weekends → prefer Wed(3)–Sat(6); avoid Mon(1).
  const visitMinded = lead.status === 'qualified' || lead.status === 'visit_booked' || (lead.ai_score || 0) >= 6
  if (visitMinded && dow === 1) return false // skip Monday for these
  return true
}

export function decideOutreach(
  lead: any,
  agent: any,
  nowMs: number
): OutreachDecision {
  const intensity: OutreachIntensity =
    (['gentle', 'balanced', 'persistent'].includes(agent?.outreach_intensity) ? agent.outreach_intensity : 'persistent')
  const cfg = INTENSITY[intensity]

  const touches = lead.template_touches || 0
  if (touches >= cfg.maxTouches) return { send: false, dormant: true, reason: 'max_touches_reached' }

  // Anchor the gap on the last outbound touch, or the last time they spoke to us.
  const anchor = lead.last_template_at ? new Date(lead.last_template_at).getTime()
    : lead.last_message_at ? new Date(lead.last_message_at).getTime()
    : (lead.created_at ? new Date(lead.created_at).getTime() : nowMs)
  const daysSince = (nowMs - anchor) / MS_DAY

  const requiredGap = cfg.baseGapDays * Math.pow(cfg.growth, touches) * valueMultiplier(lead)
  if (daysSince < requiredGap) return { send: false, reason: `gap_not_reached(${daysSince.toFixed(1)}/${requiredGap.toFixed(1)}d)` }

  if (!isGoodTime(nowMs, lead)) return { send: false, reason: 'outside_send_window' }

  return { send: true, reason: `touch_${touches + 1}_${intensity}` }
}

// ─── Approved template suite (see TEMPLATE_SUITE.md) ─────────────────────────
// Names + which languages are APPROVED. Update `approvedLangs` as MSG91 clears
// each. The cron only sends templates listed here as approved.
export const TEMPLATES = {
  lead_new_match: { name: 'lead_new_match', approvedLangs: ['en', 'hi', 'mr'] as string[] },
  lead_visit_invite: { name: 'lead_visit_invite', approvedLangs: ['en'] as string[] },
  lead_final_touch: { name: 'lead_final_touch', approvedLangs: ['en'] as string[] },
  // visit_reminder (Utility, en) is sent from the appointment-reminder path.
}

// Body text of each approved template (must match what was approved in MSG91),
// used to render the REAL message for the agent's Inbox — so they see exactly
// what the lead received, not a placeholder.
const TEMPLATE_BODIES: Record<string, Record<string, string>> = {
  lead_new_match: {
    en: "Hi {{customer_name}}, it's {{agency_name}}. A property matching your search just came up in {{area}} - a {{property_type}} within your budget. Would you like me to share the details?",
    hi: 'नमस्ते {{customer_name}}, {{agency_name}} की ओर से। {{area}} में आपकी पसंद से मिलती-जुलती एक नई प्रॉपर्टी उपलब्ध हुई है - आपके बजट में {{property_type}}। क्या मैं आपको इसकी जानकारी भेजूँ?',
    mr: 'नमस्कार {{customer_name}}, {{agency_name}} कडून. {{area}} मध्ये तुमच्या आवडीशी जुळणारी एक नवीन प्रॉपर्टी उपलब्ध झाली आहे - तुमच्या बजेटमध्ये {{property_type}}. मी तुम्हाला त्याची माहिती पाठवू का?',
  },
  lead_visit_invite: {
    en: "Hi {{customer_name}}, it's {{agency_name}}. Would you like to see {{property}} in person? I can arrange a quick site visit this week at a time that suits you - morning or evening.",
  },
  lead_final_touch: {
    en: "Hi {{customer_name}}, it's {{agency_name}}. I don't want to crowd your inbox, so I'll ease off for now. Whenever you'd like to pick your home search in {{area}} back up, I'm just one message away. Shall I keep you posted on new options?",
  },
  visit_reminder: {
    en: 'Hi {{customer_name}}, a reminder from {{agency_name}} about your site visit:\nProperty: {{property}}\nWhen: {{visit_date}} at {{visit_time}}\nReply here if you\'d like to reschedule - see you soon!',
  },
}

// Fill a template's body with the {name,value} pairs → the actual sent message.
export function renderTemplate(name: string, language: string, values: { name: string; value: string }[]): string {
  let body = TEMPLATE_BODIES[name]?.[language] || TEMPLATE_BODIES[name]?.en || ''
  for (const v of values) body = body.split(`{{${v.name}}}`).join(v.value)
  return body || `[${name}]`
}

function firstName(lead: any): string {
  return (lead.name || '').trim().split(/\s+/)[0] || 'there'
}
function leadArea(lead: any, agent: any): string {
  return (Array.isArray(lead.preferred_areas) && lead.preferred_areas[0])
    || (Array.isArray(agent?.areas) && agent.areas[0]) || 'your area'
}
function propertyType(lead: any): string {
  const intent = lead.intent === 'rent' ? 'rental' : 'home'
  return lead.property_category ? `${lead.property_category}` : intent
}

// Pick WHICH approved template fits this lead's state, the language version,
// and the body variable values IN ORDER. Returns null if nothing approved.
// MSG91 maps values positionally (body_1, body_2, …) → they MUST be in the same
// order the variables appear in the template body. `lang` = 'en' | 'hi' | 'mr'.
export function pickTemplate(
  lead: any, agent: any, lang: string
): { name: string; language: string; values: { name: string; value: string }[] } | null {
  const agency = agent?.agency_name || 'your property advisor'
  const isLastTouch = (lead.template_touches || 0) >= 2 // graceful sign-off on later touches
  const qualified = lead.status === 'qualified' || (lead.ai_score || 0) >= 6

  let key: keyof typeof TEMPLATES
  let values: { name: string; value: string }[]
  if (isLastTouch) {
    key = 'lead_final_touch'
    values = [
      { name: 'customer_name', value: firstName(lead) },
      { name: 'agency_name', value: agency },
      { name: 'area', value: leadArea(lead, agent) },
    ]
  } else if (qualified) {
    key = 'lead_visit_invite'
    values = [
      { name: 'customer_name', value: firstName(lead) },
      { name: 'agency_name', value: agency },
      { name: 'property', value: `a ${propertyType(lead)} in ${leadArea(lead, agent)}` },
    ]
  } else {
    key = 'lead_new_match'
    values = [
      { name: 'customer_name', value: firstName(lead) },
      { name: 'agency_name', value: agency },
      { name: 'area', value: leadArea(lead, agent) },
      { name: 'property_type', value: propertyType(lead) },
    ]
  }

  const cfg = TEMPLATES[key]
  // Fall back to English if the chosen language variant isn't approved yet.
  const language = cfg.approvedLangs.includes(lang) ? lang : 'en'
  if (!cfg.approvedLangs.includes(language)) return null // not even English approved → skip
  return { name: cfg.name, language, values }
}
