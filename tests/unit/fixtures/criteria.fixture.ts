/**
 * Jest Fixtures — Criteria Test Data
 * Test cases for criteria extraction and merging
 */

export const extractionTestCases = {
  // ── Intent Extraction ──
  intent: [
    { input: 'I want to buy a property', expected: 'buy' },
    { input: 'Looking to purchase', expected: 'buy' },
    { input: 'Want to rent an apartment', expected: 'rent' },
    { input: 'Searching for rental', expected: 'rent' },
    { input: 'Khareedni hai', expected: 'buy' }, // Hindi
    { input: 'Kiraye par chahiye', expected: 'rent' }, // Hindi
    { input: 'Mujhe villa khareedna hai', expected: 'buy' },
    { input: 'Show me properties', expected: null }, // ambiguous
    { input: 'What is your office address?', expected: null }, // not intent
  ],

  // ── Area Extraction ──
  area: [
    { input: 'in Baner', expected: 'baner' },
    { input: 'Pune mein Aundh area', expected: 'aundh' },
    { input: 'properties at Koregaon Park', expected: 'koregaon park' },
    { input: 'madhe Sus', expected: 'sus' }, // Marathi
    { input: 'Baner', expected: 'baner' }, // standalone
    { input: 'Looking in Baner for 2BHK', expected: 'baner' },
    { input: 'What is your number?', expected: null }, // no area
    { input: 'I dont have any preference', expected: null },
  ],

  // ── Budget Extraction ──
  budget: [
    { input: '30000', expected: 30000 },
    { input: '30k', expected: 30000 },
    { input: '30K rent', expected: 30000 },
    { input: '50 lakh', expected: 5000000 },
    { input: '50l', expected: 5000000 },
    { input: '1 crore', expected: 10000000 },
    { input: '1cr', expected: 10000000 },
    { input: '1.5 crore', expected: 15000000 },
    { input: '2.5l', expected: 250000 },
    { input: 'within 40k', expected: 40000 },
    { input: 'upto 75 lakh', expected: 7500000 },
    { input: 'No budget', expected: null },
    { input: 'What is the price?', expected: null },
  ],

  // ── BHK Extraction ──
  bhk: [
    { input: '2BHK apartment', expected: '2bhk' },
    { input: '3 bhk', expected: '3bhk' },
    { input: '1bhk office', expected: '1bhk' },
    { input: '4 BHK villa', expected: '4bhk' },
    { input: 'bhk preference?', expected: null },
    { input: 'any property type', expected: null },
  ],
}

// ── Merge Scenarios ──
export const mergeScenarios = {
  newer_intent_overrides_stored: {
    lead: {
      intent: 'buy',
      preferred_areas: ['baner'],
      budget_max: 50000000,
      bhk: '2BHK',
    },
    extracted: {
      intent: 'rent', // ← newer
      areas: null,
      budget_max: null,
      budget_min: null,
      bhk: null,
    },
    expected: {
      intent: 'rent', // ← overwritten
      preferred_areas: ['baner'], // ← preserved
      budget_max: 50000000, // ← preserved
      bhk: '2BHK', // ← preserved
    },
  },

  newer_area_appends: {
    lead: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: 30000,
      bhk: null,
    },
    extracted: {
      intent: null,
      areas: ['aundh'], // ← newer
      budget_max: null,
      budget_min: null,
      bhk: null,
    },
    expected: {
      intent: 'rent', // ← preserved
      preferred_areas: ['aundh'], // ← newer takes full array
      budget_max: 30000, // ← preserved
      bhk: null,
    },
  },

  newer_budget_overrides: {
    lead: {
      intent: 'buy',
      preferred_areas: ['koregaon park'],
      budget_max: 10000000,
      bhk: '3BHK',
    },
    extracted: {
      intent: null,
      areas: null,
      budget_max: 15000000, // ← newer (increased budget)
      budget_min: null,
      bhk: null,
    },
    expected: {
      intent: 'buy', // ← preserved
      preferred_areas: ['koregaon park'], // ← preserved
      budget_max: 15000000, // ← overwritten
      bhk: '3BHK', // ← preserved
    },
  },

  all_criteria_from_message: {
    lead: {
      intent: null,
      preferred_areas: [],
      budget_max: null,
      bhk: null,
    },
    extracted: {
      intent: 'rent',
      areas: ['baner'],
      budget_max: 30000,
      budget_min: 20000,
      bhk: '2BHK',
    },
    expected: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: 30000,
      budget_min: 20000,
      bhk: '2BHK',
    },
  },

  null_handling: {
    lead: {
      intent: 'buy',
      preferred_areas: ['baner'],
      budget_max: null, // missing
      bhk: '2BHK',
    },
    extracted: {
      intent: null, // no new intent
      areas: null, // no new area
      budget_max: null, // also null
      budget_min: null,
      bhk: null,
    },
    expected: {
      intent: 'buy', // ← preserved
      preferred_areas: ['baner'], // ← preserved
      budget_max: null, // ← still null
      bhk: '2BHK', // ← preserved
    },
  },
}

// ── Fallback Chain Test Scenarios ──
export const fallbackScenarios = {
  level1_exact_match: {
    name: 'Level 1: Area + Intent + Budget',
    lead: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: 30000,
      bhk: null,
    },
    activeProperties: [
      // Baner rentals within budget
      {
        id: '1',
        location: 'Baner',
        type: 'rental',
        rent_per_month: 20000,
        price: null,
      },
      {
        id: '2',
        location: 'Baner',
        type: 'rental',
        rent_per_month: 28000,
        price: null,
      },
      // Baner rental over budget
      {
        id: '3',
        location: 'Baner',
        type: 'rental',
        rent_per_month: 40000,
        price: null,
      },
      // Sale property (wrong intent)
      {
        id: '4',
        location: 'Baner',
        type: 'sale',
        rent_per_month: null,
        price: 5000000,
      },
    ],
    expected: {
      level: 'exact',
      count: 2, // 20k, 28k
      propertyIds: ['1', '2'],
    },
  },

  level2_no_budget: {
    name: 'Level 2: Area + Intent (no budget)',
    lead: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: null, // no budget
      bhk: null,
    },
    activeProperties: [
      { id: '1', location: 'Baner', type: 'rental', rent_per_month: 20000 },
      { id: '2', location: 'Baner', type: 'rental', rent_per_month: 50000 },
      { id: '3', location: 'Baner', type: 'sale', price: 5000000 },
    ],
    expected: {
      level: 'area_no_budget',
      count: 2, // both rentals
      propertyIds: ['1', '2'],
    },
  },

  level3_nearby_areas: {
    name: 'Level 3: Nearby Areas + Intent',
    lead: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: 30000,
      bhk: null,
    },
    activeProperties: [
      // Baner: 0 rentals
      { id: '1', location: 'Baner', type: 'sale', price: 5000000 },
      // Aundh (nearby): rentals
      { id: '2', location: 'Aundh', type: 'rental', rent_per_month: 18000 },
      { id: '3', location: 'Aundh', type: 'rental', rent_per_month: 25000 },
      // Different area: rentals
      { id: '4', location: 'Magarpatta', type: 'rental', rent_per_month: 22000 },
    ],
    expected: {
      level: 'nearby',
      count: 2, // Aundh rentals
      propertyIds: ['2', '3'],
      nearbyAreas: ['Aundh'],
    },
  },

  level4_no_inventory: {
    name: 'Level 4: No Inventory for Intent',
    lead: {
      intent: 'rent',
      preferred_areas: ['baner'],
      budget_max: 30000,
      bhk: null,
    },
    activeProperties: [
      // Baner: only sales
      { id: '1', location: 'Baner', type: 'sale', price: 5000000 },
      { id: '2', location: 'Baner', type: 'sale', price: 7500000 },
      // Nearby areas: only sales
      { id: '3', location: 'Aundh', type: 'sale', price: 4500000 },
    ],
    expected: {
      level: 'no_inventory',
      intentLabel: 'rental',
    },
  },

  level4_none: {
    name: 'Level 4: Truly no match',
    lead: {
      intent: 'buy',
      preferred_areas: ['mars'],
      budget_max: 10000000,
      bhk: null,
    },
    activeProperties: [
      { id: '1', location: 'Baner', type: 'rental', rent_per_month: 20000 },
    ],
    expected: {
      level: 'none',
      count: 0,
    },
  },
}

// ── Message Extraction Test Messages ──
export const messageExtractionTestCases = [
  {
    message: 'I want to rent a 2BHK in Baner with 25k budget',
    expected: {
      intent: 'rent',
      areas: ['baner'],
      budget_max: 25000,
      bhk: '2BHK',
    },
  },
  {
    message: 'buy 3bhk in Aundh upto 50 lakh',
    expected: {
      intent: 'buy',
      areas: ['aundh'],
      budget_max: 5000000,
      bhk: '3bhk',
    },
  },
  {
    message: 'Kiraye par 2 bhk Koregaon Park mein 30000 tak',
    expected: {
      intent: 'rent',
      areas: ['koregaon park'],
      budget_max: 30000,
      bhk: '2bhk',
    },
  },
  {
    message: 'Show me properties',
    expected: {
      intent: null,
      areas: null,
      budget_max: null,
      bhk: null,
    },
  },
]
