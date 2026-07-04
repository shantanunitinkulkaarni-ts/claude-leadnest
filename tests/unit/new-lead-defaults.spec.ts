import { test, expect } from '@playwright/test'
import { newInboundLeadDefaults } from '../../lib/bot/newLeadDefaults'

test('new inbound WhatsApp leads do not preselect language', () => {
  const lead = newInboundLeadDefaults('916393260332', '2026-07-04T10:00:00.000Z')

  expect(lead.language).toBeNull()
  expect(lead.bot_stage).toBe('greeting')
  expect(lead.chat_history).toEqual([])
  expect(lead.opted_in).toBe(true)
})
