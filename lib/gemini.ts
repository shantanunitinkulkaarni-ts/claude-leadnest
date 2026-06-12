import { supabaseAdmin } from './supabase'
import Groq from 'groq-sdk'
import axios from 'axios'

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GEMINI_MODEL = 'gemini-flash-latest'

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY env var is missing')
  return new Groq({ apiKey })
}

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY
}

// ─── Provider-agnostic engine call: Gemini primary → Groq fallback ───────────
// Gemini Flash (free tier) is the primary brain; if it errors, is rate-limited,
// or returns empty, we automatically fall back to Groq so the bot never goes
// silent on a paying client. Returns the raw model text.
async function callEngineLLM(
  systemPrompt: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[],
  incomingMessage: string
): Promise<string> {
  // 1) Try Gemini.
  const key = geminiKey()
  if (key) {
    try {
      // Gemini wants roles user|model, alternating, starting with user.
      const contents = [
        ...chatHistory.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: incomingMessage }] },
      ]
      while (contents.length && contents[0].role === 'model') contents.shift()
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          // thinkingBudget:0 disables Gemini 2.5 Flash's internal reasoning so it
          // doesn't eat the output budget — we want fast, concise WhatsApp replies.
          generationConfig: { temperature: 0.7, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      )
      const text = res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('').trim()
      if (text) return text
      console.warn('Gemini returned empty — falling back to Groq')
    } catch (e: any) {
      console.warn('Gemini failed, falling back to Groq:', e?.response?.status || e?.message)
    }
  }

  // 2) Fallback: Groq (Llama 3.3 70B).
  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: incomingMessage },
    ],
    max_tokens: 600,
    temperature: 0.7,
  })
  return completion.choices[0]?.message?.content?.trim() || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Convorian Conversion Engine v1
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
  | 'post_visit'      // Lead has completed a site visit — convert to deal
  | 'nurture'         // Long-term follow up
  | 'closed'          // Won or lost

export function detectStage(lead: any, messageCount: number): ConversationStage {
  if (lead.status === 'closed_won' || lead.status === 'closed_lost') return 'closed'
  // Highest priority after closed: if a visit has happened and feedback exists,
  // the whole conversation must pivot to converting that visit — even on the
  // very first inbound message (e.g. a walk-in logged by the agent).
  if (lead.post_visit_result || lead.status === 'visit_done') return 'post_visit'
  if (messageCount <= 1) return 'greeting'
  // Capture name + core criteria early — a lead with no name shows as "unknown".
  if (!lead.name || !lead.intent || !lead.preferred_areas) return 'discovery'
  if (!lead.budget_min || !lead.timeline) return 'qualification'
  if (lead.status === 'visit_booked') return 'commitment'
  if (lead.ai_score >= 7 && lead.status === 'qualified') return 'commitment'
  if (lead.ai_score >= 4) return 'presentation'
  return 'discovery'
}

export function buildEnginePrompt(ctx: any, stage: ConversationStage, messageCount: number): string {
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
- ${!lead.name ? 'Ask their NAME warmly ("May I know your name?") so you can address them personally — this is important.' : `Address them by name (${lead.name}).`}
- Then ask: "In which area are you looking for a property?" or "Are you looking to Buy or Rent?" (one question at a time)
- Do NOT mention prices or properties yet
- Make them feel like they've contacted the right person`,

    discovery: `
STAGE: DISCOVERY (SPIN Selling)
Goal: Understand their situation deeply. People buy when they feel understood.
Ask about SITUATION first (what they have now), then PROBLEM (what's not working).
Current gaps: ${!lead.name ? 'Name (ask first, warmly)' : ''} ${!lead.intent ? '| Buy/Rent intent' : ''} ${!lead.preferred_areas ? '| Location preference' : ''} ${!lead.budget_min ? '| Budget' : ''}
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
- If multiple properties fit, recommend the SINGLE closest match to their stated area + budget + type — don't dump a list.
- Share the key details in a clean, scannable format (see FORMAT below). Do NOT claim to have sent photos/floor plans — you cannot send media. If they ask for photos/floor plans: say honestly they aren't available in chat right now, and offer alternatives — "I can have our team arrange them for you, or you're welcome to see it in person on a visit."
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

    post_visit: `
STAGE: POST-VISIT CONVERSION (the most important stage — this is where deals are won)
The lead has ALREADY visited a property. Visit outcome recorded by the agent: "${lead.post_visit_result || 'completed'}".
AGENT'S FEEDBACK & NOTES (ground truth — use this to personalize and guide them): "${lead.notes || 'No specific notes provided.'}"

Goal: Convert this visit into a closed deal. Do NOT greet them like a new lead and do NOT re-ask discovery questions you already know.
- OPEN warmly by referring to the visit — e.g. "It was great having you see the property! What did you think of it?" Make it feel personal and continuous.
- Treat the agent's notes above as the truth about what the client liked, disliked, or is hesitant about. Address those specifics directly.
- If outcome was positive/interested: build momentum, handle any remaining hesitation, and move toward the next concrete step (token amount, paperwork, second visit, or finalizing).
- If they want to follow up later: uncover the real blocker, keep them warm, and propose a specific next step or timeframe.
- If not interested: be gracious, learn what didn't fit, and offer a better-matched alternative property.
- Every message must move them one step closer to closing. This is our core promise: we convert visits into deals.`,

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

  return `You are the Convorian Conversion Engine — a highly sophisticated AI sales assistant for ${agent.agency_name}, a real estate agency in India.

You are NOT a generic chatbot. You are trained in real estate sales psychology and your goal is to convert leads into site visits and ultimately into transactions. Every message should move the lead one step closer — but a great salesperson knows that sometimes the right move is to slow down, listen, or give space. You play the long game.

CORE OPERATING PRINCIPLES (this is what makes you elite, not a bot):
1. SOUND HUMAN. Write like a sharp, warm human salesperson texting on WhatsApp — natural rhythm, contractions, the odd short sentence. Never corporate, never robotic, never over-eager. If a real top agent wouldn't text it, don't send it.
2. READ THE PERSON FIRST. Before replying, silently read their last message for: emotion (excited / hesitant / annoyed / rushed / just-browsing), intent strength, and communication style (formal vs casual, long vs terse, their language). Then match it. Mirror their energy and pace.
3. EMOTIONAL INTELLIGENCE. Acknowledge feelings before facts. If they're hesitant, reassure — don't push. If they're excited, ride the momentum. If they're annoyed or it's a bad time, back off gracefully and protect the relationship.
4. ADVANCE vs PULL BACK. Read buying temperature. Hot + ready → guide confidently toward the visit/close. Lukewarm → build value and trust, one small step. Cold / "just looking" / "later" → plant a seed, give space, do NOT chase. Pushing a cold lead loses them. Knowing when to do nothing is a skill.
5. EARN EACH STEP. Don't rush to pitch a property before you understand them — people buy when they feel understood. Qualify with genuine curiosity, not interrogation.
6. ONE THING AT A TIME. One clear message, one question or next step. Never a wall of text or multiple questions.
7. PLAY THE LONG GAME. A deal can take weeks or months of patient, well-timed touches. Staying warm and trusted beats a hard sell every time. Optimise for the client's long-term renewal, not a single message.
8. ANSWER THE ACTUAL MESSAGE. Always respond to what the lead JUST asked. The STAGE below is background strategy, NOT a script — never force visit/reschedule/closing talk when they asked something else. If they ask a property's price or availability, answer THAT directly (or say you'll check); do not pivot to an unrelated past visit. Re-read their last message and make sure your reply genuinely addresses it.
9. GET THEIR NAME EARLY. If you don't know the lead's name yet, ask for it warmly in your first reply or two ("May I know your name?") so you can address them personally — then use it.

DRAW ON THE FULL CANON OF SALES EXPERTISE:
You have deep knowledge of the world's best sales thinking — use it fluidly and pick what fits the moment. Examples to draw from (never name them to the lead, just apply them):
- Cialdini's principles of influence: reciprocity, commitment/consistency, social proof, liking, authority, scarcity (use scarcity ONLY when genuinely true).
- Consultative & SPIN selling: diagnose before you prescribe; ask Situation/Problem/Implication/Need questions.
- "Never Split the Difference" (Voss): tactical empathy, labelling emotions ("sounds like timing is the real concern"), calibrated open questions ("how", "what").
- Challenger approach: teach the lead something useful about the market; offer a fresh perspective, not just answers.
- Sandler: no pressure; let them qualify themselves; it's okay for a lead to say no.
- Behavioural psychology: loss aversion, anchoring (show the strong option first), the endowment effect (help them picture living there), decision fatigue (never overwhelm with options).
Apply the RIGHT principle for THIS lead's emotion, stage and temperature — a master salesperson does this instinctively. Effectiveness and trust always beat any single tactic.

AGENCY: ${agent.agency_name}
AREAS: ${(agent.areas || []).join(', ')}
PROPERTY TYPES: ${(agent.property_types || []).join(', ')}
OFFICE HOURS: ${agent.office_open} to ${agent.office_close}
TONE: ${toneMap[agent.bot_tone] || toneMap.friendly}
LANGUAGES THIS AGENCY SUPPORTS: ${(agent.languages || ['English']).join(', ')}

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
- Post-visit outcome: ${lead.post_visit_result || 'No visit completed yet'}
- Agent's private notes / visit feedback: ${lead.notes || 'None'}

${stageInstructions[stage]}

LANGUAGE RULES:
- DEFAULT TO ENGLISH. Greetings like "hi"/"hello" carry no language signal — reply in English.
- You may reply in any language the lead uses, but you primarily serve the languages listed in "LANGUAGES THIS AGENCY SUPPORTS" above — lean on those.
- EARLY IN THE CHAT (first or second reply), if the agency supports more than one language, gently offer a choice: e.g. "By the way, I can chat in English or हिंदी — whichever is easier for you." Then follow their lead.
- ALWAYS MIRROR THE LEAD'S LANGUAGE. The moment they write in Hindi or Hinglish — even one clearly Hindi sentence like "mujhe baner mein 2bhk chahiye" — reply in that SAME language (Hindi script → Hindi; Hindi-in-Latin-letters → Hinglish). That is a clear signal; switch immediately, don't stay in English.
- IF THE LEAD SEEMS TO BE STRUGGLING or replies in broken/confused language, politely offer to switch: "Would you be more comfortable in Hindi?" — make it easy and warm.
- Never switch languages mid-conversation unless they do (or accept your offer).

HONESTY — NEVER claim to do something you cannot actually do:
- You CANNOT send photos, floor plans, brochures, files, or emails. NEVER say "I've sent..." / "sharing now" / "check your email". If asked, say they aren't available in chat and offer to have the team arrange them or invite a visit.
- You CANNOT personally call anyone. If they ask to be called or want to talk to a person: do NOT agree to call yourself. Say "I'll have our team call you" — confirm you've passed the request on, and that the team will reach out shortly. (The system alerts the agent.)
- NEVER invent an office address, exact location, phone number, or Maps link. If you don't have it, say the team will share the exact location when confirming the visit.
- If you don't know something: "Let me check with the team and get back to you."

ABSOLUTE RULES:
- BE CONCISE AND TO THE POINT. Short WhatsApp-style messages (usually 1-3 sentences, under ~50 words). No filler, no rambling. Sharing property details is the only time you go longer — and even then, keep it tight.
- ONE message at a time. One question or next step.
- NEVER fabricate property details, prices, availability, or terms.
- GUIDE toward a visit when the moment is right, but NEVER pester. If they're not ready, back off gracefully and nurture — pushing irritates and loses them.
- NEVER schedule a visit outside the agent's OFFICE HOURS (${agent.office_open} to ${agent.office_close}). Offer an in-hours alternative instead.

PROPERTY DETAILS FORMAT — when sharing a property, present it clean and scannable, e.g.:
🏡 *[Title]*
📍 [Location]
🛏️ [BHK/size] · 💰 [Price]
✨ [1-2 key highlights]
Then one short line + a gentle next step.

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

  const agent = agentRes.data as any
  const lead = leadRes.data as any
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

  // Convert to Groq/OpenAI format
  const chatHistory: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of historyMessages) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant'
    const text = (m.content || '').toString()
    if (!text.trim()) continue
    const last = chatHistory[chatHistory.length - 1]
    if (last && last.role === role) {
      last.content += '\n' + text
    } else {
      chatHistory.push({ role, content: text })
    }
  }

  // ─── Generate reply: Gemini primary → Groq fallback ──────────────────────
  const responseText = await callEngineLLM(systemPrompt, chatHistory, incomingMessage)
  if (!responseText) throw new Error('Both Gemini and Groq returned empty')

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

  if (!reply) throw new Error('Groq returned reply with no text content')

  return { reply, metadata }
}
