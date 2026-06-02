const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hinqahjhtgsmljrrozql.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFhaGpodGdzbWxqcnJvenFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY0ODEzMCwiZXhwIjoyMDk1MjI0MTMwfQ.iwVpezqUf8qo4ulfTJuYuSkd_cLx-4_0kvwRBKA0AtY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AGENT_PHONE = "+919999999999"; 
const LEAD_PHONE = "+918888888888"; // Fake test lead

async function sendWebhook(messageText) {
  console.log(`\n========================================`)
  console.log(`[TEST] User sends: "${messageText}"`)
  
  const payload = {
    Body: messageText,
    From: `whatsapp:${LEAD_PHONE}`,
    To: `whatsapp:${AGENT_PHONE}`
  };

  const response = await fetch('http://localhost:3000/api/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload).toString()
  });

  if (!response.ok) {
    console.error("Webhook failed:", response.status);
    return;
  }
  
  console.log("Webhook processed successfully.");
  await new Promise(r => setTimeout(r, 2000)); // wait for db insert
  
  const { data: lead } = await supabase.from('leads').select('id, status').eq('phone', LEAD_PHONE).single();
  console.log("Lead Status:", lead?.status);
  
  if (lead) {
    const { data: appts } = await supabase.from('appointments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(2);
    console.log("Recent Appointments:");
    console.log(JSON.stringify(appts, null, 2));
  }
}

async function runTests() {
  console.log("STARTING APPOINTMENT SYSTEM TESTS...");
  
  // 1. Initial Greeting / Booking
  await sendWebhook("Hi, looking for a 2BHK");
  await sendWebhook("I want to book a visit for 4:30 PM today");
  
  // 2. Reschedule
  await sendWebhook("Actually, reschedule to 5:45 PM tomorrow please");
  
  // 3. Cancel
  await sendWebhook("Sorry, I have to cancel the visit entirely");
  
  console.log("\nTESTS FINISHED.");
}

runTests();
