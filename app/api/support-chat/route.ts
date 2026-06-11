import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { faqAsText } from '@/lib/faq'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Public support assistant for /help. Grounded in the FAQ knowledge base.
// It answers product/billing/account questions and, when it can't help (or the
// user is unhappy), tells them to use the "Contact support" option — the UI
// then surfaces the WhatsApp / email escalation.

const MAX_MESSAGES = 12 // guardrail: cap conversation length per request

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
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

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      // Degrade gracefully — never blank. Send them straight to a human.
      return NextResponse.json({
        response: 'Our assistant is briefly unavailable. Please use the “Contact support” option below and we’ll help you right away.',
        escalate: true,
      })
    }
    const groq = new Groq({ apiKey })

    const systemPrompt = `You are the Convorian support assistant. Convorian is an AI WhatsApp assistant for Indian real-estate agents (₹999/month).

Answer ONLY using the knowledge base below. Be warm, concise (1-3 sentences), and practical.

RULES:
1. If the answer is in the knowledge base, give it clearly.
2. If the question is NOT covered, the user seems frustrated/unhappy, or they ask for a human/refund/something account-specific you cannot verify, do NOT make things up. Briefly say you'll connect them to the team and end your reply with the exact token [ESCALATE] on its own.
3. Never invent prices, policies, or features beyond the knowledge base.
4. Keep a friendly, reassuring tone.

KNOWLEDGE BASE:
${faqAsText()}`

    const history = messages.slice(0, -1).map((m: any) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(m.content || ''),
    }))
    const last = String(messages[messages.length - 1]?.content || '')

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...history,
        { role: 'user' as const, content: last },
      ],
      max_tokens: 220,
      temperature: 0.4,
    })

    let text = completion.choices[0]?.message?.content?.trim() || ''
    const escalate = text.includes('[ESCALATE]')
    text = text.replace('[ESCALATE]', '').trim()
    if (!text) text = "I want to make sure you get the right answer — tap “Contact support” below and our team will help."

    return NextResponse.json({ response: text, escalate })
  } catch (e: any) {
    // Any failure → graceful human handoff, never a blank screen.
    return NextResponse.json({
      response: 'Something went wrong on our side. Please use the “Contact support” option below and we’ll help you directly.',
      escalate: true,
    })
  }
}
