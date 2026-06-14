export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/apiAuth'
import { sendViaMsg91Media } from '@/lib/whatsapp'

// Superadmin/CRON-gated: send ONE image to a chosen number to verify the MSG91
// media payload shape before enabling photo-sharing broadly (MSG91_MEDIA_LIVE).
// Body: { integrated_number, to, url, caption? }
export async function POST(request: NextRequest) {
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
    const url = String(body.url || '')
    const caption = body.caption ? String(body.caption) : undefined
    if (!integrated || !to || !url) {
      return NextResponse.json({ error: 'integrated_number, to and url are required' }, { status: 400 })
    }
    const reqId = await sendViaMsg91Media(integrated, to, url, caption)
    return NextResponse.json({ ok: !!reqId, requestId: reqId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
