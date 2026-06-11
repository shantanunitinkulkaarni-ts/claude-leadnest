// ─────────────────────────────────────────
// Support contact config — single source of truth.
//
// ⚠️ PLACEHOLDER: the WhatsApp support number is not live yet (new business
// SIM on the way). When it arrives, set SUPPORT_WHATSAPP_NUMBER below (or the
// NEXT_PUBLIC_SUPPORT_WHATSAPP env var in Vercel) to the real number in full
// international format, digits only, e.g. "919876543210" (91 = India).
//
// Until a real number is set, the UI hides the WhatsApp option and falls back
// to email so we never show a dead "chat on WhatsApp" link.
// ─────────────────────────────────────────

export const SUPPORT_EMAIL = 'support@convorian.in'

// Env var wins (so it can be flipped live without a code change); otherwise the
// hardcoded placeholder. Empty string = "not configured yet".
export const SUPPORT_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, '') || '' // e.g. '919876543210'

export function supportWhatsappConfigured(): boolean {
  return SUPPORT_WHATSAPP_NUMBER.length >= 10
}

// Build a wa.me deep link with an optional prefilled message.
export function supportWhatsappLink(prefill?: string): string | null {
  if (!supportWhatsappConfigured()) return null
  const base = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base
}
