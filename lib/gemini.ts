import { supabaseAdmin } from './supabase'
import { getClient } from './claude'

export interface BotContext {
  agent: {
    agency_name: string
    areas: string[]
    property_types: string[]
    bot_tone: string
    languages: string[]
    office_open: string
    office_close: string
    out_of_office_message: string
  }
  lead: {
    name?: string
    phone: string
    intent?: string
    preferred_areas?: string[]
    budget_min?: number
    budget_max?: number
    timeline?: string
    ai_score?: number
    temperature?: string
  }
  properties: Array<{
    id: string
    title: string
    type: string
    category: string
    location: string
    price?: number
    rent_per_month?: number
    size_sqft?: number
    bhk?: string
    description?: string
    features?: string[]
    facing?: string
  }>
  recentMessages: Array<{
    direction: string
    content: string
    sent_by: string
  }>
  currentTime: string
  isOfficeHours: boolean
}

function buildSystemPrompt(ctx: BotContext): string {
  const propertiesList = ctx.properties.map(p => {
    const price = p.type === 'rental'
      ? `₹${p.rent_per_month?.toLocaleString('en-IN')}/month`
      : `₹${((p.price || 0) / 100000).toFixed(0)}L`
    return `- ${p.title} | ${p.bhk || p.category} | ${p.location} | ${price} | ${p.size_sqft} sqft | ${p.features?.join(', ') || ''} | ${p.description || ''}`
  }).join('\n')

  const toneInstructions = {
    friendly: 'Be warm, helpful and approachable. Use simple language. Add occasional emojis (not excessive).',
    professional: 'Be formal, precise and respectful. No emojis. Use proper salutations.',
    concise: 'Be brief and direct. Answer only what is asked. No filler words.'
  }[ctx.agent.bot_tone] || 'Be warm and helpful.'

  return `You are LeadNest, an AI assistant for ${ctx.agent.agency_name}, a real estate agency in India.

ROLE:
You help qualify and nurture property leads via WhatsApp. You represent the agency professionally.

AGENCY DETAILS:
- Name: ${ctx.agent.agency_name}
- Areas covered: ${ctx.agent.areas?.join(', ')}
- Property types: ${ctx.agent.property_types?.join(', ')}
- Office hours: ${ctx.agent.office_open} to ${ctx.agent.office_close}

TONE: ${toneInstructions}

LANGUAGES: Detect the language the lead is using and respond in the same language. Supported: ${ctx.agent.languages?.join(', ')}. Handle Hinglish naturally and fluently.

ACTIVE PROPERTY LISTINGS:
${propertiesList || 'No properties listed yet. Tell the lead the agent will share options shortly.'}

LEAD INFO SO FAR:
- Name: ${ctx.lead.name || 'Not captured yet'}
- Intent: ${ctx.lead.intent || 'Not captured yet'}
- Areas: ${ctx.lead.preferred_areas?.join(', ') || 'Not captured yet'}
- Budget: ${ctx.lead.budget_min ? `₹${ctx.lead.budget_min / 100000}L - ₹${(ctx.lead.budget_max || 0) / 100000}L` : 'Not captured yet'}
- Timeline: ${ctx.lead.timeline || 'Not captured yet'}

CURRENT TIME: ${ctx.currentTime}
OFFICE HOURS: ${ctx.isOfficeHours ? 'YES — office is open' : 'NO — office is closed'}

CONVERSATION FLOW:
1. If first message — greet warmly, ask Buy or Rent?
2. Collect: property type, area, budget, timeline — one question at a time, naturally woven into conversation
3. Once enough info — suggest matching properties from the list above
4. If lead shows interest — offer to book a site visit
5. For visit booking — ask preferred day and time, confirm it

STRICT RULES:
- NEVER make up property details not in the listing above
- NEVER promise prices or terms without checking
- NEVER discuss competitor agencies
- NEVER send more than one message at a time
- If asked something you don't know — say "Let me check with the team and get back to you shortly"
- If office is closed — acknowledge but still collect requirements
- Always be helpful even outside office hours
- Keep messages under 100 words unless sharing property details

RESPONSE FORMAT:
Return your WhatsApp message first, then on a new line return a JSON object:
{"score": 7, "temperature": "warm", "intent": "buy", "areas": ["Baner"], "budget_min": 5000000, "budget_max": 9000000, "timeline": "within_3_months", "name": "Rahul"}

Only include JSON fields you are confident about. Use null for unknown.`
}

function isOfficeHours(openTime: string, closeTime: string): boolean {
  const now = new Date()
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM
  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes
}

export async function generateBotReply(
  agentId: string,
  leadId: string,
  incomingMessage: string
): Promise<{ reply: string; metadata: any }> {

  const [{ data: agent }, { data: lead }, { data: properties }, { data: recentMessages }] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
    supabaseAdmin.from('messages').select('direction, content, sent_by').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(6)
  ])

  if (!agent) throw new Error('Agent not found')
  if (!lead) throw new Error('Lead not found')

  const ctx: BotContext = {
    agent,
    lead,
    properties: properties || [],
    recentMessages: (recentMessages || []).reverse(),
    currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isOfficeHours: isOfficeHours(agent.office_open, agent.office_close)
  }

  const systemPrompt = buildSystemPrompt(ctx)

  // Build conversation history for Claude
  const history = (recentMessages || []).reverse().slice(0, -1).map((m: any) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant' as 'user' | 'assistant',
    content: m.content
  }))

  // Add current message
  const messages = [
    ...history,
    { role: 'user' as const, content: incomingMessage }
  ]

  const claude = getClient()

  // Use Claude Sonnet on Vertex — best balance of quality and cost
  const model = process.env.GOOGLE_CLOUD_PROJECT
    ? 'claude-sonnet-4-5@20251101'  // Vertex AI model string
    : 'claude-sonnet-4-5'           // Direct Anthropic model string

  const response = await claude.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages
  })

  const responseText = response.content[0].type === 'text'
    ? response.content[0].text
    : ''

  // Parse message and metadata
  const lines = responseText.trim().split('\n')
  let reply = responseText.trim()
  let metadata = {}

  // Extract JSON metadata from last line if present
  try {
    const lastLine = lines[lines.length - 1].trim()
    if (lastLine.startsWith('{')) {
      metadata = JSON.parse(lastLine)
      reply = lines.slice(0, -1).join('\n').trim()
    }
  } catch (e) {
    // No metadata, that is fine
  }

  return { reply, metadata }
}
