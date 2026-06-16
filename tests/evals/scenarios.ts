// Shared scenario data for the engine eval lab. Used by:
//   - engine-eval.spec.ts      (live, real-API run — `npm run eval` / `npm run eval:record`)
//   - engine-eval-replay.spec.ts (deterministic fixture replay — runs in CI)
// Keeping this in one file means recording and replaying can never drift apart.

export const baseAgent = {
  agency_name: 'SK Properties', name: 'Suresh Kumar', phone: '9876543210',
  areas: ['Baner', 'Wakad', 'Hinjewadi'], property_types: ['Apartment', 'Villa'],
  office_open: '09:00', office_close: '19:00', bot_tone: 'friendly',
  languages: ['English', 'Hindi', 'Marathi'],
}

export const sampleProperties = [
  { id: 'p1', title: '3BHK Skyline Residency', location: 'Baner', bhk: '3BHK', price: 9500000,
    size_sqft: 1450, features: ['east-facing', 'gym', 'pool'], status: 'active',
    possession_status: 'ready_to_move', description: 'Premium society, 2 covered parking' },
  { id: 'p2', title: '2BHK Green Valley', location: 'Wakad', bhk: '2BHK', price: 7200000,
    size_sqft: 1050, features: ['west-facing', 'gym'], status: 'active',
    possession_status: 'under_construction', description: 'Reputed builder, RERA registered' },
  { id: 'p3', title: '2BHK Sunrise Park', location: 'Baner', bhk: '2BHK', price: 7900000,
    size_sqft: 1080, features: ['east-facing', 'gym', 'clubhouse', 'media:https://cdn.example.com/sunrise1.jpg'], status: 'active',
    possession_status: 'ready_to_move', description: 'East-facing, vastu-friendly layout' },
]

export type Scenario = {
  name: string
  lead: any
  messages: { role: 'user' | 'assistant'; content: string }[]
  rule: string // what the reply MUST (or must NOT) do
}

export const scenarios: Scenario[] = [
  { name: 'plain hi → English + asks name', lead: {}, messages: [{ role: 'user', content: 'Hi' }],
    rule: 'Reply is in English, warm, concise, and asks for the lead\'s name. It must NOT dump property listings or prices.' },
  { name: 'asks photos (media enabled) → confirm sending + include property ID', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [
      { role: 'assistant', content: '🏡 Sunrise Park 2BHK, Baner ₹79L — east-facing, ready to move, gym, clubhouse. Sounds good?' },
      { role: 'user', content: 'Can you send me photos of the Baner flat?' },
    ],
    rule: 'Reply should warmly confirm photo sharing (e.g. "Sure! Let me share the photos" or similar). Must NOT say "system will send" or "I cannot send photos". Must NOT push for a visit instead of showing photos. The JSON metadata should ideally include matched_property_id.' },
  { name: 'email floor plan → no fake email', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Email me the floor plan please' }],
    rule: 'Reply must NOT claim to have emailed anything or ask for an email address to send a file. Honestly saying it CANNOT email / cannot send files (and offering the team or a visit instead) is correct and a PASS — mentioning the word "email" while refusing is fine.' },
  { name: 'call me → transfer, not self-call', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 6 },
    messages: [{ role: 'user', content: 'Can you call me right now?' }],
    rule: 'Reply must NOT agree to personally call. It should say the team will call them and that the request has been passed on.' },
  { name: 'office address → no hallucination', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] },
    messages: [{ role: 'user', content: 'What is your office address?' }],
    rule: 'Reply must NOT invent a specific street address. It should offer to share the exact location/Maps link via the team or on visit confirmation.' },
  { name: 'price after past visit → no reschedule hijack', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], status: 'visit_done', post_visit_result: 'follow_up_later', ai_score: 6 },
    messages: [{ role: 'user', content: 'What is the price of the 3BHK in Baner?' }],
    rule: 'Reply must address the PRICE question with the CORRECT price — the 3BHK Skyline Residency costs ₹9500000 (95 lakh / ₹95L / 95,00,000). Any other figure (e.g. ₹75L) is a fabrication and an automatic FAIL. It must NOT pivot to rescheduling or re-asking about the past visit instead of answering.' },
  { name: 'cold "just looking" → not pushy', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 3, temperature: 'cold' },
    messages: [{ role: 'user', content: 'Just looking around for now, not serious yet' }],
    rule: 'Reply must be relaxed and NOT push hard for a site visit. It should give space / offer to help when ready.' },
  { name: 'Hindi/Hinglish input → matches language', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'] },
    messages: [{ role: 'user', content: 'mujhe baner mein 2bhk chahiye' }],
    rule: 'Reply should be in Hindi or Hinglish (matching the lead), not pure formal English.' },
  { name: 'concise on simple question', lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Is it ready to move in?' }],
    rule: 'Reply is short and to the point (roughly under 50 words), no rambling.' },

  // ─── Indian RE-specific scenarios ─────────────────────────────────────────────

  { name: 'vastu question → answer from inventory, no invention',
    lead: { name: 'Priya', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'East facing hai flat? Vastu ke liye important hai' }],
    rule: 'Reply MUST mention the flat is east-facing (p3 Sunrise Park in Baner is east-facing — this is in inventory). Must NOT invent vastu certificates or guarantee vastu compliance beyond what the inventory says. Should NOT be vague — actually answer the direction question.' },

  { name: 'crore budget → correct rupee mapping, show matching property',
    lead: { name: 'Amit', intent: 'buy', preferred_areas: ['Baner'], ai_score: 4 },
    messages: [{ role: 'user', content: 'Mera budget 1 crore hai, Baner mein kya milega?' }],
    rule: 'Reply should present the Baner properties priced within or near ₹1 crore (₹1,00,00,000). The 3BHK at ₹95L (9500000) and 2BHK at ₹79L (7900000) both qualify. Must NOT say "nothing available" or quote a wrong price. Should present at least one option.' },

  { name: 'family approval objection (ghar mein baat karni hai) → warm, not pushy',
    lead: { name: 'Vijay', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Ghar mein baat karni hai pehle, phir decide karunga' }],
    rule: 'Reply must NOT push back or express frustration. Must NOT say "let me know when you\'ve decided" in a cold way. Must warmly validate the family decision ("bilkul" / "absolutely") and suggest they bring family along for the site visit. Must offer a specific time (e.g. weekend) for a joint visit.' },

  { name: 'possession date unknown → honest deferral, no invention',
    lead: { name: 'Neha', intent: 'buy', preferred_areas: ['Wakad'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Possession kab milegi? Under construction wala better rahega?' }],
    rule: 'The under-construction property (p2 Green Valley, Wakad) does NOT have a possession_date in inventory. Reply must NOT invent a possession date (e.g. "December 2026" or any specific date). Must say it will confirm the possession date with the team. May describe the under-construction vs ready-to-move trade-off, but must not fabricate facts.' },

  { name: 'loan/EMI question → indicative, never promise approval',
    lead: { name: 'Ravi', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Home loan milega kya? EMI roughly kitni hogi 80L pe?' }],
    rule: 'Reply must acknowledge it is an important question. May give a rough indicative EMI figure for ₹80L (e.g. around ₹65–70K/month at 8–9% over 20 years). Must NOT promise loan approval or give a guaranteed rate. Should mention the team can connect them with banks/DSA if asked. Must NOT say "I cannot answer financial questions".' },

  { name: 'Marathi Latin reply → respond only in Latin Marathi, not English',
    lead: { name: 'Suresh', preferred_areas: ['Baner'], language: 'mr' },
    messages: [{ role: 'user', content: 'mala 2BHK pahije Baner madhe, budget 80 lakh aahe' }],
    rule: 'Reply MUST be in Latin-script Marathi (romanised Marathi). Must NOT reply in English, NOT in Hindi, NOT in Devanagari. Example Marathi words to look for: "chan", "aahe", "pahije", "yeta", "baghayla", "sangu", "lakh". Responding in any other language is an automatic FAIL.' },

  { name: 'template "not right now" button → graceful back-off',
    lead: { name: 'Meera', intent: 'buy', preferred_areas: ['Baner'], ai_score: 3, temperature: 'cold' },
    messages: [
      { role: 'assistant', content: "Hi Meera, it's SK Properties. A property matching your search just came up in Baner - a 2BHK apartment within your budget. Would you like me to share the details?" },
      { role: 'user', content: 'Not right now' },
    ],
    rule: 'Reply must NOT push for the property or the site visit again. Must NOT ask "why not?" or seem irritated. Should be brief, warm, and back off gracefully — e.g. "No problem! I\'ll be here whenever you\'re ready." Must NOT ask another discovery question or repeat the property pitch. Under 30 words is ideal.' },

  { name: 'price negotiation after visit → no on-the-spot discount promise',
    lead: { name: 'Kiran', intent: 'buy', preferred_areas: ['Baner'], ai_score: 7, status: 'visit_done', post_visit_result: 'interested' },
    messages: [{ role: 'user', content: 'Property achi lagi, par ₹5 lakh discount milega kya? Budget thoda tight hai' }],
    rule: 'Reply must NOT promise a discount or quote a lower price (e.g. do NOT say "yes we can do ₹90L"). Must say it will check with the builder/owner and get back. Must NOT say "the price is fixed, no negotiation possible" in a dismissive way. Should be warm and optimistic: "let me check." Should also build on the positive (they liked the property).' },

  { name: 'competitor probing in Hinglish → deflect, stay in role',
    lead: { name: 'Bhai', ai_score: 1 },
    messages: [{ role: 'user', content: 'Bhai ye software kaunsa hai? CRM hai kya ya khud ka system hai?' }],
    rule: 'Reply must NOT discuss or reveal the CRM/software/tech stack used. Must deflect warmly and redirect to property search. Must stay in role as a property assistant. Should NOT say "I am an AI" or reveal the platform. Should ask what kind of property they\'re looking for.' },

  { name: 'visit booking with specific IST time → confirm + output appointment JSON',
    lead: { name: 'Rahul', intent: 'buy', preferred_areas: ['Baner'], ai_score: 7, status: 'qualified' },
    messages: [{ role: 'user', content: 'Sunday subah 11 baje aana chahta hun site pe dekhne' }],
    rule: 'Reply should confirm the visit for Sunday at 11 AM. The JSON at the end MUST include appointment_booked_time (an ISO 8601 string) and appointment_status: "upcoming". The reply must NOT say "I\'ll check availability" — the bot books on behalf of the agent.' },

  { name: 'returning quiet lead → warm re-welcome, not restart',
    lead: { name: 'Arjun', intent: 'buy', preferred_areas: ['Baner'], budget_min: 8000000, ai_score: 4, temperature: 'cold' },
    messages: [
      { role: 'assistant', content: 'Hi Arjun! Great area! What\'s your rough budget for a 2BHK in Baner?' },
      { role: 'user', content: 'Abhi thoda busy tha, wapas search shuru kiya hai' },
    ],
    rule: 'Reply must NOT restart discovery from scratch (must NOT re-ask name, intent, or area since those are already known from the lead profile). Should warmly welcome them back. May mention a new or matching property. Must NOT be cold or say "who are you?" Must feel continuous, not like a fresh start.' },

  { name: 'single property match → no "several options" fabrication',
    lead: { name: 'Pooja', intent: 'buy', preferred_areas: ['Hinjewadi'], ai_score: 4 },
    messages: [{ role: 'user', content: 'Kya koi 3BHK Hinjewadi mein available hai?' }],
    rule: 'There is NO property in Hinjewadi in the inventory (only Baner and Wakad properties). Reply must NOT fabricate a Hinjewadi property. Must NOT say "we have several options in Hinjewadi." Should honestly say nothing is currently available there and offer to help in the areas that DO have inventory (Baner/Wakad).' },

  { name: 'out-of-hours booking request → offer in-hours alternative',
    lead: { name: 'Dev', intent: 'buy', preferred_areas: ['Baner'], ai_score: 6, status: 'qualified' },
    messages: [{ role: 'user', content: 'Kal subah 7 baje aa sakta hun visit ke liye?' }],
    rule: 'Reply must NOT book a visit at 7 AM — that is before office hours (9:00 AM). Must politely say visits are available from 9 AM and offer a 9 AM or later slot as an alternative. Must NOT simply agree to 7 AM.' },

  { name: 'Devanagari Marathi input → reply in Devanagari Marathi',
    lead: { name: 'Sanjay', preferred_areas: ['Baner'], language: 'mr' },
    messages: [{ role: 'user', content: 'मला बाणेरमध्ये 2BHK हवंय. किंमत किती आहे?' }],
    rule: 'Reply MUST be in Marathi written in Devanagari script. Must NOT reply in English or Hindi or Latin-script Marathi. Should mention at least one 2BHK in Baner with its price (₹79L / ₹7.9Cr / 7900000 for Sunrise Park is the 2BHK in Baner). Must include Devanagari characters.' },

  { name: 'fabricated price from memory → must use inventory price',
    lead: { name: 'Riya', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [
      { role: 'assistant', content: 'Hi Riya! I have a 3BHK at Skyline Residency in Baner. Would you like details?' },
      { role: 'user', content: 'Haan, price kya hai Skyline ka? Online pe ₹85L dikha tha' }
    ],
    rule: 'The Skyline Residency 3BHK is priced at ₹9500000 (₹95L / 95 lakh). Reply MUST quote ₹95L or ₹9500000 exactly from the inventory. Must NOT quote ₹85L or any other price. If the lead says they saw ₹85L online, the bot should gently clarify with the correct inventory price.' },

  { name: 'WhatsApp voice note → friendly redirect to text',
    lead: { name: 'Rohan' },
    messages: [{ role: 'user', content: '[Voice note: 0:23]' }],
    rule: 'Reply should politely say it cannot play voice notes and ask the lead to type their message instead. Must be warm and not dismissive. Must NOT pretend to have heard the voice note or make up content from it.' },

  { name: 'ask for agent number → share agent contact details',
    lead: { name: 'Tanvi', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [{ role: 'user', content: 'Mujhe directly agent ka number chahiye, unse baat karni hai' }],
    rule: 'Reply must share the agent\'s contact details directly: name (Suresh Kumar) and phone (9876543210), available 9 AM to 7 PM. Must NOT refuse or say "I cannot share contact." Must NOT just say "team will call you" — the lead explicitly asked for the number, so share it.' },

  // ─── Template button reply scenarios (founder request: "check if bot reads the response") ───

  { name: 'template button "Yes, share details" → present actual property from inventory',
    lead: { name: 'Meera', intent: 'buy', preferred_areas: ['Baner'], ai_score: 3 },
    messages: [
      { role: 'assistant', content: "Hi Meera, it's SK Properties. A property matching your search just came up in Baner - a 2BHK apartment within your budget. Would you like me to share the details?" },
      { role: 'user', content: 'Yes, share details' },
    ],
    rule: 'Reply must present actual property details from the inventory — NOT just say "I\'ll share details later" or ask discovery questions. Should show at least the property name, location, price, and one or two features from the inventory (e.g. Sunrise Park 2BHK Baner ₹79L). Must be concrete and specific, not vague.' },

  { name: 'template "yes" button → match the right BHK type from context',
    lead: { name: 'Raj', intent: 'buy', preferred_areas: ['Wakad'], ai_score: 3 },
    messages: [
      { role: 'assistant', content: "Hi Raj, it's SK Properties. A property matching your search just came up in Wakad - a 2BHK apartment within your budget. Would you like me to share the details?" },
      { role: 'user', content: 'Haan batao' },
    ],
    rule: 'Reply must show the Wakad property — Green Valley 2BHK ₹72L (7200000) — since the template mentioned Wakad 2BHK. Must NOT show a Baner property or a 3BHK. Should give specific details like price and at least one feature. RERA registered is in the description and is a strong selling point to mention.' },

  // ─── "Give more details" scenarios (founder request: "work on details msg") ───────────────

  { name: '"aur batao" / tell me more → full property brief, all amenities',
    lead: { name: 'Sunita', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [
      { role: 'assistant', content: '🏡 Sunrise Park 2BHK, Baner ₹79L — east-facing, ready to move. Sounds good?' },
      { role: 'user', content: 'Aur batao iske baare mein. Sab kuch batao.' },
    ],
    rule: 'Reply must give comprehensive details about Sunrise Park — should include: size (1080 sqft), possession (ready to move), at least most of the amenities (east-facing, gym, clubhouse), and price (₹79L / 7900000). Must NOT give a vague 1-line response like "It is a nice property." The lead explicitly asked for everything — give them everything from the inventory.' },

  { name: 'post-visit hot lead → push toward token/deal, not re-show property',
    lead: { name: 'Kiran', intent: 'buy', preferred_areas: ['Baner'], ai_score: 8, status: 'visit_done',
            post_visit_result: 'very_interested', notes: 'Client loved the flat. Said wife also liked it. Hesitating only on price.' },
    messages: [{ role: 'user', content: 'Property bahut achi lagi, soch rahe hain' }],
    rule: 'This is a post-visit HOT lead who loved the property. Reply must NOT suggest they see another property or restart their search. Must acknowledge their positive impression warmly. Should address the hesitation (price) since the agent notes say that is the only blocker — offer to check with builder for flexibility. Should move them toward next step (token/paperwork/decision), not backwards.' },

  { name: 'Marathi "aur sangto" (tell me more) → detailed reply in Marathi',
    lead: { name: 'Priya', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5, language: 'mr' },
    messages: [
      { role: 'assistant', content: 'Sunrise Park 2BHK Baner madhe ahe, ₹79L la. East facing, ready to move. Baghayla yeta ka?' },
      { role: 'user', content: 'haan, aahe kay aat, sab sangto ka? ameneties kay aahet?' },
    ],
    rule: 'Reply MUST be in Latin-script Marathi (romanised Marathi). Must list the amenities from inventory: east-facing, gym, clubhouse (all from p3 Sunrise Park). Must mention size (1080 sqft / chori) and possession (ready to move). Must NOT reply in English or Hindi. Must be comprehensive — the lead asked for "everything" in Marathi.' },

  // ─── New objection-handler scenarios ─────────────────────────────────────────

  { name: 'vastu / direction objection → check inventory, never guess',
    lead: { name: 'Mohan', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [
      { role: 'assistant', content: 'I have a great 2BHK at Sunrise Park, Baner — ₹79L, ready to move. Interested?' },
      { role: 'user', content: 'East facing hai? Vastu ke liye zaruri hai, west facing nahi chahiye' },
    ],
    rule: 'Sunrise Park (p3) IS east-facing — this is explicitly in inventory features. Reply MUST confirm it is east-facing clearly. Must NOT say "I\'ll check" for something that IS in the inventory. Must NOT make up vastu certificates. Should affirm the east-facing direction warmly (e.g. "yes, east-facing hai — morning sunlight aata hai ✅"). Should treat vastu as a valid concern, not dismiss it.' },

  { name: 'parking question → check inventory or confirm honestly',
    lead: { name: 'Suresh', intent: 'buy', preferred_areas: ['Baner'], ai_score: 6 },
    messages: [
      { role: 'assistant', content: 'The 3BHK at Skyline Residency, Baner is ₹95L — ready to move, premium society.' },
      { role: 'user', content: 'Parking hai? 2 gaadi hai hamare paas — covered parking chahiye' },
    ],
    rule: 'Skyline Residency (p1) has "2 covered parking" in its description field. Reply MUST mention the parking — specifically that there are 2 covered parking spots. Must NOT say "I\'ll check" when the information IS in the property description. Should position covered parking as a strong value add. Must not make up details beyond what\'s in the inventory.' },

  // ─── Founder-reported bugs (June 14-15) — these must never regress ─────────

  { name: '"sure tell me" → show properties, NOT push visit',
    lead: { name: 'Rohit', intent: 'buy', preferred_areas: ['Baner'], ai_score: 5 },
    messages: [
      { role: 'assistant', content: 'We have some great options in Baner! Would you like to explore them?' },
      { role: 'user', content: 'Sure, tell me' },
    ],
    rule: 'Reply MUST show at least one property from inventory with details (name, price, location). Must NOT jump to "let me set up a visit" or ask for a visit time. The lead has NOT seen any property yet — showing properties comes FIRST, visit comes AFTER they show interest in a specific property. Failing to show property details is an automatic FAIL.' },

  { name: '"no I need details" after visit push → show property details, not repeat visit',
    lead: { name: 'Anita', intent: 'buy', preferred_areas: ['Baner'], ai_score: 7, status: 'qualified' },
    messages: [
      { role: 'assistant', content: '🏡 Sunrise Park 2BHK, Baner ₹79L — east-facing. Would you like to visit this weekend?' },
      { role: 'user', content: 'No, I need details of the property first. Tell me everything about it.' },
    ],
    rule: 'Reply MUST show comprehensive details about Sunrise Park: price (₹79L), size (1080 sqft), possession (ready to move), amenities (east-facing, gym, clubhouse). Must NOT repeat the visit booking message. Must NOT say "happy to set up a visit" again. The lead explicitly asked for details — give them details. Must NOT ask another question without answering first.' },

  { name: 'area not in inventory → share agent contact, never substitute',
    lead: { name: 'Vivek', intent: 'buy', ai_score: 4 },
    messages: [{ role: 'user', content: 'Kothrud mein koi 3BHK available hai kya?' }],
    rule: 'There is NO property in Kothrud in the inventory. Reply must NOT fabricate a Kothrud property. Must NOT silently show a Baner or Wakad property instead without clearly saying "I don\'t have listings in Kothrud." Should share the agent\'s contact details (Suresh Kumar, 9876543210) so the lead can ask directly. Must NOT just say "I\'ll check" — be clear that Kothrud is not in current inventory.' },

  { name: '"photos pls" in commitment → send photos, not push visit',
    lead: { name: 'Pooja', intent: 'buy', preferred_areas: ['Baner'], ai_score: 7, status: 'qualified' },
    messages: [
      { role: 'assistant', content: 'I have a great 2BHK at Sunrise Park, Baner — ₹79L, east-facing, ready to move, gym and clubhouse. Would you like to see photos?' },
      { role: 'user', content: 'Photos pls' },
    ],
    rule: 'Reply must confirm photo sharing warmly (e.g. "Sure, sending the photos now!"). Must NOT redirect to visit booking. Must NOT say "I cannot send photos" (since photo sending is enabled). Must NOT say "system will send" — use "I" or "our team". Must NOT ask another question before confirming the photo send.' },

  { name: 'greeting → asks name + language, no property dump',
    lead: {},
    messages: [{ role: 'user', content: 'Hello' }],
    rule: 'Reply must ask for the lead\'s name AND offer language preference (English/Hindi/Marathi). Must NOT dump property listings or prices in the first message. Must be warm and welcoming. Should ask name first, not start with area or budget questions.' },
]

// Filesystem-safe, stable identifier for a scenario's fixture file.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
