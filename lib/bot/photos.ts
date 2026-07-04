import { supabaseAdmin } from '../supabase'
import { waSendMedia, type WaChannel } from '../whatsapp'
import { MAX_PHOTOS } from './types'

export type PhotoActionResult = {
  photosToSend: string[]
  fallbackReply: string | null
}

export async function handlePhotoAction(propertyId: string | null): Promise<PhotoActionResult> {
  const photosToSend = propertyId ? await loadPropertyPhotos(propertyId) : []

  return {
    photosToSend,
    fallbackReply: photosToSend.length === 0
      ? 'Photos are not uploaded for this property yet. I can arrange a site visit instead. What date and time would you prefer?'
      : null,
  }
}

export async function sendPhotoUrls(channel: WaChannel, phone: string, photoUrls: string[], simulate?: boolean) {
  if (simulate) return
  for (const url of photoUrls) {
    await waSendMedia(channel, phone, url)
  }
}

async function loadPropertyPhotos(propertyId: string) {
  const { data: prop } = await supabaseAdmin
    .from('properties')
    .select('photos, property_media, video_url, brochure_url, title, is_sample')
    .eq('id', propertyId)
    .single()

  if (!prop || prop.is_sample) return []

  const urls = Array.from(new Set([
    ...(prop.photos || []),
    ...(prop.property_media || []),
  ])).filter((u: string) => typeof u === 'string' && u.startsWith('http'))

  return urls.slice(0, MAX_PHOTOS)
}
