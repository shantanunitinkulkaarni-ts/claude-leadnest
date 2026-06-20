export const dynamic = "force-dynamic"

import { NextResponse } from 'next/server'
import { deepseekChat, deepseekKey } from '@/lib/llm'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { messages, language } = await req.json()

    // 1. IP-based Rate Limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'
    
    // Initialize Supabase admin client to bypass RLS for rate limiting
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (ip !== 'unknown-ip') {
      // Check existing limit
      const { data: limitData, error: limitErr } = await supabase
        .from('demo_rate_limits')
        .select('session_count')
        .eq('ip_address', ip)
        .single()

      let currentCount = 0
      if (limitData) {
        currentCount = limitData.session_count
      }

      if (currentCount >= 3) {
        return NextResponse.json({ 
          error: 'Demo limit reached', 
          message: 'You have reached the maximum number of messages for this demo. Please join the waitlist for full access.' 
        }, { status: 429 })
      }

      // Increment limit
      const newCount = currentCount + 1
      if (limitData) {
        await supabase.from('demo_rate_limits').update({ session_count: newCount, updated_at: new Date() }).eq('ip_address', ip)
      } else {
        await supabase.from('demo_rate_limits').insert([{ ip_address: ip, session_count: newCount }])
      }
    }

    // 2. LLM availability check (DeepSeek is the primary provider — see lib/llm.ts)
    if (!deepseekKey()) {
      return NextResponse.json({ error: 'Missing DEEPSEEK_API_KEY configuration' }, { status: 500 })
    }

    // 3. System Prompt
    const systemInstructionText = `You are Aisha, an elite and highly professional luxury real estate specialist for "The Azure Villas" located in Goa, India. You are an AI assistant designed to demonstrate the power of Convorian's Conversion Engine.

RULES:
1. Keep your answers extremely concise (1-2 sentences maximum).
2. You MUST communicate exclusively in the following language: ${language || 'English'}.
3. If the user asks for pictures, photos, images, or to see the property, you MUST include the exact string [SHOW_IMAGES] anywhere in your response.
4. Always maintain a premium, luxurious, and helpful tone. The villas cost upwards of ₹5 Cr.`

    // Build history excluding the last message (which we send separately)
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }))

    const lastMessage = messages[messages.length - 1].content

    const responseText = await deepseekChat(
      [
        { role: 'system', content: systemInstructionText },
        ...history,
        { role: 'user', content: lastMessage }
      ],
      // Landing demo: user is watching a spinner and the route is maxDuration=30
      // — keep the retry budget short so a stall fails fast instead of after 40s.
      { maxTokens: 200, temperature: 0.7, deadlineMs: 18000 }
    )

    return NextResponse.json({ response: responseText })

  } catch (error: any) {
    console.error('Demo Chat API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 })
  }
}
