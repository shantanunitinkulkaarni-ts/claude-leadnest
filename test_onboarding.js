const { createClient } = require('@supabase/supabase-js');

// We use the service role key to bypass RLS for this test just to see if the tables accept the structure,
// or we use the anon key if we want to test RLS.
// Actually, let's use the service role key to just verify the schema constraints.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hinqahjhtgsmljrrozql.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // I need to get this from env.yaml

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testOnboarding() {
  console.log("Testing onboarding DB insertions...");
  
  const testEmail = `test_${Date.now()}@example.com`;
  
  // 1. Insert Agent
  const { data: agentData, error: agentError } = await supabase.from('agents').insert({
    email: testEmail,
    name: "Test Agent",
    phone: "1234567890",
    agency_name: "Test Agency",
    city: "Pune",
    state: "Maharashtra",
    areas: ['Baner'],
    property_types: ['residential_sale'],
    bot_tone: 'friendly',
    languages: ['english'],
    office_open: '09:00',
    office_close: '19:00',
    bot_active: true,
    wa_balance: 0,
    plan: 'free',
    plan_status: 'active'
  }).select().single();

  if (agentError) {
    console.error("Agent Insert Error:", agentError);
    return;
  }
  console.log("Agent Inserted:", agentData.id);

  // 2. Insert Team Member
  // We need a fake auth user id since we didn't actually sign up
  const fakeAuthUserId = "00000000-0000-0000-0000-000000000000"; 
  const { error: teamError } = await supabase.from('team_members').insert({
    agent_id: agentData.id,
    auth_user_id: fakeAuthUserId,
    role: 'owner',
    name: "Test Agent",
    email: testEmail,
    phone: "1234567890"
  });

  if (teamError) {
    console.error("Team Member Insert Error:", teamError);
    return;
  }
  
  console.log("Team Member Inserted Successfully!");
  
  // Cleanup
  await supabase.from('agents').delete().eq('id', agentData.id);
  console.log("Cleanup complete.");
}

testOnboarding();
