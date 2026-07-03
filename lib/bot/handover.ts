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

  const agentPhone = (agent.phone || '').replace(/\D/g, '')
  if (agentPhone) {
    const leadName = lead.name || leadPhone
    await waSendText(
      channel,
      agentPhone,
      `🔔 *Lead wants to speak to you*\n\n👤 ${leadName}\n📞 ${leadPhone}\n\nPlease call them.`
    )
  }

  return finalReply
}

function buildAgentContactCard(agent: any) {
  return (
    `👤 *${agent.name}*\n` +
    `📞 ${agent.phone || 'Contact via this chat'}\n` +
    (agent.email ? `📧 ${agent.email}\n` : '') +
    `🕐 Available: ${agent.office_open || '9:00 AM'} – ${agent.office_close || '7:00 PM'}`
  )
}
