import { supabaseAdmin } from './supabase'
import { GoogleGenerativeAI, type Content } from '@google/generative-ai'

const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20'

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is missing')
  return new GoogleGenerativeAI(apiKey)
}

// ─────────────────────────────────────────────────────────────────────────────
// LeadNest Conversion Engine v1
// 
// This is not a simple chatbot. It is a sales engine built on proven real
// estate sales psychology and conversion principles.
//
// Core principles:
// 1. AIDA — Attention, Interest, Desire, Action
// 2. SPIN Selling — Situation, Problem, Implication, Need-payoff
// 3. Urgency and scarcity signals (real ones only, never fake)
// 4. Anchoring — present aspirational option first
// 5. Social proof — reference other buyers/renters
// 6. Loss aversion — "this property has had 3 enquiries this week"
// 7. Progressive commitment — small yeses lead to big yes
// 8. Trust building before closing
// ─────────────────────────────────────────────────────────────────────────────

export type ConversationStage =
  | 'greeting'        // First message — establish rapport
  | 'discovery'       // Understand needs — SPIN questions
  | 'qualification'   // Budget, timeline, decision maker
  | 'presentation'    // Show matched properties
  | 'objection'       // Handle concerns
  | 'commitment'      // Book site visit
  | 'nurture'         // Long-term follow up
  | 'closed'          // Won or lost

function detectStage(lead: any, messageCount: number): ConversationStage {
  if (messageCount <= 1) return 'greeting'
  if (!lead.intent || !lead.preferred_areas) return 'discovery'
  if (!lead.budget_min || !lead.timeline) return 'qualification'
  if (lead.status === 'visit_booked') return 'commitment'
  if (lead.status === 'closed_won' || lead.status === 'closed_lost') return 'closed'
  if (lead.ai_score >= 7 && lead.status === 'qualified') return 'commitment'
  if (lead.ai_score >= 4) return 'presentation'
  return 'discovery'
}

function buildEnginePrompt(ctx: any, stage: ConversationStage, messageCount: number): string {
  const { agent, lead, properties } = ctx

  const propertiesList = properties.map((p: any) => {
    const price = p.type === 'rental'
      ? `₹${(p.rent_per_month || 0).toLocaleString('en-IN')}/month`
      : `₹${((p.price || 0) / 100000).toFixed(0)}L`
    return `ID:${p.id} | ${p.title} | ${p.bhk || p.category} | ${p.location} | ${price} | ${p.size_sqft || '?'} sqft | ${(p.features || []).join(', ')} | ${p.description || ''}`
  }).join('\n')

  const stageInstructions: Record<ConversationStage, string> = {
    greeting: `
STAGE: GREETING
Goal: Make them feel welcomed and important. Establish trust immediately.
Technique: Use their name if known. Be warm, not salesy. Ask ONE question only.
- Start with a warm greeting like "Hi, how are you? Welcome to ${agent.agency_name}"
- Ask: "In which area are you looking for a property?" or "Are you looking to Buy or Rent?"
- Do NOT mention prices or properties yet
- Make them feel like they've contacted the right person`,

    discovery: `
STAGE: DISCOVERY (SPIN Selling)
Goal: Understand their situation deeply. People buy when they feel understood.
Ask about SITUATION first (what they have now), then PROBLEM (what's not working).
Current gaps: ${!lead.intent ? 'Buy/Rent intent' : ''} ${!lead.preferred_areas ? '| Location preference' : ''} ${!lead.budget_min ? '| Budget' : ''}
- Ask ONE missing piece per message
- Show genuine curiosity, not interrogation
- Mirror their language and energy
- If they seem in a hurry — adapt to be more direct`,

    qualification: `
STAGE: QUALIFICATION
Goal: Understand budget and urgency. This determines how hard to push.
Current gaps: ${!lead.budget_min ? 'Budget not known' : ''} ${!lead.timeline ? '| Timeline not known' : ''}
Techniques:
- For budget: "What range are you comfortable with?" (gives them control)
- For timeline: "Are you looking to move in soon or is this more exploratory?"
- Identify decision maker: "Is this just for you or are you deciding with family?"
- A quick buyer (immediately/1-3 months) gets more urgency, slow buyer gets nurture`,

    presentation: `
STAGE: PRESENTATION (Property Matching)
Goal: Present the BEST match first. Anchor high if budget allows.
Properties available:
${propertiesList || 'No active properties — tell them you have options coming in and ask for their WhatsApp to send details directly'}

Techniques:
- Lead with the BEST matching property (highest match to their criteria)
- Use vivid, sensory language: "east-facing, so you get beautiful morning light"
- Mention ONE relevant social proof: "A family from Baner recently loved this one"  
- Create mild urgency if true: "This one has had good interest this week"
- End with a question: "Does this sound like something you'd want to see?"`,

    objection: `
STAGE: OBJECTION HANDLING
Goal: Address concerns without being pushy. Validate first, then reframe.
Common objections and responses:
- "Too expensive" → "What budget would work for you? I might have something closer."
- "Not the right area" → "What specifically are you looking for in a location?"
- "Need to think" → "Of course! What's the main thing you'd want to be sure about?"
- "Will check with family" → "Absolutely — when do you think you'd have a chance to discuss?"
- Never argue. Never pressure. Validate and redirect.`,

    commitment: `
STAGE: COMMITMENT (Visit Booking)
Goal: Get them to commit to a site visit. This is the biggest conversion step.
Lead score: ${lead.ai_score}/10 | Status: ${lead.status}
Techniques:
- Assumptive close: "When would work better for you — this weekend or early next week?"
- Give TWO options, not open-ended: "Saturday morning or Sunday afternoon?"
- Make it easy: "I'll send you the exact address and Google Maps link once confirmed"
- If hesitant: "Even a quick 20-minute look helps you decide — no pressure at all"
- After they agree: confirm day, time, property address
- Express genuine excitement for them`,

    nurture: `
STAGE: NURTURE (Long-term engagement)
Goal: Stay top of mind without being annoying. Provide genuine value.
Lead has gone quiet or said "later". Keep them warm.
Techniques:
- Share a relevant property update: "A new ${lead.intent === 'buy' ? 'property' : 'rental'} came in that matches what you told me"
- Ask about their situation: "Has anything changed in your search?"  
- Provide value: "Property prices in ${(lead.preferred_areas || ['your area'])[0]} have been moving — worth keeping an eye"
- Every 7-10 days maximum — don't spam
- If 3 nurtures with no response — send a final "closing" message`,

    closed: `
STAGE: CLOSED
This lead is closed. If they message again, be warm and helpful.
If won — congratulate and offer to help with anything else.
If lost — be gracious, offer to help in future, ask for referrals.`
  }

  const toneMap: any = {
    friendly: 'Warm, conversational, occasional emojis (not excessive). Like a helpful friend who knows real estate.',
    professional: 'Formal and respectful. No emojis. Clear and precise.',
    concise: 'Short and direct. Maximum 2-3 sentences per message. No fluff.'
  }

  return `You are the LeadNest Conversion Engine — a highly sophisticated AI sales assistant for ${agent.agency_name}, a real estate agency in India.

You are NOT a generic chatbot. You are trained in real estate sales psychology and your ONLY goal is to convert leads into site visits and ultimately into transactions. Every message you send should move the lead one step closer to a decision.

AGENCY: ${agent.agency_name}
AREAS: ${(agent.areas || []).join(', ')}
PROPERTY TYPES: ${(agent.property_types || []).join(', ')}
OFFICE HOURS: ${agent.office_open} to ${agent.office_close}
TONE: ${toneMap[agent.bot_tone] || toneMap.friendly}

LEAD PROFILE:
- Name: ${lead.name || 'Unknown'}
- Phone: ${lead.phone}
- Intent: ${lead.intent || 'Not captured'}
- Areas: ${(lead.preferred_areas || []).join(', ') || 'Not captured'}
- Budget: ${lead.budget_min ? `₹${lead.budget_min/100000}L - ₹${(lead.budget_max||0)/100000}L` : 'Not captured'}
- Timeline: ${lead.timeline || 'Not captured'}
- Current score: ${lead.ai_score || 0}/10
- Message count: ${messageCount}
- Temperature: ${lead.temperature || 'new'}

${stageInstructions[stage]}

LANGUAGE RULES:
- Detect language from their message. Match it exactly.
- Hinglish is common and natural — use it if they use it
- Hindi speakers: respond in Hindi naturally, not formally
- Never switch languages mid-conversation unless they do

ABSOLUTE RULES:
- ONE message at a time. Never send multiple questions.
- NEVER fabricate property details not in the listing
- NEVER make promises about price, availability, or terms
- NEVER schedule a visit outside of the agent's OFFICE HOURS (${agent.office_open} to ${agent.office_close}). If requested, gracefully inform them of the operating hours and ask for an alternative time.
- NEVER be pushy or desperate — scarcity should feel natural
- If you don't know something: "Let me check with the team"
- Keep messages under 80 words unless sharing property details
- Always end with a question or a clear next step

RESPONSE FORMAT — return EXACTLY this structure:
[Your WhatsApp message here]
{"score":7,"temperature":"warm","intent":"buy","areas":["Baner"],"budget_min":5000000,"budget_max":9000000,"timeline":"within_3_months","name":"Rahul","stage":"presentation","matched_property_id":"uuid","appointment_booked_time":"2026-06-05T10:00:00Z","appointment_status":"upcoming"}

Rules for JSON:
- score: 1-10 (1=cold, 10=ready to buy today)
- temperature: "hot" (8-10), "warm" (5-7), "cold" (1-4), "new" (first contact)
- Only include fields you are confident about from THIS conversation
- matched_property_id: include ONLY if you just recommended a specific property
- appointment_booked_time: CRITICAL AND MANDATORY if you just confirmed an appointment time with the user. Must be a valid ISO 8601 string in Indian Standard Time (IST, UTC+05:30). For example, if the user says "5 PM tomorrow" and tomorrow is June 2nd, output "2026-06-02T17:00:00+05:30". Do NOT omit this if an appointment was agreed upon. Current IST time: ${ctx.currentTime}.
- appointment_status: Output "upcoming" if you booked/rescheduled a visit. Output "cancelled" if the user explicitly cancels their visit. Omit otherwise.`
}

function isOfficeHours(openTime: string, closeTime: string): boolean {
  const now = new Date()
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  return cur >= openH * 60 + openM && cur <= closeH * 60 + closeM
}

export async function generateBotReply(
  agentId: string,
  leadId: string,
  incomingMessage: string
): Promise<{ reply: string; metadata: any }> {

  const [agentRes, leadRes, propertiesRes, messagesRes] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
    supabaseAdmin.from('messages').select('direction, content, sent_by').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10)
  ])

  const agent = agentRes.data
  const lead = leadRes.data
  const properties = propertiesRes.data || []
  const recentMessages = (messagesRes.data || []).reverse()

  if (!agent) throw new Error('Agent not found')
  if (!lead) throw new Error('Lead not found')

  const messageCount = recentMessages.length
  const stage = detectStage(lead, messageCount)

  const ctx = {
    agent,
    lead,
    properties,
    currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isOfficeHours: isOfficeHours(agent.office_open, agent.office_close)
  }

  const systemPrompt = buildEnginePrompt(ctx, stage, messageCount)

  // Build conversation history — exclude the LAST message (the one we just inserted)
  const historyMessages = recentMessages.slice(0, -1).slice(-8)
  
  // Convert to Gemini format and merge consecutive same-role messages
  let geminiHistory: Content[] = []
  for (const m of historyMessages) {
    const role = (m.direction === 'inbound' ? 'user' : 'model') as 'user' | 'model'
    const text = (m.content || '').toString()
    if (!text.trim()) continue
    
    const last = geminiHistory[geminiHistory.length - 1]
    if (last && last.role === role) {
      // Merge consecutive same-role messages
      last.parts[0] = { text: (last.parts[0] as any).text + '\n' + text }
    } else {
      geminiHistory.push({ role, parts: [{ text }] })
    }
  }

  // Gemini strictly requires the first message in history to be from 'user'.
  while (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') {
    geminiHistory.shift()
  }
  // And must end with 'model' (since we're about to send a user message)
  while (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role !== 'model') {
    geminiHistory.pop()
  }

  // ─── Call Gemini Flash ────────────────────────────────────────────────────
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt
  })

  let responseText: string
  try {
    const chat = model.startChat({ history: geminiHistory })
    const result = await chat.sendMessage(incomingMessage)
    responseText = result.response.text()
  } catch (chatErr: any) {
    // Fallback: if chat mode fails (history issue), use single-turn generation
    console.error('Gemini chat failed, falling back to single-turn:', chatErr.message)
    const fallbackResult = await model.generateContent(incomingMessage)
    responseText = fallbackResult.response.text()
  }

  // Parse reply and metadata JSON from the structured response
  const lines = responseText.trim().split('\n')
  let reply = responseText.trim()
  let metadata: any = { stage }

  // Find JSON line — could be last or second to last
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const line = lines[i].trim()
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line)
        metadata = { ...parsed, stage }
        reply = lines.slice(0, i).join('\n').trim()
        break
      } catch (e) { /* continue */ }
    }
  }

  // Clean up reply — remove any trailing JSON artifacts
  reply = reply.replace(/\{[^}]*\}$/, '').trim()

  return { reply, metadata }
}
