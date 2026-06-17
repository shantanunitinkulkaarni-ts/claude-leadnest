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

    let q = supabaseAdmin.from('properties').select('id,agent_id,title,features,property_media')
    if (propertyId) q = q.eq('id', propertyId)
    else if (agentId) q = q.eq('agent_id', agentId)
    const { data: properties, error } = await q
    if (error) throw error

    const summary: any[] = []
    let convertedCount = 0

    // Convert one source URL → a freshly stored WhatsApp-safe JPEG URL.
    // Returns the new URL, or the original URL unchanged on failure/no-op.
    const convertUrl = async (url: string, title: string): Promise<string> => {
      if (!/^https?:\/\//i.test(url) || !needsWhatsAppConversion(url)) return url
      if (dry) { summary.push({ property: title, from: url, action: 'would convert' }); return url }
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 })
        const jpeg = await toWhatsAppJpeg(Buffer.from(resp.data))
        const fileName = `${Date.now()}-converted-${Math.random().toString(36).slice(2, 8)}.jpg`
        const { error: upErr } = await supabaseAdmin.storage
          .from('property_assets')
          .upload(fileName, jpeg, { contentType: 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        const { data: urlData } = supabaseAdmin.storage.from('property_assets').getPublicUrl(fileName)
        convertedCount++
        summary.push({ property: title, from: url, to: urlData.publicUrl, action: 'converted' })
        return urlData.publicUrl
      } catch (convErr: any) {
        console.error(`convert-media: failed for ${url}:`, convErr?.message)
        summary.push({ property: title, from: url, action: 'FAILED', error: convErr?.message })
        return url // keep original on failure
      }
    }

    for (const prop of properties || []) {
      // ── Canonical column: property_media (Phase 0F migrated media here) ──
      const pm: any[] = Array.isArray(prop.property_media) ? prop.property_media : []
      const newPm: string[] = []
      let pmChanged = false
      for (const url of pm) {
        if (typeof url !== 'string') { newPm.push(url); continue }
        const out = await convertUrl(url.trim(), prop.title)
        if (out !== url.trim()) pmChanged = true
        newPm.push(out)
      }
      if (pmChanged && !dry) {
        const { error: updErr } = await supabaseAdmin.from('properties').update({ property_media: newPm }).eq('id', prop.id)
        if (updErr) console.error(`convert-media: property_media update failed for ${prop.id}:`, updErr.message)
      }

      // ── Legacy fallback: unmigrated rows still carry media: entries in features ──
      const feats: any[] = Array.isArray(prop.features) ? prop.features : []
      let featsChanged = false
      const newFeats: string[] = []
      for (const f of feats) {
        if (typeof f !== 'string' || !f.startsWith('media:')) { newFeats.push(f); continue }
        const out = await convertUrl(f.slice(6).trim(), prop.title)
        if (out !== f.slice(6).trim()) featsChanged = true
        newFeats.push(`media:${out}`)
      }
      if (featsChanged && !dry) {
        const { error: updErr } = await supabaseAdmin.from('properties').update({ features: newFeats }).eq('id', prop.id)
        if (updErr) console.error(`convert-media: features update failed for ${prop.id}:`, updErr.message)
      }
    }

    return NextResponse.json({ ok: true, dry, propertiesScanned: (properties || []).length, converted: convertedCount, summary })
  } catch (e: any) {
    console.error('convert-media error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
