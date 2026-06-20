/**
 * Jest Fixtures — Lead Test Data
 * Realistic lead scenarios for unit tests
 */

export const mockLeads = {
  // ── Fresh lead, no criteria ──
  brand_new_lead: {
    id: 'lead-brand-new',
    phone: '+919876543210',
    agent_id: 'agent-1',
    name: null,
    created_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    conversation_stage: 'new',
    intent: null,
    preferred_areas: [],
    budget_min: null,
    budget_max: null,
    bhk: null,
    property_category: null,
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(), // +24h
    opted_in: true,
    status: 'new',
    temperature: 'new',
  },

  // ── Rental lead with complete criteria ──
  rental_lead_full_criteria: {
    id: 'lead-rental-full',
    phone: '+919876543211',
    agent_id: 'agent-1',
    name: 'Amit Joshi',
    created_at: new Date('2026-06-20T08:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    conversation_stage: 'discovery',
    intent: 'rent',
    preferred_areas: ['baner'],
    budget_min: 15000,
    budget_max: 30000,
    bhk: '2BHK',
    property_category: 'apartment',
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(),
    opted_in: true,
    status: 'contacted',
    temperature: 'hot',
  },

  // ── Buy lead with budget too low ──
  buy_lead_low_budget: {
    id: 'lead-buy-low',
    phone: '+919876543212',
    agent_id: 'agent-1',
    name: 'Priya Kumar',
    created_at: new Date('2026-06-20T09:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    conversation_stage: 'presentation',
    intent: 'buy',
    preferred_areas: ['baner'],
    budget_min: null,
    budget_max: 30000000, // 30L
    bhk: null,
    property_category: null,
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(),
    opted_in: true,
    status: 'contacted',
    temperature: 'warm',
  },

  // ── Multiple areas ──
  lead_multiple_areas: {
    id: 'lead-multi-area',
    phone: '+919876543213',
    agent_id: 'agent-1',
    name: 'Rahul Sharma',
    created_at: new Date('2026-06-20T07:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    conversation_stage: 'presentation',
    intent: 'rent',
    preferred_areas: ['baner', 'aundh', 'wakad'],
    budget_min: 20000,
    budget_max: 35000,
    bhk: null,
    property_category: 'apartment',
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(),
    opted_in: true,
    status: 'qualified',
    temperature: 'hot',
  },

  // ── Window expired ──
  lead_window_expired: {
    id: 'lead-window-expired',
    phone: '+919876543214',
    agent_id: 'agent-1',
    name: 'Neha Patel',
    created_at: new Date('2026-06-18T10:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-18T10:00:00Z').toISOString(),
    conversation_stage: 'presentation',
    intent: 'rent',
    preferred_areas: ['koregaon park'],
    budget_min: null,
    budget_max: 100000,
    bhk: '3BHK',
    property_category: 'apartment',
    window_expires_at: new Date('2026-06-19T10:00:00Z').toISOString(), // past
    opted_in: true,
    status: 'contacted',
    temperature: 'cold',
  },

  // ── Opted out ──
  lead_opted_out: {
    id: 'lead-opted-out',
    phone: '+919876543215',
    agent_id: 'agent-1',
    name: 'Sanjay Desai',
    created_at: new Date('2026-06-19T10:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T08:00:00Z').toISOString(),
    conversation_stage: 'lost',
    intent: 'buy',
    preferred_areas: ['magarpatta'],
    budget_min: null,
    budget_max: 50000000,
    bhk: '2BHK',
    property_category: 'apartment',
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(),
    opted_in: false, // ← opted out
    status: 'closed_lost',
    temperature: 'cold',
  },

  // ── Premium buyer ──
  premium_buy_lead: {
    id: 'lead-premium-buy',
    phone: '+919876543216',
    agent_id: 'agent-1',
    name: 'Vikram Singh',
    created_at: new Date('2026-06-20T09:30:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T09:30:00Z').toISOString(),
    conversation_stage: 'discovery',
    intent: 'buy',
    preferred_areas: ['koregaon park'],
    budget_min: 10000000,
    budget_max: 20000000, // 1-2 Cr
    bhk: '3BHK',
    property_category: 'apartment',
    window_expires_at: new Date('2026-06-21T09:30:00Z').toISOString(),
    opted_in: true,
    status: 'contacted',
    temperature: 'hot',
  },

  // ── No area specified ──
  lead_no_area: {
    id: 'lead-no-area',
    phone: '+919876543217',
    agent_id: 'agent-1',
    name: 'Isha Gupta',
    created_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    last_message_at: new Date('2026-06-20T10:00:00Z').toISOString(),
    conversation_stage: 'awaiting_area',
    intent: 'rent',
    preferred_areas: [], // empty
    budget_min: null,
    budget_max: 25000,
    bhk: '2BHK',
    property_category: null,
    window_expires_at: new Date('2026-06-21T10:00:00Z').toISOString(),
    opted_in: true,
    status: 'contacted',
    temperature: 'warm',
  },
}

export const rentalLeads = [
  mockLeads.rental_lead_full_criteria,
  mockLeads.lead_multiple_areas,
  mockLeads.lead_window_expired,
  mockLeads.lead_no_area,
]

export const buyLeads = [
  mockLeads.buy_lead_low_budget,
  mockLeads.premium_buy_lead,
]

export const activeLeads = [
  mockLeads.brand_new_lead,
  mockLeads.rental_lead_full_criteria,
  mockLeads.buy_lead_low_budget,
  mockLeads.lead_multiple_areas,
  mockLeads.lead_window_expired,
  mockLeads.premium_buy_lead,
  mockLeads.lead_no_area,
]
