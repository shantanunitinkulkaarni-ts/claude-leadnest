/**
 * Property Search Engine for ACE
 *
 * Core responsibility: Match lead criteria to properties with intelligent fallback chain.
 *
 * Rules (non-negotiable):
 * - Rental leads NEVER see sale properties
 * - Buy leads NEVER see rental properties
 * - Budget filtering is optional (when absent, all prices match)
 * - Intent filtering is mandatory (intent is always required)
 * - Fallback chain respects intent at all levels
 */

// ─── Area Adjacency Map ──────────────────────────────────────────────────────
// When exact area returns nothing, expand to adjacent localities
export const NEARBY_AREAS: Record<string, string[]> = {
  // West Pune cluster
  baner: ['aundh', 'hinjawadi', 'wakad', 'balewadi', 'pashan'],
  aundh: ['baner', 'pashan', 'wakad', 'hinjawadi'],
  hinjawadi: ['wakad', 'baner', 'balewadi', 'aundh'],
  wakad: ['hinjawadi', 'baner', 'balewadi', 'aundh'],
  balewadi: ['baner', 'hinjawadi', 'wakad', 'aundh'],
  pashan: ['baner', 'aundh', 'wakad'],

  // East Pune cluster
  kharadi: ['viman nagar', 'wagholi', 'magarpatta', 'hadapsar', 'kalyani nagar'],
  'viman nagar': ['kharadi', 'kalyani nagar', 'wagholi', 'magarpatta'],
  wagholi: ['kharadi', 'viman nagar'],
  magarpatta: ['hadapsar', 'kharadi', 'viman nagar'],
  'kalyani nagar': ['viman nagar', 'kharadi', 'magarpatta'],

  // South / Central Pune cluster
  kothrud: ['karve nagar', 'bavdhan', 'warje', 'erandwane', 'deccan'],
  'karve nagar': ['kothrud', 'warje', 'erandwane', 'deccan'],
  warje: ['kothrud', 'karve nagar', 'bavdhan'],
  bavdhan: ['kothrud', 'pashan', 'warje'],
  erandwane: ['kothrud', 'karve nagar', 'deccan'],
  deccan: ['erandwane', 'kothrud', 'karve nagar'],

  // North Pune cluster
  pimpri: ['chinchwad', 'nigdi', 'bhonsari'],
  chinchwad: ['pimpri', 'nigdi'],
  nigdi: ['pimpri', 'chinchwad'],

  // East South cluster
  hadapsar: ['magarpatta', 'kharadi', 'wanowrie', 'mundhwa'],
  wanowrie: ['hadapsar', 'mundhwa', 'magarpatta'],
  mundhwa: ['hadapsar', 'kharadi', 'magarpatta', 'wanowrie'],

  // Koregaon Park cluster
  'koregaon park': ['kalyani nagar', 'viman nagar', 'kharadi'],
}

// ─── Types ──────────────────────────────────────────────────────────────────
export type SearchLevel = 'exact' | 'area_no_budget' | 'nearby' | 'no_inventory' | 'none'

export interface SearchCriteria {
  intent: 'buy' | 'rent' | null
  preferred_areas: string[]
  budget_max: number | null
  budget_min?: number | null
}

export interface PropertyRow {
  id: string
  agent_id: string
  type: 'sale' | 'rental'
  location: string
  price?: number | null
  rent_per_month?: number | null
  title?: string
  bhk?: string | null
  size_sqft?: number | null
  [key: string]: any
}

export interface SearchResult {
  level: SearchLevel
  properties: PropertyRow[]
  nearbyAreas?: string[]
  intentLabel?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────
const BUDGET_TOLERANCE = 1.2 // 20% above stated budget is acceptable
const INTENT_TYPE_MAP: Record<string, 'sale' | 'rental'> = {
  buy: 'sale',
  rent: 'rental',
}

// ─── Fuzzy Area Matching ────────────────────────────────────────────────────
/**
 * Check if a property location matches the lead's requested area.
 *
 * Handles:
 * - Exact substring match ("Baner" in "Baner Pune")
 * - Case-insensitive ("BANER" vs "baner")
 * - Single-character typo tolerance (edit distance ≤ 1 for short areas)
 *
 * Does NOT use word boundaries (broken in Devanagari), relies on substring.
 */
function areaMatches(propertyLocation: string, requestedArea: string): boolean {
  if (!requestedArea || !propertyLocation) return false

  const loc = (propertyLocation || '').toLowerCase().trim()
  const area = (requestedArea || '').toLowerCase().trim()

  // Exact substring match
  if (loc.includes(area)) return true

  // Typo tolerance: edit distance ≤ 1 for areas of similar length
  if (Math.abs(loc.length - area.length) <= 2) {
    const distance = levenshteinDistance(loc, area)
    // Only allow 1 edit for areas 5+ chars; stricter for short names
    const threshold = area.length >= 5 ? 1 : 0
    if (distance <= threshold) return true
  }

  return false
}

/**
 * Restricted Levenshtein distance (handles single transpositions).
 * Used for typo-tolerant area matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

// ─── Price Checking ────────────────────────────────────────────────────────
/**
 * Check if a property is within lead's budget (with tolerance).
 * For rentals: compare rent_per_month
 * For sales: compare price
 * Budget tolerance: 20% above stated max is acceptable
 */
function isWithinBudget(property: PropertyRow, budgetMax: number | null, propertyType: 'sale' | 'rental'): boolean {
  if (!budgetMax || budgetMax <= 0) return true // No budget = all prices match

  const propertyPrice = propertyType === 'rental'
    ? (property.rent_per_month || 0)
    : (property.price || 0)

  if (!propertyPrice) return false // Property has no price set

  return propertyPrice <= budgetMax * BUDGET_TOLERANCE
}

// ─── Core Search Function ──────────────────────────────────────────────────
/**
 * searchPropertiesByFallbackChain
 *
 * Attempts to find matching properties through a progressive fallback chain,
 * always respecting the lead's intent (never showing opposite type).
 *
 * Fallback levels (in order):
 * 1. Exact area + intent + budget
 * 2. Exact area + intent (no budget constraint)
 * 3. Nearby areas + intent (no budget constraint)
 * 4. No inventory for this intent (message only)
 * 5. Truly no match
 *
 * @param properties - All active properties for the agent
 * @param criteria - Lead's extracted criteria (intent, areas, budget)
 * @returns SearchResult with level, properties, nearbyAreas
 */
export function searchPropertiesByFallbackChain(
  properties: PropertyRow[],
  criteria: SearchCriteria
): SearchResult {
  if (!criteria.intent) {
    return { level: 'none', properties: [] }
  }

  const propertyType = INTENT_TYPE_MAP[criteria.intent]
  const allActiveProperties = (properties || []).filter(p => p.status === 'active')

  // ── LEVEL 1: Exact area + intent + budget ──
  let filtered = allActiveProperties.filter(p => {
    if (p.type !== propertyType) return false // Intent filter
    if (!criteria.preferred_areas?.length) return false
    if (!criteria.preferred_areas.some(area => areaMatches(p.location, area))) return false
    if (!isWithinBudget(p, criteria.budget_max || 0, propertyType)) return false
    return true
  })

  if (filtered.length > 0) {
    return {
      level: 'exact',
      properties: rankPropertiesByFit(filtered, criteria),
    }
  }

  // ── LEVEL 2: Exact area + intent (drop budget) ──
  filtered = allActiveProperties.filter(p => {
    if (p.type !== propertyType) return false // Intent filter (MANDATORY)
    if (!criteria.preferred_areas?.length) return false
    if (!criteria.preferred_areas.some(area => areaMatches(p.location, area))) return false
    return true
  })

  if (filtered.length > 0) {
    return {
      level: 'area_no_budget',
      properties: rankPropertiesByFit(filtered, criteria),
    }
  }

  // ── LEVEL 3: Nearby areas + intent ──
  if (criteria.preferred_areas?.length) {
    const nearbyAreasToSearch = getNearbyAreasForCriteria(criteria.preferred_areas)

    filtered = allActiveProperties.filter(p => {
      if (p.type !== propertyType) return false // Intent filter (MANDATORY)
      if (!nearbyAreasToSearch.some(area => areaMatches(p.location, area))) return false
      return true
    })

    if (filtered.length > 0) {
      const matchedAreas = extractMatchedNearbyAreas(filtered, nearbyAreasToSearch)
      return {
        level: 'nearby',
        properties: rankPropertiesByFit(filtered, criteria),
        nearbyAreas: matchedAreas,
      }
    }
  }

  // ── LEVEL 4: Check if inventory exists for this intent at all ──
  const inventoryForIntent = allActiveProperties.filter(p => p.type === propertyType)

  if (inventoryForIntent.length === 0) {
    // No inventory for this intent anywhere (e.g., no rentals in agent's portfolio)
    return {
      level: 'no_inventory',
      properties: [],
      intentLabel: criteria.intent === 'rent' ? 'rental' : 'sale',
    }
  }

  // ── LEVEL 5: Truly no match ──
  return {
    level: 'none',
    properties: [],
  }
}

// ─── Helper Functions ──────────────────────────────────────────────────────
/**
 * Get all nearby areas for a list of preferred areas.
 * Deduped and flattened.
 */
function getNearbyAreasForCriteria(preferredAreas: string[]): string[] {
  const nearby = new Set<string>()

  for (const area of preferredAreas) {
    const key = area.toLowerCase().trim()
    const adjacent = NEARBY_AREAS[key]

    if (adjacent) {
      for (const adjArea of adjacent) {
        nearby.add(adjArea)
      }
    }
  }

  return Array.from(nearby)
}

/**
 * From a list of properties, extract which nearby areas had matches.
 * Used for messaging ("...in nearby Aundh, Pashan...")
 */
function extractMatchedNearbyAreas(properties: PropertyRow[], searchedAreas: string[]): string[] {
  const matched = new Set<string>()

  for (const area of searchedAreas) {
    if (properties.some(p => areaMatches(p.location, area))) {
      // Capitalize for display
      const display = area.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      matched.add(display)
    }
  }

  return Array.from(matched)
}

/**
 * Rank properties by fit (best-first).
 * Higher score = better match.
 * Factors: budget usage, area exactness, BHK match
 */
function rankPropertiesByFit(properties: PropertyRow[], criteria: SearchCriteria): PropertyRow[] {
  const scored = properties.map(p => {
    let score = 0

    // Budget fit (if budget exists)
    if (criteria.budget_max) {
      const price = criteria.intent === 'rent'
        ? (p.rent_per_month || 0)
        : (p.price || 0)

      if (price > 0) {
        if (price <= criteria.budget_max) {
          // Within budget: 60 base + up to 40 for using more of budget
          score += 60 + Math.round((price / criteria.budget_max) * 40)
        } else {
          // Over budget (but within tolerance): penalty
          score -= 20
        }
      }
    }

    // Area exactness
    if (criteria.preferred_areas?.length && p.location) {
      const loc = p.location.toLowerCase()
      const exactMatch = criteria.preferred_areas.some(a => loc.includes(a.toLowerCase()))
      const fuzzyMatch = criteria.preferred_areas.some(a => areaMatches(p.location, a))

      if (exactMatch) score += 50
      else if (fuzzyMatch) score += 25
    }

    // BHK match (if lead specified BHK preference in criteria)
    // Note: BHK is not stored on lead yet in V1, so this is for future use
    // For now, we don't have BHK in criteria, so skip this

    return { p, score }
  })

  return scored.sort((a, b) => b.score - a.score).map(x => x.p)
}

// ─── Exports ──────────────────────────────────────────────────────────────
export { areaMatches, isWithinBudget, rankPropertiesByFit }
