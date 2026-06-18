export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthContext } from '@/lib/apiAuth'
import { toWhatsAppJpeg } from '@/lib/imageConvert'

// FOOLPROOF PHOTO POLICY (founder decision): accept ONLY .jpeg/.jpg uploads —
// reject every other format outright. WhatsApp/Meta silently drop non-JPEG images
// (AVIF/HEIC/WebP…), which is why property photos used to never arrive. We STILL
// run the re-encode below (resize + strip EXIF + baseline JPEG) as a second
// safety layer, but the hard front-door rule is: JPEG only. Two layers = photo
// sending can't be broken by a bad upload.
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg']
const JPEG_EXT_RE = /\.jpe?g$/i
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

    // Hard gate: filename must end in .jpg/.jpeg AND (if a type is declared) it
    // must be image/jpeg. Some browsers send an empty type — the extension check
    // still catches non-JPEGs, and the re-encode below is the final backstop.
    const isJpegExt = JPEG_EXT_RE.test(file.name || '')
    const isJpegType = !file.type || ALLOWED_TYPES.includes(file.type.toLowerCase())
    if (!isJpegExt || !isJpegType) {
      return NextResponse.json({ error: 'Only JPEG photos are allowed. Please upload a .jpg or .jpeg image.' }, { status: 400 })
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
