require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function testOnboarding() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const testEmail = `shantanu.test${Date.now()}@gmail.com`;
  const testPassword = 'TestPassword123!';

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('1. Admin creating user:', testEmail);
  const { data: adminData, error: adminError } = await adminSupabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true
  });

  if (adminError) {
    console.error('Admin createUser failed:', adminError.message);
    process.exit(1);
  }

  console.log('User created. Signing in to get session...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (authError || !authData.session) {
    console.error('Login failed:', authError?.message || 'No session');
    process.exit(1);
  }

  // To perfectly mimic the client, we use the user's session
  console.log('User signed up. ID:', authData.user.id);

  console.log('2. Inserting into agents...');
  const { data: agentData, error: agentError } = await supabase.from('agents').insert({
    email: testEmail,
    name: 'Test Owner',
    phone: '1234567890',
    agency_name: 'Test Agency',
    city: 'Pune',
    state: 'Maharashtra',
    bot_active: true,
    wa_balance: 0,
    plan: 'free',
    plan_status: 'active'
  }).select().single();

  if (agentError) {
    console.error('Agent insert failed:', agentError);
    process.exit(1);
  }

  console.log('Agent inserted. ID:', agentData.id);

  console.log('3. Inserting into team_members...');
  const { error: teamError } = await supabase.from('team_members').insert({
    agent_id: agentData.id,
    auth_user_id: authData.user.id,
    role: 'owner',
    name: 'Test Owner',
    email: testEmail,
    phone: '1234567890'
  });

  if (teamError) {
    console.error('Team member insert failed:', teamError);
    process.exit(1);
  }

  console.log('Team member inserted successfully!');
  console.log('E2E Onboarding Flow Test: PASS');
}

testOnboarding();
