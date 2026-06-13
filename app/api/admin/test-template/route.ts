export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/apiAuth'
import { sendViaMsg91Template } from '@/lib/whatsapp'

// Superadmin-only: fire ONE template to a chosen number to verify the MSG91
// named-variable format renders correctly before enabling broad sending.
// Body: { integrated_number, to, template, language, values: {name:value} }
export async function POST(request: NextRequest) {
  // Accept either a superadmin session OR the cron secret (so it can be fired
  // server-side for the one-time MSG91 format verification).
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const integrated = String(body.integrated_number || process.env.CONVORIAN_WA_NUMBER || '').replace(/\D/g, '')
    const to = String(body.to || '').replace(/\D/g, '')
    const template = String(body.template || '')
    const language = String(body.language || 'en')
    const values = (body.values && typeof body.values === 'object') ? body.values : {}
    if (!integrated || !to || !template) {
      return NextResponse.json({ error: 'integrated_number, to and template are required' }, { status: 400 })
    }
    const reqId = await sendViaMsg91Template(integrated, to, template, values, language)
    return NextResponse.json({ ok: !!reqId, requestId: reqId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
