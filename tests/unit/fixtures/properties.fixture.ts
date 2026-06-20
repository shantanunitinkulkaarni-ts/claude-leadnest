/**
 * Playwright Fixtures — Property Test Data
 * Realistic property data for unit tests
 */

import { type PropertyRow } from '@/lib/propertySearch'

export const mockProperties: Record<string, PropertyRow> = {
  // ── Baner Cluster (West Pune) ──
  baner_rental_2bhk_20k: {
    id: 'prop-baner-rental-2bhk-20k',
    agent_id: 'agent-1',
    title: 'Cozy 2BHK Apartment',
    type: 'rental' as const,
    category: 'apartment',
    location: 'Baner',
    city: 'Pune',
    price: null,
    rent_per_month: 20000,
    size_sqft: 900,
    bhk: '2BHK',
    description: 'Well-maintained 2BHK with parking',
    features: ['parking', 'gym', 'water tank'],
    property_media: ['https://example.com/photo1.jpg'],
    status: 'active',
    facing: 'east',
  },

  baner_rental_3bhk_35k: {
    id: 'prop-baner-rental-3bhk-35k',
    agent_id: 'agent-1',
    title: 'Spacious 3BHK Rental',
    type: 'rental' as const,
    category: 'apartment',
    location: 'Baner',
    city: 'Pune',
    price: null,
    rent_per_month: 35000,
    size_sqft: 1200,
    bhk: '3BHK',
    description: 'Modern 3BHK with balcony',
    features: ['parking', 'gym', 'lift'],
    property_media: [],
    status: 'active',
    facing: 'north',
  },

  baner_sale_2bhk_50l: {
    id: 'prop-baner-sale-2bhk-50l',
    agent_id: 'agent-1',
    title: 'Buy 2BHK in Baner',
    type: 'sale' as const,
    category: 'apartment',
    location: 'Baner',
    city: 'Pune',
    price: 5000000, // 50L
    rent_per_month: null,
    size_sqft: 950,
    bhk: '2BHK',
    description: '2BHK for sale',
    features: ['parking', 'gym'],
    property_media: ['https://example.com/sale1.jpg'],
    status: 'active',
    facing: 'west',
  },

  baner_sale_3bhk_75l: {
    id: 'prop-baner-sale-3bhk-75l',
    agent_id: 'agent-1',
    title: 'Premium 3BHK Sale',
    type: 'sale' as const,
    category: 'apartment',
    location: 'Baner',
    city: 'Pune',
    price: 7500000, // 75L
    rent_per_month: null,
    size_sqft: 1300,
    bhk: '3BHK',
    description: 'Ready-to-move 3BHK',
    features: ['parking', 'lift', 'gym', 'pool'],
    property_media: [],
    status: 'active',
    facing: 'south',
  },

  // ── Aundh (nearby to Baner) ──
  aundh_rental_2bhk_18k: {
    id: 'prop-aundh-rental-2bhk-18k',
    agent_id: 'agent-1',
    title: 'Aundh 2BHK Rental',
    type: 'rental' as const,
    category: 'apartment',
    location: 'Aundh',
    city: 'Pune',
    price: null,
    rent_per_month: 18000,
    size_sqft: 850,
    bhk: '2BHK',
    description: 'Affordable 2BHK in Aundh',
    features: ['parking'],
    property_media: [],
    status: 'active',
    facing: 'north',
  },

  aundh_sale_2bhk_45l: {
    id: 'prop-aundh-sale-2bhk-45l',
    agent_id: 'agent-1',
    title: 'Aundh 2BHK Sale',
    type: 'sale' as const,
    category: 'apartment',
    location: 'Aundh',
    city: 'Pune',
    price: 4500000, // 45L
    rent_per_month: null,
    size_sqft: 900,
    bhk: '2BHK',
    description: 'Budget-friendly 2BHK sale',
    features: ['parking', 'gym'],
    property_media: [],
    status: 'active',
    facing: 'east',
  },

  // ── Koregaon Park (Premium area) ──
  kp_sale_3bhk_1_5cr: {
    id: 'prop-kp-sale-3bhk-1.5cr',
    agent_id: 'agent-1',
    title: 'Koregaon Park Luxury 3BHK',
    type: 'sale' as const,
    category: 'apartment',
    location: 'Koregaon Park',
    city: 'Pune',
    price: 15000000, // 1.5 Cr
    rent_per_month: null,
    size_sqft: 1500,
    bhk: '3BHK',
    description: 'Ultra-premium 3BHK',
    features: ['parking', 'gym', 'pool', 'security'],
    property_media: [],
    status: 'active',
    facing: 'north',
  },

  // ── No BHK specified ──
  mystery_location_10k: {
    id: 'prop-mystery-location-10k',
    agent_id: 'agent-1',
    title: 'Unknown Property',
    type: 'rental' as const,
    category: null,
    location: 'Unknown Area',
    city: 'Pune',
    price: null,
    rent_per_month: 10000,
    size_sqft: null,
    bhk: null, // No BHK
    description: 'Mystery property',
    features: [],
    property_media: [],
    status: 'active',
    facing: null,
  },

  // ── Inactive (should be filtered out) ──
  inactive_property: {
    id: 'prop-inactive-baner-50l',
    agent_id: 'agent-1',
    title: 'Sold Property',
    type: 'sale' as const,
    category: 'apartment',
    location: 'Baner',
    city: 'Pune',
    price: 5000000,
    rent_per_month: null,
    size_sqft: 950,
    bhk: '2BHK',
    description: 'Already sold',
    features: [],
    property_media: [],
    status: 'sold', // ← inactive
    facing: 'west',
  },

  // ── Typo tolerance test ──
  baner_typo_location: {
    id: 'prop-baner-typo-rental-25k',
    agent_id: 'agent-1',
    title: 'Baner Rental (stored as Baner)',
    type: 'rental' as const,
    category: 'apartment',
    location: 'baner', // lowercase
    city: 'Pune',
    price: null,
    rent_per_month: 25000,
    size_sqft: 1000,
    bhk: '2BHK',
    description: 'Should match typo-tolerant search',
    features: ['parking'],
    property_media: [],
    status: 'active',
    facing: 'east',
  },
}

// Convenience exports by category
export const banerRentals: PropertyRow[] = [
  mockProperties.baner_rental_2bhk_20k,
  mockProperties.baner_rental_3bhk_35k,
]

export const banerSales: PropertyRow[] = [
  mockProperties.baner_sale_2bhk_50l,
  mockProperties.baner_sale_3bhk_75l,
]

export const aundhProperties: PropertyRow[] = [
  mockProperties.aundh_rental_2bhk_18k,
  mockProperties.aundh_sale_2bhk_45l,
]

export const allActiveProperties: PropertyRow[] = [
  mockProperties.baner_rental_2bhk_20k,
  mockProperties.baner_rental_3bhk_35k,
  mockProperties.baner_sale_2bhk_50l,
  mockProperties.baner_sale_3bhk_75l,
  mockProperties.aundh_rental_2bhk_18k,
  mockProperties.aundh_sale_2bhk_45l,
  mockProperties.kp_sale_3bhk_1_5cr,
  mockProperties.mystery_location_10k,
  mockProperties.baner_typo_location,
]

export const withInactiveProperty: PropertyRow[] = [
  ...allActiveProperties,
  mockProperties.inactive_property,
]
