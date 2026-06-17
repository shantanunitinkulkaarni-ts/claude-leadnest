export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'
import { toWhatsAppJpeg } from '@/lib/imageConvert'

// We accept a wide range of source formats (agents often grab AVIF/HEIC images
// straight off listing sites) but ALWAYS re-encode to JPEG before storing.
// WhatsApp/Meta only delivers JPEG/PNG images — an AVIF link is silently dropped
// by Meta even though MSG91 returns "success", which is exactly why property
// photos never arrived. Converting here makes every stored image WhatsApp-safe.
const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/avif', 'image/heic', 'image/heif', 'image/tiff',
]
const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15MB source cap (output is shrunk below)

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Accept by declared type when present; some browsers send AVIF/HEIC with an
    // empty/odd type, so fall back to letting sharp try to decode it below.
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type — please upload an image' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)

    // Convert to a WhatsApp-safe JPEG: auto-rotate (respect EXIF), downscale to
    // fit MAX_DIMENSION, flatten any alpha onto white, encode JPEG. If sharp
    // can't decode the input, surface a clear error instead of storing garbage.
    let jpegBuffer: Buffer
    try {
      jpegBuffer = await toWhatsAppJpeg(inputBuffer)
    } catch (convErr: any) {
      console.error('Image convert failed:', convErr?.message)
      return NextResponse.json({ error: 'Could not process this image — please try a JPG or PNG' }, { status: 400 })
    }

    // Always store as .jpg with image/jpeg content type (WhatsApp-deliverable).
    const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '')
    const fileName = `${Date.now()}-${baseName || 'photo'}.jpg`

    const { error } = await supabaseAdmin.storage
      .from('property_assets')
      .upload(fileName, jpegBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (error) throw error

    const { data: urlData } = supabaseAdmin.storage
      .from('property_assets')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
