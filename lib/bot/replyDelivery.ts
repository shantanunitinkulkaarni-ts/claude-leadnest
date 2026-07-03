import { translateText, needsTranslation } from '../translate'
import { waSendText, type WaChannel } from '../whatsapp'

export type ReplyDeliveryResult = {
  finalReply: string
  searchReply: string | null
  finalOut: { id: string | null }
  searchOut: { id: string | null } | null
}

export async function deliverReplies(args: {
  channel: WaChannel
  phone: string
  finalReply: string
  searchReply: string | null
  language?: string | null
  simulate?: boolean
}): Promise<ReplyDeliveryResult> {
  const { channel, phone, language, simulate } = args
  let finalReply = args.finalReply
  let searchReply = args.searchReply

  if (needsTranslation(language)) {
    finalReply = await translateText(finalReply, language!, 'en')
    if (searchReply) searchReply = await translateText(searchReply, language!, 'en')
  }

  const finalOut = simulate ? { id: null } : await waSendText(channel, phone, finalReply)
  let searchOut: { id: string | null } | null = null
  if (searchReply) {
    searchOut = simulate ? { id: null } : await waSendText(channel, phone, searchReply)
  }

  return { finalReply, searchReply, finalOut, searchOut }
}
