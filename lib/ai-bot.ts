// lib/ai-bot.ts
// AI-first bot engine. Every message → AI understands → code acts → AI formats reply.
// AI NEVER types a property fact. All prices, sizes, locations come from the database.

import { supabaseAdmin } from './supabase'
import { callLLM } from './llm'
import { searchPropertiesByFallbackChain } from './propertySearch'
import { buildPropertyBlock } from './propertyPresenter'
import { sendViaMsg91, sendViaMsg91Media } from './whatsapp'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotStage =
  | 'greeting'
  | 'language'
  | 'name'
  | 'intent'
  | 'qualifying'
  | 'property_shown'
  | 'awaiting_visit_time'
  | 'awaiting_email'
  | 'visit_confirmed'
  | 'handover'

type ChatEntry = {
  role: 'user' | 'bot'
  text: string
  ts: string
}

type AIDecision = {
  stage: BotStage
  reply: string
  action: 'search_properties' | 'send_photos' | 'book_visit' | 'share_contact' | 'handover' | null
  updates: {
    name?: string
    language?: string
    intent?: 'rent' | 'buy'
    preferred_areas?: string[]
    budget_max?: number
    bhk?: string
    sqft_preference?: number
    visit_time?: string
    email?: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 12   // max chat entries to keep (6 exchanges)
const MAX_PHOTOS = 5

// ─── Time Parsing ────────────────────────────────────────────────────────────────

function parseTimeString(timeStr: string): string | null {
  if (!timeStr) return null
  const now = new Date()
  const t = timeStr.toLowerCase().trim()

  // Extract time (hh:mm or h am/pm)
  const timeMatch = t.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?|\b(\d{1,2})\s*(am|pm)\b/i)
  let hours = 0
  let mins = 0
  if (timeMatch) {
    hours = parseInt(timeMatch[1] || timeMatch[4] || '0')
    mins = parseInt(timeMatch[2] || '0')
    const ampm = (timeMatch[3] || timeMatch[5] || '').toLowerCase()
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
  } else {
    return null // No time found
  }

  // Extract date
  let date = new Date(now)
  if (t.includes('tomorrow') || t.includes('next day')) {
    date.setDate(date.getDate() + 1)
  } else if (t.match(/today|this\s+morning|this\s+afternoon/)) {
    // Use today's date
  } else if (t.match(/day\s+after\s+tomorrow|in\s+2\s+days?/)) {
    date.setDate(date.getDate() + 2)
  } else if (t.match(/next\s+week/)) {
    date.setDate(date.getDate() + 7)
  } else if (t.match(/(\d{1,2})-(\d{1,2})/)) {
    // Date format like 22-6 or 6-22
    const parts = t.match(/(\d{1,2})-(\d{1,2})/)
    if (parts) {
      const d = parseInt(parts[1])
      const m = parseInt(parts[2])
      // Assume dd-mm format (common in India)
      date = new Date(date.getFullYear(), m - 1, d)
    }
  }

  date.setHours(hours, mins, 0, 0)
  return date.toISOString()
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(agent: any, lead: any, properties?: any[]): string {
  const lang = lead.language || 'en'
  const langLabel =
    lang === 'hi' ? 'Hindi' :
    lang === 'hinglish' ? 'Hinglish (Hindi written in English letters)' :
    'English'

  const agentName = agent.name || 'our team'
  const agencyName = agent.agency_name || 'our agency'
  const openTime = agent.office_open || '9:00 AM'
  const closeTime = agent.office_close || '7:00 PM'

  const leadContext = JSON.stringify({
    name: lead.name || null,
    intent: lead.intent || null,
    preferred_areas: lead.preferred_areas || [],
    budget_max: lead.budget_max || null,
    bhk: lead.bhk || null,
    visit_time: lead.pending_appointment_time || null,
    email: lead.email || null,
    bot_stage: lead.bot_stage || 'greeting',
  }, null, 2)

  const propertiesBlock = properties && properties.length > 0
    ? `\nAVAILABLE PROPERTIES — copy facts exactly, do not invent:\n${
        properties.slice(0, 3).map((p, i) => `[${i + 1}] ${JSON.stringify({
          id: p.id,
          title: p.title,
          type: p.type,
          location: p.location,
          bhk: p.bhk,
          size_sqft: p.size_sqft,
          rent_per_month: p.rent_per_month,
          price: p.price,
          deposit: p.deposit,
          facing: p.facing,
          features: (p.features || []).slice(0, 6),
          description: p.description,
          has_photos: (p.photos || []).length > 0,
        })}`).join('\n')
      }`
    : ''

  return `You are a WhatsApp property assistant for ${agentName} (${agencyName}).
Office hours: ${openTime} – ${closeTime}.

LANGUAGE: Always reply in ${langLabel} only. Never switch unless the user explicitly asks.

CONVERSATION FLOW (follow this order, skip what is already known):
1. Greet warmly
2. Ask language preference (English / Hindi / Hinglish)
3. Ask their name
4. Ask: looking to Rent or Buy?
5. Ask: which area?
6. Ask: monthly budget? (for rent) or total budget? (for buy)
7. Ask: how many bedrooms? (1BHK / 2BHK / 3BHK etc.)
8. Once you have intent + area → set action to "search_properties"
9. Present matched properties using ONLY the data provided
10. Offer photos when presenting properties ("Would you like photos?")
11. When user wants to visit → ASK for preferred date and time (e.g., "tomorrow at 11 AM")
12. Once user gives time → ask for their email address for confirmation
13. Once user gives email → set action "book_visit" to create appointment
14. Confirm on WhatsApp with all details (property, time, contact)

RULES:
- NEVER invent prices, sizes, locations, or any property fact
- Area is non-negotiable — never suggest a different area unless the user agrees
- If user asks for photos → set action "send_photos"
- If user wants to speak to someone / asks for agent contact → set action "share_contact"
- If user is very upset or demands human → set action "handover"
- Stay on property topics; for off-topic questions say you specialize in property search
- Be warm, friendly, and concise — WhatsApp messages, not essays

CURRENT LEAD DATA:
${leadContext}
${propertiesBlock}

RESPOND WITH VALID JSON ONLY. No text outside the JSON block.

{
  "stage": "greeting|language|name|intent|qualifying|property_shown|awaiting_visit_time|awaiting_email|visit_confirmed|handover",
  "reply": "your WhatsApp message to the customer",
  "action": null or "search_properties"|"send_photos"|"book_visit"|"share_contact"|"handover",
  "updates": {
    "name": "string or omit",
    "language": "en|hi|hinglish or omit",
    "intent": "rent|buy or omit",
    "preferred_areas": ["area"] or omit,
    "budget_max": number or omit,
    "bhk": "2BHK" or omit,
    "sqft_preference": number or omit,
    "visit_time": "ISO8601 datetime or natural lang like '2026-06-22 11:00' or omit",
    "email": "string or omit"
  }
}`
}

// ─── Parse AI JSON safely ──────────────────────────────────────────────────────

function parseAIDecision(raw: string): AIDecision | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as AIDecision
  } catch {
    return null
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleAiBotMessage(opts: {
  phone: string
  message: string
  agentId: string
  integratedNumber: string
}): Promise<void> {
  const { phone, message, agentId, integratedNumber } = opts

  // 1. Load agent
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, agency_name, phone, email, office_open, office_close, msg91_integrated_number')
    .eq('id', agentId)
    .single()

  if (!agent) {
    console.error('[ai-bot] agent not found:', agentId)
    return
  }

  // 2. Load or create lead
  let { data: leadRaw } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .eq('phone', phone)
    .maybeSingle()

  if (!leadRaw) {
    const { data: newLead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        agent_id: agentId,
        phone,
        bot_stage: 'greeting',
        chat_history: [],
        language: 'en',
        source: 'whatsapp_inbound',
        last_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error || !newLead) {
      console.error('[ai-bot] could not create lead:', error)
      return
    }
    leadRaw = newLead
  }

  // Cast to any for flexible access — these columns were added in migration 07
  const lead = leadRaw as any

  // 3. Add incoming message to chat history
  const history: ChatEntry[] = Array.isArray(lead.chat_history) ? lead.chat_history : []
  history.push({ role: 'user', text: message, ts: new Date().toISOString() })

  // 4. Build conversation text for AI
  const conversationText = history
    .slice(-MAX_HISTORY)
    .map(e => `${e.role === 'user' ? 'Customer' : 'Bot'}: ${e.text}`)
    .join('\n')

  // 5. First AI call — understand and decide
  let decision: AIDecision | null = null
  try {
    const raw = await callLLM([
      { role: 'system', content: buildSystemPrompt(agent, lead) },
      { role: 'user', content: `Conversation:\n${conversationText}\n\nRespond with JSON only.` },
    ], { maxTokens: 600, temperature: 0.35 })

    decision = parseAIDecision(raw)
  } catch (err) {
    console.error('[ai-bot] LLM error (first call):', err)
  }

  if (!decision) {
    await sendViaMsg91(integratedNumber, phone, "I'm having a small issue — please try again in a moment. 🙏")
    return
  }

  let finalReply = decision.reply
  let searchReply: string | null = null  // second message sent after "let me check"
  const photosToSend: string[] = []

  // 6. Execute action
  if (decision.action === 'search_properties') {
    const intent = decision.updates?.intent || lead.intent
    const areas = decision.updates?.preferred_areas || lead.preferred_areas || []
    const budgetMax = decision.updates?.budget_max || lead.budget_max || null

    const { data: propertiesRaw } = await supabaseAdmin
      .from('properties')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', 'active')

    const properties = (propertiesRaw || []) as any[]
    const result = searchPropertiesByFallbackChain(properties, {
      intent: intent as 'rent' | 'buy',
      preferred_areas: areas,
      budget_max: budgetMax,
    })

    if (result.properties.length === 0) {
      const areaText = areas.join(', ') || 'that area'
      searchReply = `I looked through all our ${intent === 'rent' ? 'rental' : 'sale'} properties in ${areaText} but don't have a match right now. 😔\n\nTo serve you better, shall I schedule a call with our team? They may have options that aren't listed yet.`
    } else {
      // Second AI call — format using real property data
      try {
        const raw2 = await callLLM([
          { role: 'system', content: buildSystemPrompt(agent, lead, result.properties) },
          { role: 'user', content: `Present these ${Math.min(result.properties.length, 3)} properties to the customer in a warm WhatsApp message. Use emojis. Show all details for each. End by asking which one they like or if they want photos. Respond with JSON only.` },
        ], { maxTokens: 1000, temperature: 0.3 })

        const d2 = parseAIDecision(raw2)
        if (d2?.reply) searchReply = d2.reply
      } catch {
        // Fallback: build blocks in code
        const blocks = result.properties
          .slice(0, 3)
          .map(p => buildPropertyBlock(p))
          .join('\n\n─────────────\n\n')
        searchReply = `Here are the top matches for you:\n\n${blocks}\n\nWhich one interests you? I can share photos or arrange a site visit. 😊`
      }

      // Track matched property
      await supabaseAdmin
        .from('leads')
        .update({ matched_property_id: result.properties[0].id })
        .eq('id', lead.id)
    }
  }

  if (decision.action === 'send_photos') {
    const propertyId = lead.matched_property_id
    if (propertyId) {
      const { data: prop } = await supabaseAdmin
        .from('properties')
        .select('photos, property_media, video_url, brochure_url, title')
        .eq('id', propertyId)
        .single()

      if (prop) {
        const urls = [
          ...(prop.photos || []),
          ...(prop.property_media || []),
        ].filter((u: string) => typeof u === 'string' && u.startsWith('http'))

        photosToSend.push(...urls.slice(0, MAX_PHOTOS))
      }
    }

    if (photosToSend.length === 0) {
      finalReply = "Photos haven't been uploaded for this property yet. I'll let the agent know to add them! Meanwhile, would you like to schedule a site visit? 😊"
    }
  }

  if (decision.action === 'book_visit') {
    // Save visit request
    await supabaseAdmin
      .from('leads')
      .update({
        bot_stage: 'visit_requested',
        pending_appointment_set_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    // Alert agent immediately
    const agentPhone = (agent.phone || '').replace(/\D/g, '')
    if (agentPhone) {
      const leadName = decision.updates?.name || lead.name || 'A lead'
      const areas = (decision.updates?.preferred_areas || lead.preferred_areas || []).join(', ')
      const budget = lead.budget_max
        ? `₹${Number(lead.budget_max).toLocaleString('en-IN')}`
        : 'Not specified'

      const agentAlert =
        `🔔 *New Site Visit Request*\n\n` +
        `👤 Lead: ${leadName}\n` +
        `📞 Phone: ${phone}\n` +
        `📍 Area: ${areas || 'Not specified'}\n` +
        `💰 Budget: ${budget}\n\n` +
        `Reply *CONFIRM* or *RESCHEDULE*`

      await sendViaMsg91(integratedNumber, agentPhone, agentAlert)
    }
  }

  if (decision.action === 'share_contact' || decision.action === 'handover') {
    const card =
      `👤 *${agent.name}*\n` +
      `📞 ${agent.phone || 'Contact via this chat'}\n` +
      (agent.email ? `📧 ${agent.email}\n` : '') +
      `🕐 Available: ${agent.office_open || '9:00 AM'} – ${agent.office_close || '7:00 PM'}`

    finalReply = `${finalReply}\n\n${card}`

    // Alert agent
    const agentPhone = (agent.phone || '').replace(/\D/g, '')
    if (agentPhone) {
      const leadName = lead.name || phone
      await sendViaMsg91(
        integratedNumber,
        agentPhone,
        `🔔 *Lead wants to speak to you*\n\n👤 ${leadName}\n📞 ${phone}\n\nPlease call them.`
      )
    }
  }

  // 7. Send reply (and search results as a second message if needed)
  await sendViaMsg91(integratedNumber, phone, finalReply)
  if (searchReply) {
    await sendViaMsg91(integratedNumber, phone, searchReply)
  }

  // 8. Send photos (one by one)
  for (const url of photosToSend) {
    await sendViaMsg91Media(integratedNumber, phone, url)
  }

  // 9. Save updates to lead
  const leadUpdates: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    bot_stage: decision.stage,
    window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  if (decision.updates?.name) leadUpdates.name = decision.updates.name
  if (decision.updates?.language) leadUpdates.language = decision.updates.language
  if (decision.updates?.intent) leadUpdates.intent = decision.updates.intent
  if (decision.updates?.preferred_areas?.length) leadUpdates.preferred_areas = decision.updates.preferred_areas
  if (decision.updates?.budget_max) leadUpdates.budget_max = decision.updates.budget_max
  if (decision.updates?.bhk) leadUpdates.bhk = decision.updates.bhk
  if (decision.updates?.sqft_preference) leadUpdates.sqft_preference = decision.updates.sqft_preference
  if (decision.updates?.visit_time) {
    const parsed = parseTimeString(decision.updates.visit_time)
    if (parsed) leadUpdates.pending_appointment_time = parsed
  }
  if (decision.updates?.email) leadUpdates.email = decision.updates.email

  // Save updated history
  history.push({ role: 'bot', text: finalReply, ts: new Date().toISOString() })
  if (searchReply) history.push({ role: 'bot', text: searchReply, ts: new Date().toISOString() })
  leadUpdates.chat_history = history.slice(-MAX_HISTORY)

  await supabaseAdmin.from('leads').update(leadUpdates).eq('id', lead.id)

  // 10. Log messages
  await supabaseAdmin.from('messages').insert([
    {
      lead_id: lead.id,
      agent_id: agentId,
      direction: 'inbound',
      content: message,
      sent_by: 'lead',
    },
    {
      lead_id: lead.id,
      agent_id: agentId,
      direction: 'outbound',
      content: finalReply,
      sent_by: 'bot',
    },
  ])

  console.log(`[ai-bot] handled message from ${phone}, stage: ${decision.stage}, action: ${decision.action}`)
}
