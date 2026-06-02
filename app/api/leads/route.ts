export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const agentId = searchParams.get('agent_id')
  const status = searchParams.get('status')
  const temperature = searchParams.get('temperature')

  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (temperature) query = query.eq('temperature', temperature)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const isArray = Array.isArray(body)
    
    let query = supabaseAdmin
      .from('leads')
      .insert(body)
      .select()
      
    if (!isArray) {
      query = query.single()
    }
    
    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
