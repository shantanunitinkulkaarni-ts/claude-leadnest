require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: msgs } = await supabase.from('messages').select('*').order('created_at', {ascending: false}).limit(10);
  console.log("MESSAGES:", msgs);
  
  const { data: leads } = await supabase.from('leads').select('id, bot_paused, phone').order('updated_at', {ascending: false}).limit(5);
  console.log("LEADS:", leads);
}
check();
