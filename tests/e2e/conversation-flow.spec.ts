import 'dotenv/config'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

// Full lead-journey E2E test, driven entirely through POST /api/webhook exactly
// as a real WhatsApp inbound message would arrive. Unlike the unit tests (which
// check isolated functions like isConfirmationReply or resolveAppointmentTime in
// isolation), this exercises the real route end-to-end against a real LLM and a
// real database, and asserts the appointment confirmation loop (Phase 1C)
// actually lands a row in `appointments` — not just that the regex logic is
// correct in isolation.
//
// Requires, in the test process env:
//   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (real Supabase project)
//   - TEST_AGENT_ID (an existing agent row to send messages as)
//   - WEBHOOK_SIMULATE_SECRET set, OR SKIP_WEBHOOK_AUTH=true (the webhook auth gate
//     dev-bypasses when NODE_ENV !== 'production' — true under `next dev` — AND
//     SKIP_WEBHOOK_AUTH === 'true')
// None of these are set in CI today (CI uses dummy Supabase creds — see
// .github/workflows/ci.yml), so this test auto-skips there. Run it locally
// before merging changes to the webhook/appointment flow:
//   SKIP_WEBHOOK_AUTH=true npm test -- tests/e2e/conversation-flow.spec.ts
//
// NEVER point BASE_URL at production for this test. It sends real inbound
// messages through the real engine and writes/deletes a real (synthetic) lead.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_AGENT_ID = process.env.TEST_AGENT_ID
const WEBHOOK_SECRET = process.env.WEBHOOK_SIMULATE_SECRET
const AUTH_OPEN = !!WEBHOOK_SECRET || process.env.SKIP_WEBHOOK_AUTH === 'true'

const canRun = !!SUPABASE_URL && SUPABASE_URL !== 'https://dummy.supabase.co' && !!SERVICE_KEY && !!TEST_AGENT_ID && AUTH_OPEN

test.describe('E2E: full lead conversation → confirmed appointment', () => {
  test.skip(!canRun, 'requires real Supabase creds + TEST_AGENT_ID + open webhook auth — see file header for how to run locally')

  test('greeting → discovery → time proposal → confirmation → appointment booked', async ({ request }) => {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY!)
    // Obviously-synthetic, unique phone so repeated runs never collide and a
    // human glancing at the leads table immediately recognises test data.
    const phone = `+91TEST${Date.now()}`

    const send = async (body: string) => {
      const res = await request.post('/api/webhook', {
        form: {
          From: `whatsapp:${phone}`,
          Body: body,
          MessageSid: randomUUID(),
          AgentId: TEST_AGENT_ID!,
        },
        headers: WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : undefined,
      })
      expect(res.status(), `webhook rejected "${body}"`).toBe(200)
      return res
    }

    try {
      await send('Hi')
      await send('Looking for a 2BHK in Baner, budget around 80 lakh')
      await send('Saturday at 11am works for a site visit, please book it')

      const { data: staged } = await db
        .from('leads')
        .select('id, pending_appointment_time')
        .eq('agent_id', TEST_AGENT_ID)
        .eq('phone', phone)
        .maybeSingle()
      expect(staged, 'lead should exist after first inbound message').toBeTruthy()
      expect(staged!.pending_appointment_time, 'bot should stage a pending time, not book immediately').toBeTruthy()

      await send('shantanunitinkulkaarni@gmail.com')
      await send('Yes confirm')

      const { data: lead } = await db
        .from('leads')
        .select('id, status, pending_appointment_time')
        .eq('id', staged!.id)
        .single()
      expect(lead!.status).toBe('visit_booked')
      expect(lead!.pending_appointment_time, 'pending hold should be cleared once promoted').toBeNull()

      const { data: appt } = await db
        .from('appointments')
        .select('*')
        .eq('lead_id', staged!.id)
        .eq('status', 'upcoming')
        .maybeSingle()
      expect(appt, 'a real appointment row should exist').toBeTruthy()
      expect(appt!.scheduled_at).toBeTruthy()
    } finally {
      // Cleanup — cascades to this lead's messages/appointments/activity_log
      // (lib/schema.sql: all `lead_id` FKs here are `on delete cascade`), so
      // repeated runs never accumulate synthetic data.
      const { data: lead } = await db.from('leads').select('id').eq('agent_id', TEST_AGENT_ID).eq('phone', phone).maybeSingle()
      if (lead) await db.from('leads').delete().eq('id', lead.id)
    }
  })
})
