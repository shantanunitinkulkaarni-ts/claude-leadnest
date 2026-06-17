export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendWelcomeEmail } from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/auth/register
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, name, phone, agency_name, city, state, areas, property_types, bot_tone, languages, office_open, office_close } = body

  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  if (!name || typeof name !== 'string' || name.length > 100) return NextResponse.json({ error: 'Name required (max 100 chars)' }, { status: 400 })
  if (Array.isArray(areas) && areas.length > 50) return NextResponse.json({ error: 'Too many areas' }, { status: 400 })
  if (Array.isArray(property_types) && property_types.length > 20) return NextResponse.json({ error: 'Too many property types' }, { status: 400 })

  // Check if agent already exists
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('agents')
    .insert({
      email,
      name,
      phone,
      agency_name,
      city,
      state,
      areas,
      property_types,
      bot_tone: bot_tone || 'friendly',
      languages: languages || ['english', 'hindi'],
      office_open: office_open || '09:00',
      office_close: office_close || '19:00',
      plan: 'trial',
      plan_status: 'trial',
      plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      messages_used: 0,
      messages_limit: 500,
      wa_balance: 10
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget welcome email (never blocks signup; no-op until Resend domain verified)
  sendWelcomeEmail(email, name).catch(() => {})

  return NextResponse.json({ data, message: 'Account created successfully' })
}
