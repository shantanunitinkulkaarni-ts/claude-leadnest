// ─────────────────────────────────────────────────────────────────────────────
// BOT ORCHESTRATOR  (code-first decision layer)
// ─────────────────────────────────────────────────────────────────────────────
// Given the AI's decoded intent + the lead's known criteria + the agent's real
// inventory, CODE decides what to do — present exact properties, say "no match"
// + card, ask a qualifying question, hand to a human, or (for flows not yet
// migrated: booking/objection) fall back to the legacy AI engine. The AI never
// decides here and never types a property fact.
//
// decideBotAction + mergeCriteria are PURE and unit-tested. runCodeFirstBot does
// the DB I/O around them and is wired into the webhook behind the BOT_V2 flag.

import { supabaseAdmin } from './supabase'
import { extractIntent, type ExtractedIntent } from './intentExtractor'
import { filterPropertiesForLead, rankPropertiesForLead, getNearbyProperties } from './propertyMatcher'
import { presentProperties, noMatchText, nearbyIntro } from './propertyPresenter'
import { buildAgentContactCard } from './fallbackCard'

export type Criteria = {
  intent: 'buy' | 'rent' | null
  preferred_areas: string[]
  budget_min: number | null
  budget_max: number | null
  bhk: string | null
  property_category: string | null
}

export type BotAction =
  | { kind: 'human' }
  | { kind: 'fallback'; reason: string }            // defer to legacy AI engine
  | { kind: 'qualify'; ask: 'intent' | 'area'; text: string }
  | { kind: 'present'; properties: any[] }          // ranked best-first
  | { kind: 'no_match' }

export const QUALIFY_INTENT = "Hi! I'd be happy to help with your property search. Are you looking to buy or to rent?"
export const QUALIFY_AREA = 'Got it. Which area or locality are you interested in?'

// Lead's stored criteria overlaid with freshly extracted intent (new info wins).
export function mergeCriteria(lead: any, intent: ExtractedIntent): Criteria {
  return {
    intent: intent.intent || lead?.intent || null,
    preferred_areas: intent.areas && intent.areas.length ? intent.areas : (lead?.preferred_areas || []),
    budget_min: intent.budget_min ?? lead?.budget_min ?? null,
    budget_max: intent.budget_max ?? lead?.budget_max ?? null,
    bhk: intent.bhk || null,
    property_category: intent.property_category || lead?.property_category || null,
  }
}

// THE decision. Pure: no DB, no AI, no clock.
export function decideBotAction(intent: ExtractedIntent, criteria: Criteria, properties: any[]): BotAction {
  // Explicit human request → hand off (card + alert handled by the runner).
  if (intent.message_type === 'wants_human') return { kind: 'human' }
  // Flows not yet migrated to code-first — defer to the legacy engine for now.
  if (intent.message_type === 'booking_request') return { kind: 'fallback', reason: 'booking' }
  if (intent.message_type === 'objection') return { kind: 'fallback', reason: 'objection' }

  // Can't match honestly without buy/rent + an area — ask for the missing one.
  if (!criteria.intent) return { kind: 'qualify', ask: 'intent', text: QUALIFY_INTENT }
  if (!criteria.preferred_areas || criteria.preferred_areas.length === 0) {
    return { kind: 'qualify', ask: 'area', text: QUALIFY_AREA }
  }

  // Have enough → match (code), rank (code). Present exact blocks or say no match.
  const filtered = filterPropertiesForLead(properties, criteria)
  if (!filtered.length) return { kind: 'no_match' }
  return { kind: 'present', properties: rankPropertiesForLead(filtered, criteria) }
}

// ── Runner: DB I/O around the pure decision (wired into the webhook, BOT_V2) ──
export type CodeFirstResult =
  | { handled: false }
  | {
      handled: true
      reply: string
      photos: string[]
      matchedPropertyId: string | null
      action: string
      overflow: boolean
      humanRequested: boolean
    }

export async function runCodeFirstBot(agentId: string, leadId: string, message: string): Promise<CodeFirstResult> {
  const [agentRes, leadRes, propsRes, msgsRes] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
    supabaseAdmin.from('messages').select('direction, content').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(8),
  ])
  const agent: any = agentRes.data
  const lead: any = leadRes.data
  if (!agent || !lead) return { handled: false }
  const properties = propsRes.data || []
  const recent = (msgsRes.data || []).reverse().map((m: any) => ({
    role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content || '',
  }))

  const intent = await extractIntent(message, {
    recent,
    known: { intent: lead.intent, areas: lead.preferred_areas || [], budget_max: lead.budget_max },
  })
  const criteria = mergeCriteria(lead, intent)

  // Persist newly learned criteria (best-effort; only set what we now know).
  const upd: any = {}
  if (criteria.intent) upd.intent = criteria.intent
  if (criteria.preferred_areas?.length) upd.preferred_areas = criteria.preferred_areas
  if (criteria.budget_max) upd.budget_max = criteria.budget_max
  if (criteria.budget_min) upd.budget_min = criteria.budget_min
  if (criteria.property_category) upd.property_category = criteria.property_category
  if (Object.keys(upd).length) { try { await supabaseAdmin.from('leads').update(upd).eq('id', leadId) } catch { /* non-fatal */ } }

  const action = decideBotAction(intent, criteria, properties)
  switch (action.kind) {
    case 'fallback':
      return { handled: false }
    case 'human':
      return { handled: true, reply: buildAgentContactCard(agent), photos: [], matchedPropertyId: null, action: 'human', overflow: false, humanRequested: true }
    case 'qualify':
      return { handled: true, reply: action.text, photos: [], matchedPropertyId: null, action: `qualify_${action.ask}`, overflow: false, humanRequested: false }
    case 'no_match': {
      // Before committing to a hard no-match, check adjacent localities.
      const nearby = getNearbyProperties(properties, criteria)
      if (nearby && nearby.properties.length > 0) {
        const intro = nearbyIntro(criteria.preferred_areas, nearby.nearbyAreas)
        const pres = presentProperties(nearby.properties, { intro })
        return { handled: true, reply: pres.text, photos: pres.photos, matchedPropertyId: pres.shownIds[0] || null, action: 'present_nearby', overflow: pres.overflow, humanRequested: false }
      }
      return { handled: true, reply: `${noMatchText()}\n\n${buildAgentContactCard(agent)}`, photos: [], matchedPropertyId: null, action: 'no_match', overflow: false, humanRequested: false }
    }
    case 'present': {
      const pres = presentProperties(action.properties)
      return { handled: true, reply: pres.text, photos: pres.photos, matchedPropertyId: pres.shownIds[0] || null, action: 'present', overflow: pres.overflow, humanRequested: false }
    }
  }
}
