import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const { data, error } = await supabaseAdmin.from('agents').select('*').eq('id', agentId).single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const agentId = searchParams.get('id')
  if (!agentId) return NextResponse.json({ error: 'agent id required' }, { status: 400 })

  try {
    const body = await request.json()
    const { data, error } = await supabaseAdmin
      .from('agents')
      .update(body)
      .eq('id', agentId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
