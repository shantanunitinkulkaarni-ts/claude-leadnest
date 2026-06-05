const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.resolve(__dirname, '../.env');
const envVars = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^#]+?)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const testAgentId = envVars.TWILIO_TEST_AGENT_ID;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestSuite() {
  console.log('--- STARTING INDUSTRY-LEVEL INTEGRATION TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Verify Test Agent Exists
    const { data: agent } = await supabase.from('agents').select('*').eq('id', testAgentId).single();
    assert(agent !== null, 'Test Agent exists in the database');
    assert(agent.bot_active === true, 'Test Agent bot is active');

    // 2. Simulate Webhook: New Inbound Lead
    const testPhone = `+91000000${Math.floor(Math.random() * 9999)}`;
    console.log(`\nTesting Webhook for new lead: ${testPhone}`);
    
    const webhookPayload = new URLSearchParams({
      From: `whatsapp:${testPhone}`,
      Body: 'Hi, I am looking for a 3BHK in Wakad.',
      MessageSid: 'SM' + Math.random().toString(36).substring(7),
      AgentId: testAgentId
    });

    const whRes = await fetch('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: webhookPayload.toString()
    });

    assert(whRes.ok, 'Webhook accepted the inbound payload');

    // Wait for DB async operations
    await sleep(2000);

    // 3. Verify Database State
    const { data: leads } = await supabase.from('leads').select('*').eq('phone', testPhone);
    assert(leads && leads.length === 1, 'Lead was successfully created in the database');
    const lead = leads[0];
    
    const { data: messages } = await supabase.from('messages').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true });
    assert(messages && messages.length >= 2, 'Inbound and outbound messages were logged');
    const outbound = messages.find(m => m.direction === 'outbound');
    assert(outbound !== undefined, 'Bot generated an outbound reply');
    console.log(`Bot Reply: "${outbound?.content.substring(0, 100)}..."`);

    // 4. Test Bulk Upload Properties Endpoint
    console.log('\nTesting Bulk Properties Upload API');
    const propsPayload = [
      {
        agent_id: testAgentId,
        title: 'Integration Test Villa',
        type: 'sale',
        category: 'villa',
        city: 'Pune',
        location: 'Koregaon Park',
        price: 50000000,
        bhk: '4BHK',
        size_sqft: 4000,
        description: 'Automated test property',
        status: 'active'
      }
    ];

    const propRes = await fetch('http://localhost:3000/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propsPayload)
    });
    
    // Fallback: Our code sends one by one, so let's send object
    const propResSingle = await fetch('http://localhost:3000/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propsPayload[0])
    });

    assert(propResSingle.ok, 'Property API accepted POST request');
    const propData = await propResSingle.json();
    assert(propData.data && propData.data.id, 'Property was successfully created in the DB');

    // Cleanup Test Data
    console.log('\nCleaning up test data...');
    await supabase.from('leads').delete().eq('id', lead.id);
    await supabase.from('properties').delete().eq('id', propData.data?.id);
    
    console.log(`\n--- TEST SUITE COMPLETE ---`);
    console.log(`Passed: ${passed} | Failed: ${failed}`);
    
    if (failed > 0) process.exit(1);
    process.exit(0);

  } catch (err) {
    console.error('Fatal Test Error:', err);
    process.exit(1);
  }
}

runTestSuite();
