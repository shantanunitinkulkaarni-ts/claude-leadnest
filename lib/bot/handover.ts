import { waSendText, type WaChannel } from '../whatsapp'

export async function applyHandover(args: {
  reply: string
  agent: any
  lead: any
  leadPhone: string
  channel: WaChannel
}) {
  const { reply, agent, lead, leadPhone, channel } = args
  const finalReply = `${reply}\n\n${buildAgentContactCard(agent)}`

  const agentPhone = (agent?.phone || '').replace(/\D/g, '')
  if (agentPhone) {
    const leadName = lead?.name || leadPhone
    await waSendText(
      channel,
      agentPhone,
      `🔔 *Lead wants to speak to you*\n\n👤 ${leadName}\n📞 ${leadPhone}\n\nPlease call them.`
    )
  }

  return finalReply
}

function buildAgentContactCard(agent: any) {
  const name = agent?.name || 'Agent'
  const phone = agent?.phone ? `📞 ${agent.phone}\n` : '📞 Contact via this chat\n'
  const email = agent?.email ? `📧 ${agent.email}\n` : ''
  const open = agent?.office_open || '9:00 AM'
  const close = agent?.office_close || '7:00 PM'
  return `${name}\n${phone}${email}🕐 Available: ${open} – ${close}`
}
