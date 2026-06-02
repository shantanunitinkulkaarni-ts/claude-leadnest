const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hinqahjhtgsmljrrozql.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFhaGpodGdzbWxqcnJvenFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY0ODEzMCwiZXhwIjoyMDk1MjI0MTMwfQ.iwVpezqUf8qo4ulfTJuYuSkd_cLx-4_0kvwRBKA0AtY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function wipeData() {
  console.log("Wiping all messages...");
  await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  console.log("Wiping all activity logs...");
  await supabase.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Wiping all appointments...");
  await supabase.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Wiping all leads...");
  await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Data successfully erased. Starting fresh!");
}

wipeData();
