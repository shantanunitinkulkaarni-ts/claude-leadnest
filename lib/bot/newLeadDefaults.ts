export function newInboundLeadDefaults(phone: string, nowIso: string) {
  return {
    phone,
    last_message_at: nowIso,
    window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'new',
    language: null,
    bot_stage: 'greeting',
    chat_history: [],
    opted_in: true,
    opt_in_at: nowIso,
    opt_in_source: 'whatsapp_inbound',
  }
}
