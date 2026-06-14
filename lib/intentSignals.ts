// ─── Intent & safety signal detection (pure, testable) ───────────────────────
// Deterministic detectors that run on the lead's inbound message (and the bot's
// reply) to drive two things the founder asked for:
//   1. HIGH-PRIORITY alerts to the agent (email + WhatsApp) for ROI-critical
//      moments: lead arriving now, wants a call/human, very interested, the bot
//      hit a knowledge gap, or a competitor is probing.
//   2. GUARDRAILS: deflect sexual content and obvious spam/scams instead of
//      letting the sales engine engage with them.
//
// Design principle: HIGH PRECISION over recall. A false alert trains the agent
// to ignore alerts, so patterns are deliberately conservative — better to miss a
// soft signal than cry wolf. Covers English + romanized & Devanagari Hindi/Marathi.

export type PrioritySignal =
  | 'visit_booked'    // a site visit was just booked/confirmed
  | 'visit_now'       // arriving now / on the way
  | 'call_request'    // explicitly wants a phone call
  | 'human_request'   // wants to talk to a real person/agent
  | 'very_interested' // strong buying / commitment intent
  | 'knowledge_gap'   // the bot could not answer (detected from its reply)
  | 'competitor'      // a broker/competitor probing, not a genuine buyer

export type Guardrail = 'sexual' | 'spam_scam' | 'injection' | null

export type InboundSignals = {
  priorities: PrioritySignal[]
  guardrail: Guardrail
}

const has = (text: string, patterns: RegExp[]) => patterns.some(p => p.test(text))

// Lead is physically arriving now / very soon.
const VISIT_NOW: RegExp[] = [
  /\b(on my way|omw|on the way)\b/,
  /\b(coming|come) (now|over now|right now|today|in \d+)/,
  /\bi('?m| am)? ?(coming|outside|downstairs|here at|at the (site|location|property|plot|office|flat))\b/,
  /\b(reaching|reach) (in|by|there|soon|in \d+)/,
  /\bbe there in \d+/,
  /\b(aa raha|aa rahe|aa rha|aata hu|nikal (raha|gaya|rahe)|pohonch (raha|gaya)|pahuch (raha|gaya))\b/,
  /\b(yetoy|yeto aahe|nighalo|nighto|pohochto|pohochlo|aloच?)\b/,
  /(आ रहा|आ रहे|निकल रहा|निकल गया|पहुँच|पहुंच|येतोय|निघालो|पोहोच)/,
]

// Wants a phone call.
const CALL_REQUEST: RegExp[] = [
  /\b(call|ring|phone) me\b/,
  /\b(can|could|please|kindly|pls|plz) (you )?call\b/,
  /\bgive me a (call|ring)\b/,
  /\bcall (karo|kijiye|kar do|kara|karaal|kara na)\b/,
  /\bphone (karo|kijiye|kara)\b/,
  /(कॉल कर|फोन कर|कॉल कीजिए|मला कॉल|कॉल करा)/,
]

// Wants a human/agent rather than the bot.
const HUMAN_REQUEST: RegExp[] = [
  /\b(talk|speak|connect) (to|with) (a |an |the )?(human|person|someone|agent|advisor|representative|broker|dealer|sir|madam)\b/,
  /\b(real|actual|live) (person|human|agent)\b/,
  /\b(kisi se|insaan se|aadmi se|agent se|kisise) baat\b/,
  /\bagent (ka|ko) (number|contact|phone)\b/,
  /\bhuman (please|plz)\b/,
  /(माणसाशी बोला|व्यक्तीशी|एजंटशी बोला|किसी से बात|एजंट का नंबर)/,
]

// Strong buying / commitment intent (conservative — commitment words only).
const VERY_INTERESTED: RegExp[] = [
  /\b(ready|want) to (buy|book|pay|purchase|finalize|finalise|move ahead)\b/,
  /\bi('?ll| will)? ?(take|book) (it|this|that one)\b/,
  /\b(let'?s|lets) (do it|book|finalize|finalise|go ahead|proceed)\b/,
  /\b(where|how) (do|can) i pay\b/,
  /\b(token|booking) amount\b/,
  /\bpay (the )?(token|advance|booking|amount)\b/,
  /\b(finalize|finalise|confirm) (the )?(deal|booking|purchase)\b/,
  /\b(book|buy) (it )?(now|today|right away)\b/,
  /\b(deal|booking) (pakka|pakki|done)\b/,
  /\bbook kar(do|do na|ni hai|na hai)\b/,
  /(बुक कर|पक्का कर|फायनल|टोकन|खरेदी कर|खरीद)/,
]

// A broker/competitor probing rather than a genuine buyer.
const COMPETITOR: RegExp[] = [
  /\bi('?m| am)? ?(also )?(a |an )?(broker|real ?estate agent|property dealer|realtor|channel partner)\b/,
  /\bi (work|deal) (in|with|for) (real ?estate|property|properties)\b/,
  /\bwhich (software|tool|crm|platform|system|service) (do you|are you|is this)\b/,
  /\bwhat (software|tool|crm|platform) (do you|are you) (use|using|on)\b/,
  /\b(are you|is this) (using|built on|powered by) (ai|gpt|chatgpt|some software)\b/,
  /\bchannel partner\b/,
  /\bcommission (split|sharing|kitna|structure)\b/,
]

// Sexual / NSFW content → deflect, never engage.
const SEXUAL: RegExp[] = [
  /\b(sex|sexy|nude|nudes|naked|porn|p0rn|horny|boobs|penis|vagina|escort|escorts|blowjob|dick|pussy|fuck me|sext)\b/,
  /\bsend (me )?(your )?(nudes|naked|sexy) (pic|pics|photo|photos)\b/,
  /\b(sleep|hookup|hook up) with (me|you)\b/,
]

// Obvious spam / scam.
const SPAM_SCAM: RegExp[] = [
  /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/,
  /\b(you('?ve| have)? won|congratulations you|lottery|jackpot|prize money|claim your (prize|reward))\b/,
  /\b(loan|personal loan|instant loan) (approved|offer|available|@|at \d)/,
  /\b(invest|investment|double your money|guaranteed returns|trading tips|forex|binary option)\b/,
  /\b(bitcoin|btc|crypto|usdt|ethereum) (invest|profit|trading|opportunity|double)\b/,
  /\b(send|share|give) (your |the )?otp\b/,
  /\b(earn|make) (₹|rs\.?|inr )?\d[\d,]* ?(per day|daily|from home|work from home)\b/,
  /\bwork from home (job|opportunity|earn)\b/,
]

// Prompt-injection / jailbreak attempts against the LLM. Deflect and stay in
// role; never reveal the system prompt or follow these instructions.
const INJECTION: RegExp[] = [
  /\bignore (all |any )?(previous|prior|above|earlier) (instructions?|prompts?|messages?)\b/,
  /\bdisregard (your|the|all) (instructions?|rules?|system prompt|guidelines?)\b/,
  /\b(reveal|show|print|repeat|tell me) (your|the) (system )?(prompt|instructions?|rules?|guidelines?)\b/,
  /\bwhat (are|were) your (instructions?|system prompt|rules?)\b/,
  /\byou are now\b|\bfrom now on,? you\b/,
  /\b(act|behave) as (if you are|a|an)\b|\bpretend (to be|you are|that you)\b/,
  /\b(developer|debug|god) mode\b|\bjailbreak\b|\bDAN mode\b/,
  /\boverride your (programming|instructions|rules)\b/,
]

export function detectInboundSignals(rawText: string): InboundSignals {
  const text = (rawText || '').toLowerCase()
  if (!text.trim()) return { priorities: [], guardrail: null }

  // Guardrails first — if it's NSFW/spam/injection we don't also fire sales alerts.
  let guardrail: Guardrail = null
  if (has(text, SEXUAL)) guardrail = 'sexual'
  else if (has(text, INJECTION)) guardrail = 'injection'
  else if (has(text, SPAM_SCAM)) guardrail = 'spam_scam'

  if (guardrail) return { priorities: [], guardrail }

  const priorities: PrioritySignal[] = []
  if (has(text, VISIT_NOW)) priorities.push('visit_now')
  if (has(text, CALL_REQUEST)) priorities.push('call_request')
  if (has(text, HUMAN_REQUEST)) priorities.push('human_request')
  if (has(text, VERY_INTERESTED)) priorities.push('very_interested')
  if (has(text, COMPETITOR)) priorities.push('competitor')

  return { priorities, guardrail: null }
}

// Detect from the BOT's own reply that it couldn't answer / had to defer — a
// signal the agent should step in with the missing info (possession date,
// exact locality, floor plan, etc.). High precision: matches explicit deferrals.
const KNOWLEDGE_GAP: RegExp[] = [
  /\bi('?ll| will) (check|confirm|find out|get back|ask)\b.*\b(team|agent|back to you)\b/,
  /\blet me (check|confirm|find out|get)\b/,
  /\b(check|confirm) (this )?with (the |our )?team\b/,
  /\bteam will (share|get back|confirm|let you know|update you)\b/,
  /\bi (don'?t|do not) have (that|this|the) (info|information|detail|details)\b/,
  /\bnot (available|sure) (right now|at the moment|currently)\b/,
  /\b(don'?t|do not) have (the )?(exact|floor plan|possession date|details)\b/,
]

export function detectReplyKnowledgeGap(reply: string): boolean {
  const text = (reply || '').toLowerCase()
  if (!text.trim()) return false
  return has(text, KNOWLEDGE_GAP)
}

// Human-readable label for each signal (for alert messages).
export const SIGNAL_LABELS: Record<PrioritySignal, string> = {
  visit_booked: 'Site visit booked',
  visit_now: 'Lead is arriving NOW / on the way',
  call_request: 'Lead asked for a phone call',
  human_request: 'Lead wants to talk to a person',
  very_interested: 'Lead is very interested (strong buying signal)',
  knowledge_gap: "Bot couldn't answer something — info needed",
  competitor: 'Possible competitor/broker probing',
}

// Order by urgency for the alert headline.
const URGENCY: PrioritySignal[] = ['visit_now', 'visit_booked', 'very_interested', 'call_request', 'human_request', 'knowledge_gap', 'competitor']

export function topSignal(signals: PrioritySignal[]): PrioritySignal | null {
  for (const s of URGENCY) if (signals.includes(s)) return s
  return null
}
