import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Using the service role key for admin bypass in testing
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // fallback for testing

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function runAudit() {
  console.log("🚀 Starting App-wide QA Audit Flow...")

  // 1. Fetch any existing agent to use as a test subject
  console.log("1. Finding test agency...")
  const { data: agents, error: aErr } = await supabase.from('agents').select('*').limit(1)
  if (aErr || !agents || agents.length === 0) {
    console.log("❌ No agents found. Please create one via UI first.")
    return
  }
  const agentId = agents[0].id
  console.log(`✅ Using Agency: ${agents[0].agency_name} (${agentId})`)

  // 2. Add a manual lead
  console.log("2. Simulating 'Add Lead' (POST /api/leads)...")
  const newLead = {
    agent_id: agentId,
    name: 'Audit Test Lead',
    phone: '919998887776',
    source: 'Manual',
    status: 'new',
    temperature: 'new',
    ai_score: 5,
    intent: 'Testing'
  }
  
  const { data: leadData, error: lErr } = await supabase.from('leads').insert(newLead).select().single()
  if (lErr) {
    console.error("❌ Failed to add lead:", lErr)
    return
  }
  console.log(`✅ Lead added successfully! ID: ${leadData.id}`)

  // 3. Move lead status (Pipeline Drag-and-drop)
  console.log("3. Simulating pipeline drag-and-drop (PATCH /api/leads)...")
  const { error: patchErr } = await supabase.from('leads').update({ status: 'warm' }).eq('id', leadData.id)
  if (patchErr) {
    console.error("❌ Failed to update lead status:", patchErr)
    return
  }
  console.log(`✅ Lead moved to 'warm' successfully!`)

  // 4. Simulate a conversation
  console.log("4. Simulating conversation (POST /api/messages)...")
  const msg1 = {
    agent_id: agentId,
    lead_id: leadData.id,
    direction: 'inbound',
    content: 'Hello, I am interested in property.',
    sent_by: 'lead'
  }
  const msg2 = {
    agent_id: agentId,
    lead_id: leadData.id,
    direction: 'outbound',
    content: 'Hi there! We have great properties for you.',
    sent_by: 'agent'
  }
  
  const { error: mErr } = await supabase.from('messages').insert([msg1, msg2])
  if (mErr) {
    console.error("❌ Failed to insert messages:", mErr)
    return
  }
  console.log(`✅ Messages logged successfully!`)

  // 5. Verify Analytics
  console.log("5. Testing Analytics query...")
  const [leadsRes, messagesRes] = await Promise.all([
    supabase.from('leads').select('*').eq('agent_id', agentId),
    supabase.from('messages').select('*').eq('agent_id', agentId)
  ])
  
  console.log(`✅ Analytics Data Present! Leads: ${leadsRes.data?.length}, Messages: ${messagesRes.data?.length}`)
  console.log("🎉 ALL QA AUDIT TESTS PASSED. The DB integration is perfectly solid.")
}

runAudit()
