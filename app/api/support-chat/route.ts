import { NextResponse } from 'next/server'
import { glmChat, glmKey } from '@/lib/llm'
import { faqAsText } from '@/lib/faq'
import { supportWhatsappConfigured } from '@/lib/support'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Public support assistant for /help. Grounded in the FAQ knowledge base.
// It answers product/billing/account questions and, when it can't help (or the
// user is unhappy), tells them to use the "Contact support" option — the UI
// then surfaces the WhatsApp / email escalation.

const MAX_MESSAGES = 12 // guardrail: cap conversation length per request

export async function POST(req: Request) {
  try {
    const { messages, agent_id } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }
    if (messages.length > MAX_MESSAGES) {
      // Conversation got long — push them to a human rather than burn tokens.
      return NextResponse.json({
        response: "Let's get you a person for this. Tap “Contact support” below and our team will help you directly.",
        escalate: true,
      })
    }

    if (!glmKey()) {
      // Degrade gracefully — never blank. Send them straight to a human.
      return NextResponse.json({
        response: 'Our assistant is briefly unavailable. Please use the “Contact support” option below and we’ll help you right away.',
        escalate: true,
      })
    }

    // Tell the model what the escalation UI can actually offer, so its words
    // match the buttons the user sees (no "use WhatsApp" when WhatsApp isn't live).
    const waStatus = supportWhatsappConfigured()
      ? 'WhatsApp support IS live — they can tap "Chat on WhatsApp" in the contact options.'
      : 'WhatsApp support is launching very soon (not live yet). Until then, email (support@convorian.in) is the way to reach a human — say so warmly if they ask for WhatsApp.'

    const systemPrompt = `You are Convorian's support assistant — warm, sharp, and genuinely helpful. Convorian is an AI WhatsApp assistant for Indian real-estate agents (₹999/month). Your job: make every agent feel heard and get them a real answer fast.

VOICE:
- Warm, human and concise (2-4 sentences). Sound like a calm, competent teammate — never robotic, never repetitive.
- When someone is frustrated, worried, or asking for a refund, lead with genuine empathy and acknowledge how they feel BEFORE anything else.

WHAT YOU KNOW (answer from this; never invent prices, policies or features):
${faqAsText()}

HANDLING SPECIFIC SITUATIONS:
- Frustration / complaints: apologise sincerely, reassure them you'll get it sorted, then bring in the team. End with [ESCALATE].
- Refunds / billing disputes: be empathetic first. Explain that cancelling from the Balance screen stops future charges and they keep access until the period they've already paid for ends. For an actual refund, our team handles it personally — reassure them warmly and end with [ESCALATE]. Never promise or deny a refund amount yourself.
- Wants a human / "talk to someone" / "call me": warmly agree, tell them help is coming, end with [ESCALATE].
- How to reach us / contact / WhatsApp: ${waStatus} If they specifically want WhatsApp and it isn't live yet, acknowledge it's coming soon, offer email meanwhile, and end with [ESCALATE] so they see the contact options.
- Anything outside your knowledge, or account-specific you cannot verify: don't guess — say you'll bring in the team and end with [ESCALATE].

RULES:
1. If the answer is in the knowledge base, give it clearly and warmly.
2. If the question is NOT covered, the user seems frustrated/unhappy, or they ask for a human/refund/something account-specific you cannot verify, do NOT make things up. Acknowledge them, say you'll connect them to the team, and end your reply with the exact token [ESCALATE] on its own.
3. Never invent prices, policies, or features beyond the knowledge base.
4. When you escalate, put [ESCALATE] on its own at the very end.
5. NEVER repeat a sentence, greeting or phrasing you've already used in this conversation — vary your wording every time. If you've already greeted them, don't greet again. Read the conversation so far and move it forward.
6. CLOSING / THANKS: if the user says "ok", "thanks", "got it", "thank you", "cool" or similar, do NOT repeat earlier info or re-explain. Give a short, warm sign-off ("Happy to help, Shantanu! 👋 Reach out anytime.") and STOP. Do not add [ESCALATE] for a simple thanks.
7. Keep momentum: each reply should add something new or wrap up — never restate your previous message in different words.
8. Stay on Convorian topics and gently redirect anything off-topic.`

    const history = messages.slice(0, -1).map((m: any) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(m.content || ''),
    }))
    const last = String(messages[messages.length - 1]?.content || '')

    let text = await glmChat(
      [
        { role: 'system' as const, content: systemPrompt },
        ...history,
        { role: 'user' as const, content: last },
      ],
      { maxTokens: 220, temperature: 0.4 }
    )
    const escalate = text.includes('[ESCALATE]')
    text = text.replace('[ESCALATE]', '').trim()
    if (!text) text = "I want to make sure you get the right answer — tap “Contact support” below and our team will help."

    // ── Data flywheel: log every turn so the agent can learn over time ──
    // Best-effort (never breaks the chat). Accumulates real Q&A + escalation
    // signal → future few-shot examples / fine-tuning data. See BOT ROADMAP.
    let logId: string | null = null
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      const { data: logRow } = await supabaseAdmin.from('support_chat_logs').insert({
        ip_address: ip,
        agent_id: typeof agent_id === 'string' ? agent_id : null,
        user_message: last,
        assistant_reply: text,
        escalated: escalate,
        turn_count: messages.length,
      }).select('id').single()
      logId = logRow?.id || null
    } catch { /* logging is non-critical */ }

    return NextResponse.json({ response: text, escalate, log_id: logId })
  } catch (e: any) {
    // Any failure → graceful human handoff, never a blank screen.
    return NextResponse.json({
      response: 'Something went wrong on our side. Please use the “Contact support” option below and we’ll help you directly.',
      escalate: true,
    })
  }
}
