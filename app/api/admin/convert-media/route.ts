export const dynamic = "force-dynamic"
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'
import { toWhatsAppJpeg, needsWhatsAppConversion } from '@/lib/imageConvert'

// One-time backfill: convert EXISTING property photos that aren't JPEG (AVIF,
// WebP, HEIC, PNG…) into WhatsApp-safe JPEGs, in place. WhatsApp silently drops
// non-JPEG/PNG images, so legacy AVIF media never delivered. New uploads are
// already converted by /api/properties/upload; this fixes what's already stored.
//
// Superadmin/CRON-gated. Body (all optional): { agent_id?, property_id?, dry? }
// - property_id: convert just one property
// - agent_id:    convert all of one agent's properties
// - dry: true:   report what WOULD convert without writing
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const viaSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!viaSecret) {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error
    if (!auth.isSuperadmin) return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const propertyId = body.property_id ? String(body.property_id) : ''
    const agentId = body.agent_id ? String(body.agent_id) : ''
    const dry = body.dry === true

    let q = supabaseAdmin.from('properties').select('id,agent_id,title,features')
    if (propertyId) q = q.eq('id', propertyId)
    else if (agentId) q = q.eq('agent_id', agentId)
    const { data: properties, error } = await q
    if (error) throw error

    const summary: any[] = []
    let convertedCount = 0

    for (const prop of properties || []) {
      const feats: any[] = Array.isArray(prop.features) ? prop.features : []
      let changed = false
      const newFeats: string[] = []

      for (const f of feats) {
        if (typeof f !== 'string' || !f.startsWith('media:')) { newFeats.push(f); continue }
        const url = f.slice(6).trim()
        if (!/^https?:\/\//i.test(url) || !needsWhatsAppConversion(url)) { newFeats.push(f); continue }

        if (dry) { summary.push({ property: prop.title, from: url, action: 'would convert' }); newFeats.push(f); continue }

        try {
          const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })
          const jpeg = await toWhatsAppJpeg(Buffer.from(resp.data))
          const fileName = `${Date.now()}-converted-${Math.random().toString(36).slice(2, 8)}.jpg`
          const { error: upErr } = await supabaseAdmin.storage
            .from('property_assets')
            .upload(fileName, jpeg, { contentType: 'image/jpeg', upsert: false })
          if (upErr) throw upErr
          const { data: urlData } = supabaseAdmin.storage.from('property_assets').getPublicUrl(fileName)
          newFeats.push(`media:${urlData.publicUrl}`)
          changed = true
          convertedCount++
          summary.push({ property: prop.title, from: url, to: urlData.publicUrl, action: 'converted' })
        } catch (convErr: any) {
          console.error(`convert-media: failed for ${url}:`, convErr?.message)
          summary.push({ property: prop.title, from: url, action: 'FAILED', error: convErr?.message })
          newFeats.push(f) // keep original on failure
        }
      }

      if (changed && !dry) {
        const { error: updErr } = await supabaseAdmin.from('properties').update({ features: newFeats }).eq('id', prop.id)
        if (updErr) console.error(`convert-media: update failed for ${prop.id}:`, updErr.message)
      }
    }

    return NextResponse.json({ ok: true, dry, propertiesScanned: (properties || []).length, converted: convertedCount, summary })
  } catch (e: any) {
    console.error('convert-media error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
