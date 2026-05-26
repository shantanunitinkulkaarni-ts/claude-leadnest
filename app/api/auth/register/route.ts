import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/auth/register
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, name, phone, agency_name, city, state, areas, property_types, bot_tone, languages, office_open, office_close, plan } = body

  // Check if agent already exists
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
  }

  // Set plan expiry
  const planExpiry = plan === 'annual'
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

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
      plan: plan || 'monthly',
      plan_expires_at: planExpiry,
      messages_used: 0,
      messages_limit: 5000,
      wa_balance: 0
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, message: 'Account created successfully' })
}
