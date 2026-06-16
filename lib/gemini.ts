import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from './supabase'
import { glmChat } from './llm'
import { detectStage, type ConversationStage } from './stageMachine'
import { filterPropertiesForLead, isValidMatchedProperty } from './propertyMatcher'
import { validateReply } from './replyValidator'

export { detectStage, type ConversationStage }

// ─── Engine LLM call: GLM-4.5-Flash ONLY (see lib/llm.ts) ─────────────────────
// Gemini and Groq were removed (June 13, founder decision): Gemini's key needs
// paid billing, Groq's free daily cap caused mid-day canned replies to real
// leads. Reliability now = fast first attempt + one auto-retry inside glmChat.
export async function callEngineLLM(
  systemPrompt: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[],
  incomingMessage: string
): Promise<string> {
  return glmChat(
    [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: incomingMessage },
    ],
    { maxTokens: 500, temperature: 0.7 }
  )
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

// A message row that's just a media marker we logged when sending an image
// (e.g. "[photo] Lodha", "[image]", "[video] ..."). These are NOT real chat
// text — if fed back into the LLM history the model imitates them and writes
// literal "[photo] ..." into its reply. Filter them out of history everywhere.
export function isMediaPlaceholder(text: string): boolean {
  return /^\s*\[(photo|image|video|media|file|attachment)\b/i.test(text || '')
}

// ─── Few-shot example conversations ──────────────────────────────────────────
// ONE tight example per call — enough to prime tone without bloating the prompt.
// No multi-line property cards in examples (those live in the inventory section).
// Synthetic now; swap for real 👍-rated conversations when volume justifies.
// IMPORTANT: keep these short — GLM free tier slows noticeably above ~2500 tokens.
function buildFewShotExamples(stage: ConversationStage, lang?: string | null): string {
  // India-specific examples — realistic WhatsApp-style exchanges.
  // Keep short (token budget). Budget in crore/lakh is common; always map correctly.
  const stageExamples: Partial<Record<ConversationStage, string>> = {
    greeting:     `Lead: Hi\nYou: Hi! Welcome to SK Properties 😊 May I know your good name? And by the way, I can chat in English, हिंदी or मराठी — jo comfortable ho!\n{"score":1,"temperature":"new"}`,
    discovery:    `Lead: 3BHK chahiye Hinjewadi mein, budget roughly 1.2 crore\nYou: Great choice! Ready-to-move prefer karenge ya under construction theek hai?\n{"score":4,"temperature":"warm","intent":"buy","areas":["Hinjewadi"],"budget_max":12000000}`,
    qualification:`Lead: ready-to-move chahiye, family ke saath decision leni hai\nYou: Bilkul — family ka input important hai! Timeline roughly kya soch rahe ho — 3 months mein ya zyada time hai?\n{"score":4,"temperature":"warm"}`,
    presentation: `Lead: east facing hai? Vastu ka dhyan rakhna tha\nYou: Haan, east-facing hai — morning sunlight aata hai, vastu-friendly ✅ 2BHK, 1,050 sqft, ₹79L. Photos dekhna chahoge?\n{"score":6,"temperature":"warm","matched_property_id":"p3"}`,
    objection:    `Lead: price thoda zyada hai. Wife ko bhi dikhana hai\nYou: Bilkul — family ka saath dekhna sahi decision hai! Is weekend saath aao — 20 minute ki visit mein bahut kuch clear ho jaata hai 🙏\n{"score":5,"temperature":"warm"}`,
    commitment:   `Lead: Sunday 10 baje aa sakte hain kya?\nYou: Sunday 10 AM — perfect! 📍 Confirmed. Humari team visit se pehle exact address share karegi. Koi saath aa raha hai?\n{"score":7,"temperature":"warm","appointment_booked_time":"2026-06-22T10:00:00+05:30","appointment_status":"upcoming"}`,
    post_visit:   `Lead: property achi lagi, ₹5L discount milega kya?\nYou: Khushi hui ki pasand aayi! Builder se flexibility check karta hun — guarantee nahi de sakta par try karta hun. Aaj hi update dunga.\n{"score":8,"temperature":"hot"}`,
    nurture:      `Lead: abhi bhi dekhna chahta hun, price kuch hua kya?\nYou: Market abhi stable hai — aur ek naya option aa gaya hai jo aapki requirement se match karta hai. Details share karun?\n{"score":5,"temperature":"warm"}`,
  }

  // One language-specific example when lead's language is known — pick based on
  // detected script. Only one (not both Latin + Devanagari) to keep tokens low.
  const langExample: Record<string, string> = {
    mr: `Lead: 2BHK pahije Baner madhe, possession lavkar pahije\nYou: Chan! Ready-to-move flat ahe ₹82L la Baner madhe — changli society, east facing. Is weekend baghayla yeta ka?\n{"score":5,"temperature":"warm","intent":"buy","areas":["Baner"],"lang":"mr"}`,
    'mr-dev': `Lead: मला बाणेरमध्ये 2bhk हवंय, ताबा लवकर हवा\nYou: हो! Ready-to-move flat आहे ₹82L ला — उत्तम सोसायटी, east facing. या weekend ला बघायला येता का?\n{"score":5,"temperature":"warm","intent":"buy","lang":"mr"}`,
    hi: `Lead: bhaiya 1.5 crore budget mein 3BHK chahiye Wakad mein\nYou: Perfect! Wakad mein ₹1.45Cr ka solid 3BHK hai — ready-to-move, changli society. Weekend pe site visit karein?\n{"score":5,"temperature":"warm","intent":"buy","areas":["Wakad"],"budget_max":15000000,"lang":"hi"}`,
  }

  const stageEx = stageExamples[stage]
  const langKey = lang === 'mr' ? 'mr' : lang === 'hi' ? 'hi' : null
  const langEx = langKey ? langExample[langKey] : null

  const parts = [stageEx, langEx].filter(Boolean)
  if (!parts.length) return ''

  return `\nEXAMPLES (tone + brevity to match):\n${parts.join('\n---\n')}\n`
}

export function buildEnginePrompt(ctx: any, stage: ConversationStage, messageCount: number): string {
  const { agent, lead, properties } = ctx

  const possessionLabel: Record<string, string> = {
    ready_to_move: 'Ready to move', under_construction: 'Under construction',
    new_launch: 'New launch', resale: 'Resale',
  }
  const propertiesList = properties.map((p: any) => {
    const price = p.type === 'rental'
      ? `₹${(p.rent_per_month || p.price || 0).toLocaleString('en-IN')}/month${p.deposit ? ` (deposit ₹${Number(p.deposit).toLocaleString('en-IN')})` : ''}`
      : `₹${((p.price || 0) / 100000).toFixed(0)}L`
    // property_media is the canonical media column (Phase 0F). Fall back to
    // parsing legacy media: prefixed entries from features for unmigrated rows.
    const mediaUrls: string[] = Array.isArray(p.property_media) && p.property_media.length > 0
      ? p.property_media.filter((u: string) => typeof u === 'string' && /^https?:\/\//i.test(u))
      : (p.features || []).filter((f: string) => typeof f === 'string' && f.startsWith('media:')).map((f: string) => f.slice(6))
    const amenities = (p.features || []).filter((f: string) => typeof f === 'string' && !f.startsWith('media:'))
    const poss = p.possession_status ? (possessionLabel[p.possession_status] || p.possession_status) + (p.possession_date ? ` by ${p.possession_date}` : '') : ''
    const parts = [
      `ID:${p.id}`, p.title, p.bhk || p.category, p.location, price,
      `${p.size_sqft || '?'} sqft`, poss, amenities.join(', '), p.description || '',
      p.extra_info ? `HIGHLIGHTS: ${p.extra_info}` : '',
      mediaUrls.length ? `MEDIA AVAILABLE: ${mediaUrls.length} file(s)` : '',
      (p.project_website && p.website_ai_consent) ? `PROJECT SITE (agent-approved, you may reference its public info): ${p.project_website}` : '',
    ].filter(Boolean)
    return parts.join(' | ')
  }).join('\n')

  const stageInstructions: Record<ConversationStage, string> = {
    greeting: `
STAGE: GREETING
Goal: Make them feel welcomed and important. Establish trust immediately.
Technique: Use their name if known. Be warm, not salesy.
- Start with a warm greeting like "Hi! Welcome to ${agent.agency_name} 😊"
- ${!lead.name ? 'Ask their NAME warmly ("May I know your good name?") — this is the FIRST thing to get.' : `Address them by name (${lead.name}).`}
- In the SAME message after asking their name, also ask their language preference: "By the way, I can chat in English, हिंदी or मराठी — whichever is comfortable for you!"
- Do NOT ask about properties or area yet — just name + language in the first reply
- On their SECOND message (when they give their name): confirm it warmly ("Nice to meet you, [Name]!") and THEN ask ONE question: area preference or buy/rent intent
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
Goal: Show properties that match what the lead asked for. Let them EXPLORE before pushing a visit.
CRITICAL RULES:
- SHOW PROPERTIES FIRST, VISIT LATER. If a lead says "sure, tell me" / "haan batao" / "show me options" — they want to SEE the properties, not book a visit. Present the matching properties with full details (PROPERTY DETAILS FORMAT below). ONLY suggest a visit AFTER they've expressed interest in a specific property.
- If the lead asked for a SPECIFIC AREA, show ONLY properties in that area. If you have NONE in that area, say so honestly — "I don't have any listings in [area] right now, but let me connect you with ${agent.name || 'our agent'} who may know of upcoming options there." Then share the agent's contact details. NEVER silently substitute a different area — that feels like the bot isn't listening and you lose the lead.
- If you have MULTIPLE matching properties, present ALL of them (up to 3-4) in the clean scannable format — not just one. Let the lead CHOOSE which interests them. After showing the list, ask "Which one catches your eye? I can share more details or set up a visit for any of these."
- For each property, use the PROPERTY DETAILS FORMAT below. Be comprehensive: include ALL amenities from inventory, possession status, size, and any highlights. Indian buyers research thoroughly — partial info loses them.
- When a lead asks for more info on a SPECIFIC property ("aur batao" / "tell me more" / "details share karo" / "kya kya hai" / "sab batao"): give the FULL property brief — every amenity, possession date, exact size, HIGHLIGHTS, description — nothing held back. If photos are available (MEDIA AVAILABLE in inventory), mention "I can share photos too — would you like to see them?"
- Do NOT jump to booking a site visit until the lead has seen property details AND shown interest ("this looks good" / "I like this one" / "visit karna hai"). If they're still browsing, let them browse.
- Use vivid, sensory language: "east-facing, so you get beautiful morning light"
- Create mild urgency if true: "This one has had good interest this week"`,

    objection: `
STAGE: OBJECTION HANDLING
Goal: Address concerns without being pushy. Validate first, then reframe.
Common objections and responses:
- "Too expensive" / "thoda zyada hai" → "What budget would work for you? I might have something closer."
- "Not the right area" → "What specifically are you looking for in a location?"
- "Need to think" / "sochna hai" → "Of course! What's the main thing you'd want to be sure about?"
- "FAMILY APPROVAL" ('ghar mein baat karni hai' / 'wife ko bhi dikhana hai' / 'family se poochna hai'): THIS IS NORMAL IN INDIA, NOT A REJECTION. Warmly invite them to bring family for the visit — "Bilkul, family ko saath laiye — ek saath dekhte hain." Offer a weekend slot so everyone can come.
- "LOAN / EMI" ('loan milega kya?' / 'EMI kitni hogi?' / 'home loan'): Acknowledge it's an important point. Give a rough indicative EMI if you can (e.g., "₹80L on 20 years at ~8.5% is roughly ₹70K/month"). Mention we can connect them with our partnered bank/DSA. Never promise loan approval.
- "BUILDER TRUST" ('builder kaisa hai?' / 'RERA registered hai?' / 'project delay toh nahi hoga?'): Take it seriously — it's a valid concern. Share RERA info from inventory if available; if not, "main confirm kar ke aapko batata hun." Never make up RERA numbers or possession guarantees.
- "PRICE NEGOTIATION" ('discount milega?' / 'kuch kam ho sakta hai?' / 'final price kya hai?'): NEVER promise a discount on the spot. Say "main builder/owner se check karta hun aur aapko update karta hun" — this shows respect and manages expectations. Visit first, negotiate after.
- "POSSESSION DELAY" ('possession kab milegi?' / 'delay toh nahi hoga?'): Share the possession date from inventory. If under construction, acknowledge the concern genuinely: "Possession date [date] hai — builder ka track record solid hai. Aur hum visit pe iski paperwork bhi dikhate hain."
- "VASTU / DIRECTION" ('vastu theek hai?' / 'east facing hai?' / 'north facing chahiye' / 'west facing nahi chahiye'): This is a REAL dealbreaker for many Indian families — take it seriously, never dismiss. Check the inventory features for facing/direction. If it matches what they want, confirm clearly ("Haan, east-facing hai — morning sunlight aata hai ✅"). If it doesn't match or facing is not in inventory, say honestly "main direction confirm kar ke batata hun" — NEVER guess or make up a direction. If they want a direction that differs from what's available, acknowledge the importance and offer to show on-site (some vastu issues can be addressed with puja/interiors).
- "PARKING" ('parking hai kya?' / 'covered parking chahiye' / 'parking kitni hai?' / 'basement parking'): Check inventory for parking info. If available, share it specifically (e.g., "2 covered parking spots included"). If not mentioned in inventory, say you'll confirm — don't guess. Covered parking is a strong value add in Indian urban RE; if the property has it, lead with it.
- Never argue. Never pressure. Validate and redirect.`,

    commitment: `
STAGE: COMMITMENT (Visit Booking)
Goal: Get them to commit to a site visit — BUT only if they have already seen property details and expressed interest.
Lead score: ${lead.ai_score}/10 | Status: ${lead.status}
CRITICAL: If the lead has NOT yet seen any property details in this conversation, do NOT push for a visit. Instead, go back and present matching properties first (use PROPERTY DETAILS FORMAT). A lead who hasn't seen what's on offer will NOT commit to a visit — and pushing them will lose them.
CRITICAL: If the lead is asking for PHOTOS, IMAGES, DETAILS, or MORE INFORMATION about a property — GIVE THEM WHAT THEY ASK FOR. Show the property details using the PROPERTY DETAILS FORMAT. Do NOT redirect to visit booking. Do NOT say "happy to set up a visit" when they asked for photos/details. The photos will be sent automatically by the system after your reply — just confirm warmly: "Sure, let me share the photos with you!" and ALWAYS include the matched_property_id in your JSON metadata so the photos can be looked up.
CRITICAL: If the lead follows up saying they need details or photos again (e.g. "no I need details" / "send photos" / "show me the property"), ALWAYS show the full property info using PROPERTY DETAILS FORMAT. NEVER repeat a visit-booking message when the lead is asking for information.
Techniques (ONLY when they've seen properties and are interested AND are not asking for more details):
- Assumptive close: "When would work better for you — this weekend or early next week?"
- Give TWO options, not open-ended: "Saturday morning or Sunday afternoon?"
- Make it easy: "Our team will share the exact address and location details before the visit"
- If hesitant: "Even a quick 20-minute look helps you decide — no pressure at all"
- After they agree: confirm day, time, and property name. Do NOT promise to send a Maps link yourself — you cannot. Say "our team will share the location details."
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

  // ── Hard language directive (injected BEFORE the main prompt so it wins) ──
  // The LLM's own language-detection is unreliable for Latin-script Marathi.
  // We pre-detect server-side and turn it into a mandatory instruction.
  const detectedLang = ctx.detectedLang as 'en' | 'hi' | 'mr' | null | undefined
  const storedLang  = ctx.lead?.language as string | null | undefined
  const activeLang  = detectedLang || storedLang   // detected wins; stored is fallback
  const langDirective = (() => {
    if (activeLang === 'mr') {
      const script = detectedLang === 'mr' && !/[ऀ-ॿ]/.test(ctx.incomingMessage || '') ? 'Latin-script (romanized)' : 'Devanagari'
      return `⚠️ MANDATORY LANGUAGE RULE — override everything else:\nThis lead is writing in MARATHI (${script}). You MUST reply in ${script === 'Latin-script (romanized)' ? 'Latin-script Marathi (romanized Marathi, NOT Devanagari, NOT English, NOT Hindi)' : 'Marathi in Devanagari script'}. Do NOT fall back to English under any circumstances. Even if their latest message is a short "ok" or "yes", maintain Marathi. A Marathi speaker who gets an English reply feels ignored — this kills the deal.\n`
    }
    if (activeLang === 'hi') {
      const script = detectedLang === 'hi' && !/[ऀ-ॿ]/.test(ctx.incomingMessage || '') ? 'Latin-script (Hinglish/romanized)' : 'Devanagari'
      return `⚠️ MANDATORY LANGUAGE RULE — override everything else:\nThis lead is writing in HINDI (${script}). You MUST reply in ${script === 'Latin-script (Hinglish/romanized)' ? 'Hinglish (Hindi in Latin script / romanized Hindi)' : 'Hindi in Devanagari script'}. Do NOT switch to English.\n`
    }
    return ''
  })()

  return `${langDirective}You are the Convorian Conversion Engine — a highly sophisticated AI sales assistant for ${agent.agency_name}, a real estate agency in India.

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

PROPERTY INVENTORY (complete and authoritative — every price/size/detail you ever quote MUST come from here, in ANY stage of the conversation):
${propertiesList || 'No active properties right now — never invent one; say new options are coming in and you\'ll share details as soon as they land.'}
TONE: ${toneMap[agent.bot_tone] || toneMap.friendly}
LANGUAGES THIS AGENCY SUPPORTS: ${(agent.languages && agent.languages.length ? agent.languages : ['English', 'Hindi', 'Marathi']).join(', ')} (you are fully fluent in English, Hindi and Marathi regardless)

LEAD PROFILE:
- Name: ${lead.name || 'Unknown'}
- Phone: ${lead.phone}
- Intent: ${lead.intent || 'Not captured'}
- Areas: ${(lead.preferred_areas || []).join(', ') || 'Not captured'}
- Budget: ${lead.budget_min ? `₹${(lead.budget_min/100000).toFixed(lead.budget_min % 100000 === 0 ? 0 : 1)}L${lead.budget_max ? ` – ₹${(lead.budget_max/100000).toFixed(lead.budget_max % 100000 === 0 ? 0 : 1)}L` : ''}` : 'Not captured'}
- Timeline: ${lead.timeline || 'Not captured'}
- Current score: ${lead.ai_score || 0}/10
- Message count: ${messageCount}
- Temperature: ${lead.temperature || 'new'}
- Language on record: ${lead.language === 'mr' ? 'Marathi' : lead.language === 'hi' ? 'Hindi' : lead.language === 'en' ? 'English' : 'Not yet detected'} — maintain this unless they clearly switch
- Post-visit outcome: ${lead.post_visit_result || 'No visit completed yet'}
- Agent's private notes / visit feedback: ${lead.notes || 'None'}

${stageInstructions[stage]}

LANGUAGE RULES (English, हिंदी, मराठी are all first-class — you are fully fluent in each):
- DEFAULT TO ENGLISH only when there is no language signal at all (e.g. bare "hi"/"hello" with no prior language on record). If a language is already on record (see LEAD PROFILE above), maintain it — do NOT reset to English for a short reply like "ok", "yes", "thanks", "sure".
- ALWAYS MIRROR THE LEAD'S LANGUAGE, immediately, from their very first clear signal:
  • Hindi script (मुझे बानेर में 2bhk चाहिए) → reply in natural Hindi (Devanagari).
  • Hinglish / Hindi-in-Latin-letters ("mujhe baner mein 2bhk chahiye") → reply in Hinglish.
  • Marathi script (मला बाणेरमध्ये 2bhk घर हवंय) → reply in natural, grammatical Marathi (Devanagari).
  • Marathi-in-Latin-letters ("mala baner madhe 2bhk ghar pahije") → reply ONLY in Latin-script Marathi — NOT English, NOT Hindi, NOT Devanagari.
- KEY MARATHI-IN-LATIN SIGNALS (if you see any of these, the lead is writing Marathi in English letters):
  pahije / hava / havi / aahe / ahe / mala / amhi / nako / tumhi / tula / sangto / sangte / yeto / yete / kasa / kashi / naahi / aplya / baghto
  → Reply in the SAME Latin-script Marathi style. Example reply: "Ho, Baner madhe changli property ahe — kiti budget ahe tumcha?"
- Your Hindi and Marathi must be PERFECT — fluent, warm, grammatically correct, the way a polished local agent speaks. Never robotic or translated-sounding. Marathi is mandatory in Maharashtra (Pune/Mumbai) — treat it as a native tongue, not a fallback.
- Hindi/Marathi distinction: Marathi uses आहे/आहात, मला, हवंय, का / aahe, mala, pahije, nako; Hindi uses है/हैं, मुझे, चाहिए, क्या / hai, mujhe, chahiye. Never mix Hindi into a Marathi reply or vice-versa.
- You already ask language preference in the greeting. If they respond in a language without being asked, mirror it immediately.
- IF THE LEAD SEEMS TO BE STRUGGLING in English, politely offer to switch: "तुम्हाला मराठीत बोलणं सोपं जाईल का?" / "क्या हिंदी में बात करना आसान रहेगा?" — make it easy and warm.
- Never switch languages mid-conversation unless they explicitly do so.

HONESTY — NEVER claim to do something you cannot actually do:
- ${ctx.canSendPhotos
  ? `PHOTOS: You CAN share photos for a property that shows "MEDIA AVAILABLE" in the inventory. If the lead asks to see photos of such a property, say ONLY a short friendly line like "Sure, let me share the photos with you!" or "Haan, photos bhejta hun!" — use "I" or "team", NEVER say "system". The actual image files are attached and sent automatically right after your message — you do NOT represent them in text. NEVER write placeholders like "[photo]", "[image]", "[photo] Lodha", or any bracketed/markdown image tag — that is broken-looking and must never appear in your reply. Just write the one friendly sentence and stop. For a property WITHOUT "MEDIA AVAILABLE" in the inventory, or for floor plans / brochures / files / emails, you CANNOT send those: say so honestly and offer to have the team arrange them or invite a visit.`
  : `You CANNOT send photos, floor plans, brochures, files, or emails. NEVER say "I've sent..." / "sharing now" / "check your email". If asked, say they aren't available in chat and offer to have the team arrange them or invite a visit.`}
- NEVER use the word "system" when talking to the lead. You are a person, not a system. Say "I" or "our team" instead.
- You CANNOT personally call anyone. If they ask to be called: say "I'll have ${agent.name || 'our agent'} call you" — confirm you've passed the request on. (The team alerts the agent.)
- WHEN THE LEAD ASKS TO SPEAK TO A HUMAN / wants the agent's contact / "kisi se baat karni hai" / "agent ka number do": SHARE THE AGENT'S DETAILS directly and warmly:
  • Name: ${agent.name || 'our property advisor'}${agent.agency_name ? ` (${agent.agency_name})` : ''}
  • Phone: ${agent.phone || 'will be shared by the team'}
  • Available: ${agent.office_open || '09:00'} to ${agent.office_close || '19:00'}
  Give the name and number plainly (e.g. "You can reach ${agent.name || 'our advisor'} directly on ${agent.phone || '—'}, available ${agent.office_open || '9 AM'}–${agent.office_close || '7 PM'}."). Only share the phone number if it is shown above (not "—"); if missing, say the team will share it shortly. Then continue helping.
- NEVER invent an office address, exact location, phone number, or Maps link. If you don't have it, say the team will share the exact location when confirming the visit.
- If you don't know something: "Let me check with the team and get back to you."

HANDLING UNKNOWNS & AMBIGUITY (never guess, never fabricate):
- If a detail isn't in your inventory (exact possession date, precise locality/landmark, floor plan, carpet vs built-up area, legal/loan specifics): say so honestly and offer to get it — "Let me confirm that with the team and get right back to you." Give what you DO know first, then flag the gap. Never invent a value, and never let a missing detail stall the conversation. (The system flags these so the agent can follow up.)

PROTECT THE BUSINESS:
- If someone seems to be a broker/competitor rather than a genuine buyer (says they're an agent/dealer, asks what software/CRM powers you, or wants your full list or lowest price to "compare"): stay warm and professional, but do NOT dump the entire inventory or your best pricing. Gently invite them to share what they're genuinely looking for, and keep specifics light.

ABSOLUTE RULES:
- BE CONCISE AND TO THE POINT. Short WhatsApp-style messages (usually 1-3 sentences, under ~50 words). No filler, no rambling. Sharing property details is the only time you go longer — and even then, keep it tight.
- ONE message at a time. One question or next step.
- NEVER fabricate property details, prices, availability, or terms.
- PRICES AND FACTS ARE SACRED: when quoting a price, size, or location, COPY THE EXACT FIGURE from the property list in this prompt — re-read the list before answering any price question. If the property or its price is not in the list, say you'll confirm with the team. NEVER quote a number from memory or estimate one.
- THE PROPERTY LIST IS THE COMPLETE INVENTORY. If one property matches, that IS the property they mean — answer about it directly. Never imply other options exist ("we have several...") unless they are actually in the list.
- GUIDE toward a visit when the moment is right, but NEVER pester. If they're not ready, back off gracefully and nurture — pushing irritates and loses them.
- NEVER schedule a visit outside the agent's OFFICE HOURS (${agent.office_open} to ${agent.office_close}). Offer an in-hours alternative instead.
${ctx.reschedulingLocked ? `- RESCHEDULING IS LOCKED for this lead: they have already changed the visit time 3+ times, so a human teammate is now personally coordinating the final time by phone. Do NOT agree to book, change, or confirm any visit time, and NEVER output appointment_booked_time. If they ask about timing, warmly remind them the team will call to settle it. Answer all their OTHER questions completely normally.` : ''}

PROPERTY DETAILS FORMAT — when sharing a property, present it clean and scannable:
🏡 *[Title]*
📍 [Location]
🛏️ [BHK] · 📐 [sqft] · 💰 [Price]
🗓️ [Possession status — e.g. "Ready to move" or "Under construction, possession by Jun 2026"]
✨ [Amenities — list ALL key ones from inventory, e.g. "Gym · Pool · East-facing · Clubhouse"]
📌 [HIGHLIGHTS if any — quote from the HIGHLIGHTS field in inventory]
Then one short conversational line ("Great for a family looking for X") + a gentle next step.
— ONLY include 🗓️ line if possession_status is in inventory. ONLY include 📌 if HIGHLIGHTS exist.
— If details (sqft, amenities) are missing from inventory, skip that line rather than guessing.

${buildFewShotExamples(stage, activeLang as string)}
RESPONSE FORMAT — return EXACTLY this structure:
[Your WhatsApp message here]
{"score":7,"temperature":"warm","intent":"buy","areas":["Baner"],"budget_min":5000000,"budget_max":9000000,"timeline":"within_3_months","name":"Rahul","stage":"presentation","matched_property_id":"uuid","appointment_booked_time":"2026-06-05T10:00:00Z","appointment_status":"upcoming"}

Rules for JSON:
- score: 1-10 (1=cold, 10=ready to buy today)
- temperature: "hot" (8-10), "warm" (5-7), "cold" (1-4), "new" (first contact)
- budget_min/budget_max: EXACT amount in plain rupees, copied from what the lead said — never rescale. "20,000 rent" → 20000. "1.2 crore" → 12000000. "95 lakh" → 9500000. For rentals this is the MONTHLY rent. Double-check the zeros.
- Only include fields you are confident about from THIS conversation
- matched_property_id: include ALWAYS when the conversation involves a specific property from inventory — whether you are recommending it, showing details, discussing photos, or answering questions about it. Copy the exact UUID from the PROPERTY INVENTORY above. If the lead asks for photos/details of a property you discussed earlier, include that property's ID again.
- appointment_booked_time: CRITICAL AND MANDATORY if you just confirmed an appointment time with the user. Must be a valid ISO 8601 string in Indian Standard Time (IST, UTC+05:30). For example, if the user says "5 PM tomorrow" and tomorrow is June 2nd, output "2026-06-02T17:00:00+05:30". Do NOT omit this if an appointment was agreed upon. Current IST time: ${ctx.currentTime}.
- appointment_status: Output "upcoming" if you booked/rescheduled a visit. Output "cancelled" if the user explicitly cancels their visit. Omit otherwise.
- lang: the language THIS lead is writing in — "hi" (Hindi), "mr" (Marathi), or "en" (English/Hinglish). Judge by their words (Marathi: आहे/मला/हवंय/का; Hindi: है/मुझे/चाहिए/क्या). This sets which language future reminders use, so be accurate.`
}

function isOfficeHours(openTime: string, closeTime: string): boolean {
  // Agent office hours are IST; the server runs in UTC — compare in IST.
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  const cur = istNow.getUTCHours() * 60 + istNow.getUTCMinutes()
  return cur >= openH * 60 + openM && cur <= closeH * 60 + closeM
}

// ─── Server-side language detector ───────────────────────────────────────────
// Runs BEFORE the LLM so we can inject a hard language directive into the
// prompt. The LLM's own `lang` JSON field is still used to persist the result,
// but we don't rely on it for the current turn. This fixes the Marathi-in-
// Latin-letters soft spot: GLM-4.5-Flash sometimes replies English when a lead
// writes "mala flat pahije" because it can't confidently identify romanized
// Marathi. We detect it here and make the directive mandatory.
//
// Priority order: current message signals > stored lead.language > null
export function detectMessageLanguage(
  text: string,
  storedLang?: string | null
): 'en' | 'hi' | 'mr' | null {
  const hasDevanagari = /[ऀ-ॿ]/.test(text)

  if (hasDevanagari) {
    // \b does not work with Devanagari (Unicode non-word chars) — use plain chars.
    // Marathi-specific morphemes: आहे, मला, हवंय, पाहिजे, नको, आम्ही, etc.
    if (/आहे|आहात|नाही|हवंय|हवी|हवा|पाहिजे|नको|मला|आम्ही|तुम्ही|घ्या|सांग|बघ|येतो|येते/.test(text)) return 'mr'
    // Hindi-specific morphemes: है, हैं, था, मुझे, चाहिए, क्या, नहीं, etc.
    if (/है|हैं|था|थे|मुझे|चाहिए|क्या|नहीं|करना|करें/.test(text)) return 'hi'
    // Devanagari present but ambiguous → trust stored language
    return (storedLang === 'mr' || storedLang === 'hi') ? storedLang as 'hi' | 'mr' : null
  }

  const lower = text.toLowerCase()

  // ── Marathi-in-Latin markers (words with NO Hindi equivalent / distinct form)
  const marathiLatin: RegExp[] = [
    /\bpahije\b/,                      // पाहिजे — want/need (Hindi: chahiye)
    /\bhava\b|\bhavi\b/,               // हवा/हवी — want (Hindi: chahiye/chahti)
    /\baahe\b|\bahe\b/,                // आहे — is/am/are (Hindi: hai)
    /\bnaahi\b/,                       // नाही — not (distinct Marathi spelling vs Hindi "nahi")
    /\bmala\b/,                        // मला — to me / I want (Hindi: mujhe)
    /\bamhi\b|\baamhi\b/,              // आम्ही — we (Hindi: hum)
    /\bnako\b/,                        // नको — don't want (no Hindi equivalent)
    /\btumhi\b/,                       // तुम्ही — you (respectful) (Hindi: aap)
    /\btula\b/,                        // तुला — to you (Hindi: tumhe/tujhe)
    /\bsangto\b|\bsangte\b/,          // सांगतो/सांगते — tells/says
    /\byeto\b|\byete\b/,               // येतो/येते — comes
    /\bkasa\b|\bkashi\b|\bkase\b/,    // कसा/कशी/कसे — how (Marathi form)
    /\bkonach[ai]\b/,                  // कोणाचा/ची — whose
    /\bghyaych/,                       // घ्यायचं — to take/get
    /\bpahaych|\bpahach/,              // पाहायचं — to see/visit
    /\btyach[ai]\b|\btyanch[ai]\b/,   // त्याची/त्यांची — his/their (Marathi genitive)
    /\baplya\b|\bapla\b|\bapli\b/,    // आपला/आपली — our/your (Marathi)
    /\bkadhich\b|\bkadhich\b/,        // कधीच — never/ever (Marathi adverb)
    /\bbaghto\b|\bbaghte\b|\bbaghtoy\b/, // बघतो — looks/sees
  ]
  if (marathiLatin.some(r => r.test(lower))) return 'mr'

  // ── Hindi-in-Latin markers (words with NO Marathi equivalent / distinct form)
  const hindiLatin: RegExp[] = [
    /\bchahiye\b|\bchahie\b/,          // चाहिए
    /\bmujhe\b|\bmujhko\b/,            // मुझे
    /\bhain\b/,                        // हैं (plural है)
    /\baapko\b/,                       // आपको
    /\btumhara\b|\btumhari\b|\btumhe\b/, // तुम्हारा / तुम्हें
    /\bbilkul\b/,                      // बिल्कुल
    /\btheek\s*hai\b|\btheek\b/,       // ठीक है
    /\byaar\b/,                        // यार
    /\bhaan\b/,                        // हाँ
    /\bzaroor\b/,                      // ज़रूर
    /\bkaro\b|\bkarein\b/,             // करो/करें
    /\bkya\s+hai\b|\bkya\s+hua\b/,    // क्या है / क्या हुआ
    /\bnahi\s+hai\b|\bnahi\s+tha\b/,  // नहीं है / था (Hindi negation pattern)
    /\bbahut\b/,                       // बहुत
    /\bjaldi\b/,                       // जल्दी
  ]
  if (hindiLatin.some(r => r.test(lower))) return 'hi'

  // Nothing conclusive in the current message → trust the stored language
  // (lead may send "ok" or "sure" mid-Marathi-conversation — we must not
  // reset to English just because the current message is ambiguous)
  if (storedLang === 'mr' || storedLang === 'hi') return storedLang as 'hi' | 'mr'

  return null
}

export async function generateBotReply(
  agentId: string,
  leadId: string,
  incomingMessage: string
): Promise<{ reply: string; metadata: any }> {

  const [agentRes, leadRes, propertiesRes, messagesRes, rescheduleRes] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
    supabaseAdmin.from('messages').select('direction, content, sent_by').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(14),
    supabaseAdmin.from('activity_log').select('*', { count: 'exact', head: true }).eq('lead_id', leadId).eq('title', 'Site visit rescheduled by AI')
  ])

  const agent = agentRes.data as any
  const lead = leadRes.data as any
  const properties = propertiesRes.data || []
  const recentMessages = (messagesRes.data || []).reverse()

  if (!agent) throw new Error('Agent not found')
  if (!lead) throw new Error('Lead not found')

  const messageCount = recentMessages.length
  const stage = detectStage(lead, messageCount)

  // Server-side filter: the LLM only ever sees properties that already match
  // the lead's known intent/areas/budget, so it can't recommend a mismatch.
  const filteredProperties = filterPropertiesForLead(properties, lead)

  // Server-side language detection — runs before the LLM so we can inject a
  // hard directive. Uses the current message + stored lead.language as fallback.
  const detectedLang = detectMessageLanguage(incomingMessage, lead.language)

  const ctx = {
    agent,
    lead,
    properties: filteredProperties,
    currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isOfficeHours: isOfficeHours(agent.office_open, agent.office_close),
    // 3+ AI reschedules → a human is coordinating the final time; the bot must
    // stop touching the appointment (mirrors the webhook's hard guard).
    reschedulingLocked: (rescheduleRes.count ?? 0) >= 3,
    detectedLang,
    incomingMessage,
    // Photo sending is gated until the MSG91 media format is verified live.
    canSendPhotos: process.env.MSG91_MEDIA_LIVE === 'true',
  }

  const systemPrompt = buildEnginePrompt(ctx, stage, messageCount)
  console.log(`[engine] stage=${stage} lang=${detectedLang} prompt≈${Math.round(systemPrompt.length / 4)}tok`)

  // Build conversation history — exclude the LAST message (the one we just inserted).
  // 12 messages gives ~3-4 rounds of context without meaningfully bloating the prompt.
  const historyMessages = recentMessages.slice(0, -1).slice(-12)

  // Convert to OpenAI chat format
  const chatHistory: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of historyMessages) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant'
    const text = (m.content || '').toString()
    if (!text.trim()) continue
    // Skip photo/media placeholder rows ("[photo] Title") — these are DB markers
    // for images we sent, NOT real text. If fed back, the model imitates them and
    // writes literal "[photo] Title" into its reply. The images are sent by the
    // webhook automatically; the model must never see or echo these markers.
    if (isMediaPlaceholder(text)) continue
    const last = chatHistory[chatHistory.length - 1]
    if (last && last.role === role) {
      last.content += '\n' + text
    } else {
      chatHistory.push({ role, content: text })
    }
  }

  // ─── Generate reply via GLM (fast attempt + auto-retry) ──────────────────
  const responseText = await callEngineLLM(systemPrompt, chatHistory, incomingMessage)
  if (!responseText) throw new Error('Engine LLM returned empty')

  const result = parseEngineResponse(responseText, stage)

  // The LLM was only shown filteredProperties — if it claims a property ID
  // outside that set, it hallucinated. Discard the field rather than letting
  // the webhook look up (or send photos for) a property the lead never asked
  // about, and alert so we can see how often this happens in production.
  const matchedId = result.metadata?.matched_property_id
  if (matchedId && !isValidMatchedProperty(matchedId, filteredProperties)) {
    Sentry.captureMessage('Engine recommended property outside filtered set', {
      level: 'warning',
      extra: { agentId, leadId, matchedId, stage, filteredCount: filteredProperties.length },
    })
    delete result.metadata.matched_property_id
  }

  // Last line of defense: every rupee figure the LLM just wrote must match a
  // real property in the agent's inventory (within 5% tolerance). Checked
  // against the FULL inventory, not just filteredProperties — the ground
  // truth is "does this price exist anywhere," not "was it in what we showed."
  const validation = validateReply(result.reply, properties)
  if (!validation.valid) {
    Sentry.captureMessage('Reply contained a price not found in inventory', {
      level: 'warning',
      extra: { agentId, leadId, stage, quotedPrice: validation.price, reply: result.reply },
    })
    result.reply = "Let me double-check the exact pricing on that and get back to you in a moment!"
  }

  return result
}

// ─── Proactive follow-up nudge (the lead went quiet) ─────────────────────────
// Composes ONE short, NEW, value-adding re-engagement message from the full
// conversation context. Used by the nurture cron for in-window touches at
// 3h / 10h / 23h. Returns just the WhatsApp text (no JSON metadata).
// `intensity` shapes tone: 'soft' (early), 'value' (mid), 'window_save' (last).
export async function generateNudge(
  agentId: string,
  leadId: string,
  intensity: 'soft' | 'value' | 'window_save' = 'soft'
): Promise<string> {
  const [agentRes, leadRes, propertiesRes, messagesRes] = await Promise.all([
    supabaseAdmin.from('agents').select('*').eq('id', agentId).single(),
    supabaseAdmin.from('leads').select('*').eq('id', leadId).single(),
    supabaseAdmin.from('properties').select('*').eq('agent_id', agentId).eq('status', 'active'),
    supabaseAdmin.from('messages').select('direction, content, sent_by').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(14),
  ])
  const agent = agentRes.data as any
  const lead = leadRes.data as any
  if (!agent || !lead) throw new Error('Agent or lead not found')
  const properties = propertiesRes.data || []
  const recentMessages = (messagesRes.data || []).reverse()
  const messageCount = recentMessages.length
  const stage = detectStage(lead, messageCount)
  const filteredProperties = filterPropertiesForLead(properties, lead)

  const ctx = {
    agent, lead, properties: filteredProperties,
    currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isOfficeHours: isOfficeHours(agent.office_open, agent.office_close),
    reschedulingLocked: false,
    // Nudges have no incoming message — rely on stored language only.
    detectedLang: (lead.language === 'mr' || lead.language === 'hi') ? lead.language as 'mr' | 'hi' : null,
    incomingMessage: '',
    canSendPhotos: false, // nudges never send photos
  }
  const systemPrompt = buildEnginePrompt(ctx, stage, messageCount)

  const chatHistory: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of recentMessages.slice(-12)) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant'
    const text = (m.content || '').toString()
    if (!text.trim()) continue
    if (isMediaPlaceholder(text)) continue  // never feed "[photo] Title" markers back
    const last = chatHistory[chatHistory.length - 1]
    if (last && last.role === role) last.content += '\n' + text
    else chatHistory.push({ role, content: text })
  }

  const langLabel = lead.language === 'mr' ? 'Marathi' : lead.language === 'hi' ? 'Hindi/Hinglish' : 'English'
  const langRule = lead.language && lead.language !== 'en'
    ? `MANDATORY: Reply in ${langLabel} — this is the lead's language. Do NOT switch to English.`
    : 'Reply in English (or Hinglish if the lead was writing Hindi).'

  const intensityGuide = intensity === 'window_save'
    ? `This is the LAST chance today — the 24-hour window closes soon. Make it count: one warm message with a single easy question they can answer in one tap (e.g. "Saturday or Sunday?"). Don't sound desperate.`
    : intensity === 'value'
      ? `Mid-conversation check-in. Add ONE piece of genuine new value: a property detail you haven't mentioned, a fresh angle on their criteria, or a useful market fact. Then one soft question to pull them back.`
      : `Early soft touch — they just went quiet. One friendly line that references where you left off. No pressure, no pitch. Think: "Hey, just picking up where we left off."`

  // Post-visit leads need a very different nudge — they've already visited, so
  // the goal is deal conversion, NOT re-engagement with a property search.
  const stageOverride = stage === 'post_visit'
    ? `IMPORTANT — this lead ALREADY VISITED a property. Do NOT invite them to see something or ask about property search. Instead, ask how they felt about the visit, whether they're ready for the next step, or gently uncover any remaining hesitation. Goal: convert visit → deal, not re-engage.`
    : stage === 'nurture'
      ? `This lead has gone quiet for a while. Keep it warm and brief — offer a specific new property or a genuine market update as a hook. No pressure.`
      : null

  // If the lead was matched to a specific property, name it in the context so the
  // nudge can reference it concretely instead of a generic area/type.
  const matchedPropId = lead.metadata?.matched_property_id
  const matchedProp: any = matchedPropId ? properties.find((p: any) => p.id === matchedPropId) : null
  const propContext = matchedProp
    ? `Last recommended: ${matchedProp.title} (${matchedProp.location}, ₹${((matchedProp.price||0)/100000).toFixed(0)}L${matchedProp.possession_status ? `, ${matchedProp.possession_status === 'ready_to_move' ? 'ready to move' : 'under construction'}` : ''})`
    : `Properties available: ${properties.slice(0, 3).map((p: any) => `${p.title} (${p.location}, ₹${p.type === 'rental' ? `${(p.rent_per_month||p.price||0).toLocaleString('en-IN')}/mo` : `${((p.price||0)/100000).toFixed(0)}L`})`).join(' | ') || 'none'}`

  const nudgeInstruction = `You are a follow-up specialist for a real estate WhatsApp bot. Write ONE re-engagement message.

CONTEXT:
- Agency: ${agent.agency_name}
- Lead: ${lead.name || 'unknown'} | Intent: ${lead.intent || '?'} | Areas: ${(lead.preferred_areas || []).join(', ') || '?'} | Budget: ${lead.budget_min ? `₹${(lead.budget_min/100000).toFixed(0)}L+` : '?'} | Score: ${lead.ai_score || 0}/10
- Stage: ${stage}${lead.post_visit_result ? ` | Visit outcome: ${lead.post_visit_result}` : ''}
- ${propContext}

TASK: ${stageOverride || intensityGuide}

HARD RULES:
1. Do NOT start with "Hi" or "Hello" — you are mid-conversation.
2. Do NOT repeat or rephrase anything already said above.
3. One message only. Under 40 words. No filler phrases.
4. ${langRule}
5. If there is genuinely nothing new to say (no properties, no new angle), reply with exactly the word: SKIP
6. Output ONLY the message text. No JSON. No quotes. No preamble.

EXAMPLE NUDGE (en, value intensity, presentation stage):
"By the way — that Baner 2BHK I mentioned has been getting good interest this week. Worth a quick look this weekend before it goes?"

EXAMPLE NUDGE (hi/Hinglish, soft intensity, presentation stage):
"Baan mein property search kaisa chal raha hai? Koi naya option aaya hai jo aapki requirement se match karta hai — share karun?"

EXAMPLE NUDGE (mr, soft intensity, discovery stage):
"Flat search madhye kaahi update aahe ka? Baner madhe changli property aali ahe — details pathvau ka?"

EXAMPLE NUDGE (en, post_visit stage, value intensity):
"Just checking in after your visit — what did you think overall? Even a quick gut reaction helps me find you something even better if needed."

EXAMPLE NUDGE (window_save, en):
"One last thing before I sign off — would Saturday morning or Sunday at 11 work for a quick visit? Just one tap to confirm 😊"`

  const text = await callEngineLLM(systemPrompt, chatHistory, nudgeInstruction)
  const cleaned = (text || '').trim().replace(/^["']|["']$/g, '').trim()
  if (!cleaned || /^SKIP$/i.test(cleaned)) return ''
  // Strip any stray JSON the model may append despite instructions.
  return parseEngineResponse(cleaned, stage).reply || cleaned
}

// Split the model output into the WhatsApp reply + trailing metadata JSON.
// Tolerant of model formatting drift: code fences around the JSON, multi-line
// JSON, or extra blank lines. If the JSON is malformed we keep the reply and
// just skip the metadata — losing a score must never lose the message.
export function parseEngineResponse(responseText: string, stage: ConversationStage): { reply: string; metadata: any } {
  // Strip markdown code fences (models often wrap the JSON in ```json ... ```)
  let text = responseText.trim().replace(/```(?:json)?/gi, '').trim()
  let reply = text
  let metadata: any = { stage }

  // The metadata object is the LAST {...} block in the output. Scan candidate
  // '{' positions from the end and take the first substring that parses.
  for (let i = text.lastIndexOf('{'); i >= 0; i = i > 0 ? text.lastIndexOf('{', i - 1) : -1) {
    const candidate = text.slice(i).trim()
    if (!candidate.endsWith('}')) continue
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = { ...parsed, stage }
        reply = text.slice(0, i).trim()
      }
      break
    } catch (e) {
      // Not valid JSON from this position — try an earlier '{' (handles nested
      // braces and emoji-adjacent braces in the reply text itself).
    }
  }

  if (!reply) throw new Error('Engine returned reply with no text content')

  // Safety net: strip any leaked media placeholders the model may have written
  // (e.g. "[photo] Lodha", "[image]"). The real images are sent separately by
  // the webhook; these markers must never reach the lead. Also markdown images.
  reply = reply
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                                            // ![alt](url)
    // "[photo] Lodha" — the title sits OUTSIDE the brackets in our DB format, so
    // also consume trailing text up to the next "[" or end of line.
    .replace(/\[(?:photo|image|video|media|file|attachment)\b[^\]]*\][^[\n]*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')                                                      // collapse double spaces
    .replace(/[ \t]+\n/g, '\n')                                                      // trim trailing spaces on lines
    .replace(/\n{3,}/g, '\n\n')                                                      // collapse blank runs
    .trim()

  if (!reply) throw new Error('Engine returned reply with no text content after sanitising')

  return { reply, metadata }
}
