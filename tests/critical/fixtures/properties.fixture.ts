/**
 * Test fixture data for property tests
 */

export const rentalPropertyFixture = {
  id: 'rental-1',
  agent_id: 'agent-1',
  type: 'rental',
  title: 'Modern 2BHK Apartment',
  location: 'Baner',
  city: 'Pune',
  rent_per_month: 20000,
  price: null,
  bhk: '2BHK',
  size_sqft: 1100,
  category: 'apartment',
  description: 'Modern apartment with all amenities',
  features: ['gym', 'pool', 'parking'],
  property_media: [],
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const salePropertyFixture = {
  id: 'sale-1',
  agent_id: 'agent-1',
  type: 'sale',
  title: 'Luxury Villa',
  location: 'Wakad',
  city: 'Pune',
  price: 8500000,
  rent_per_month: null,
  bhk: '3BHK',
  size_sqft: 1450,
  category: 'villa',
  description: 'Luxury villa with premium features',
  features: ['garden', 'parking', 'security'],
  property_media: [],
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const rentalPropertyAllFields = {
  ...rentalPropertyFixture,
  id: 'rental-2',
  deposit: 60000,
  possession_status: 'ready_to_move',
  possession_date: null,
  project_website: null,
  website_ai_consent: false,
  extra_info: '5 min from Jupiter Hospital',
}

export const salePropertyAllFields = {
  ...salePropertyFixture,
  id: 'sale-2',
  possession_status: 'ready_to_move',
  possession_date: null,
  project_website: 'https://example.com',
  website_ai_consent: true,
  extra_info: 'Prime location, gated community',
}

export const invalidPropertyMissingType = {
  id: 'invalid-1',
  agent_id: 'agent-1',
  title: 'Test Property',
  location: 'Baner',
  // Missing type
  price: 1000000,
}

export const invalidRentalMissingRent = {
  id: 'invalid-2',
  agent_id: 'agent-1',
  type: 'rental',
  title: 'Test Rental',
  location: 'Baner',
  // Missing rent_per_month
  price: null,
  rent_per_month: null,
}

export const invalidSaleMissingPrice = {
  id: 'invalid-3',
  agent_id: 'agent-1',
  type: 'sale',
  title: 'Test Sale',
  location: 'Baner',
  // Missing price
  price: null,
  rent_per_month: null,
}
