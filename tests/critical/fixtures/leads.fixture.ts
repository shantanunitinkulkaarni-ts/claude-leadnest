/**
 * Test fixture data for lead tests
 */

export const newLeadFixture = {
  id: 'lead-1',
  agent_id: 'agent-1',
  phone: '+919876543210',
  name: 'Test Lead',
  intent: null,
  preferred_areas: [],
  budget_max: null,
  budget_min: null,
  status: 'new',
  temperature: 'new',
  state: 'NEW',
  conversation_stage: 'new',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
}

export const rentalLeadFixture = {
  ...newLeadFixture,
  id: 'lead-2',
  intent: 'rent',
  preferred_areas: ['Baner', 'Aundh'],
  budget_max: 25000,
  status: 'contacted',
  temperature: 'warm',
  state: 'IN_CONVERSATION',
  conversation_stage: 'awaiting_area',
}

export const qualifiedLeadFixture = {
  ...rentalLeadFixture,
  id: 'lead-3',
  status: 'qualified',
  temperature: 'hot',
  state: 'QUALIFYING',
  conversation_stage: 'awaiting_intent',
}

export const leadWithCriteria = {
  ...rentalLeadFixture,
  id: 'lead-4',
  intent: 'rent',
  preferred_areas: ['Baner'],
  budget_max: 20000,
  // BHK criteria would be extracted and stored in future
}

export const buyLeadFixture = {
  ...newLeadFixture,
  id: 'lead-5',
  intent: 'buy',
  preferred_areas: ['Wakad'],
  budget_max: 8500000,
  state: 'IN_CONVERSATION',
  conversation_stage: 'awaiting_area',
}

export const leadVisitRequestedFixture = {
  ...rentalLeadFixture,
  id: 'lead-6',
  status: 'visit_booked',
  state: 'VISIT_REQUESTED',
  conversation_stage: 'awaiting_booking',
  pending_appointment_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
}

export const leadVisitConfirmedFixture = {
  ...rentalLeadFixture,
  id: 'lead-7',
  status: 'visit_booked',
  state: 'VISIT_CONFIRMED',
  conversation_stage: 'booked',
}
