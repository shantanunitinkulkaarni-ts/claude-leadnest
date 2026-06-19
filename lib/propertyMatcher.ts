// ─────────────────────────────────────────────────────────────────────────────
// Property pre-filter — runs BEFORE the LLM ever sees the inventory.
//
// Previously every active property for the agent went into the prompt and the
// LLM decided which ones to recommend. That let the LLM mismatch — e.g.
// recommending a 4BHK to a lead who asked for a 2BHK, or a rental to a buy
// lead — because the model had to apply the filtering itself instead of just
// being handed the right answer. Filtering deterministically, server-side,
// removes that whole class of error: the LLM can only ever recommend
// something that already fits the lead's known criteria.
//
// Each filter only applies once the corresponding lead field is known — a
// lead with no intent/areas/budget yet (greeting/discovery) sees the full
// active inventory, same as before. Filters tighten as the lead's profile
// fills in.
//
// Includes a NEARBY_AREAS adjacency map so the orchestrator can offer
// properties in neighbouring localities when the exact area returns nothing.
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_TO_PROPERTY_TYPE: Record<string, string> = {
  buy: 'sale',
  rent: 'rental',
}

// ─── Area adjacency map (Pune primary) ──────────────────────────────────────
// When a lead asks for "Baner" and nothing matches, the orchestrator expands to
// the adjacent localities listed here so the bot can say "nothing in Baner, but
// here's Aundh…" instead of a hard no-match. Add other city clusters below.
export const NEARBY_AREAS: Record<string, string[]> = {
  // West Pune cluster
  baner: ['aundh', 'hinjawadi', 'wakad', 'balewadi', 'pashan'],
  aundh: ['baner', 'pashan', 'wakad', 'hinjawadi'],
  hinjawadi: ['wakad', 'baner', 'balewadi', 'aundh'],
  wakad: ['hinjawadi', 'baner', 'balewadi', 'aundh'],
  balewadi: ['baner', 'hinjawadi', 'wakad', 'aundh'],
  pashan: ['baner', 'aundh', 'wakad'],

  // East Pune cluster
  'kharadi': ['viman nagar', 'wagholi', 'magarpatta', 'hadapsar', 'kalyani nagar'],
  'viman nagar': ['kharadi', 'kalyani nagar', 'wagholi', 'magarpatta'],
  'wagholi': ['kharadi', 'viman nagar'],
  'magarpatta': ['hadapsar', 'kharadi', 'viman nagar'],
  'kalyani nagar': ['viman nagar', 'kharadi', 'magarpatta'],

  // South / Central Pune cluster
  'kothrud': ['karve nagar', 'bavdhan', 'warje', 'erandwane', 'deccan'],
  'karve nagar': ['kothrud', 'warje', 'erandwane', 'deccan'],
  'warje': ['kothrud', 'karve nagar', 'bavdhan'],
  'bavdhan': ['kothrud', 'pashan', 'warje'],
  'erandwane': ['kothrud', 'karve nagar', 'deccan'],
  'deccan': ['erandwane', 'kothrud', 'karve nagar'],

  // North Pune cluster
  'pimpri': ['chinchwad', 'nigdi', 'bhonsari'],
  'chinchwad': ['pimpri', 'nigdi'],
  'nigdi': ['pimpri', 'chinchwad'],

  // East South cluster
  'hadapsar': ['magarpatta', 'kharadi', 'wanowrie', 'mundhwa'],
  'wanowrie': ['hadapsar', 'mundhwa', 'magarpatta'],
  'mundhwa': ['hadapsar', 'kharadi', 'magarpatta', 'wanowrie'],

  // Koregaon Park cluster
  'koregaon park': ['kalyani nagar', 'viman nagar', 'kharadi'],
}

// Restricted Damerau-Levenshtein edit distance (handles single transpositions
// like "bnaer" → "baner" as one edit). Used only as a typo fallback below.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1) // transposition
      }
    }
  }
  return d[m][n]
}

function areaTokens(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

// True when `area` (lead's requested locality) matches `location` (property's
// stored location). Plain substring covers the normal case; a tight edit-distance
// fallback tolerates a single typo/transposition (localities are short and often
// mistyped — "bnaer"/"Baner") WITHOUT matching genuinely different areas.
export function areaMatches(location: string, area: string): boolean {
  const loc = (location || '').toLowerCase()
  const ar = (area || '').toLowerCase().trim()
  if (!ar) return false
  if (loc.includes(ar)) return true
  for (const t of areaTokens(location)) {
    if (Math.abs(t.length - ar.length) > 2) continue
    const threshold = ar.length >= 6 ? 2 : 1
    if (editDistance(t, ar) <= threshold) return true
  }
  return false
}

// Budget tolerance — leads round their stated budget, and a property 10-20%
// over asking is often still worth showing (the agent can negotiate). 20%
// matches the tolerance documented in the master plan.
const BUDGET_TOLERANCE = 1.2

// Stretch ceiling — when NOTHING fits the budget, a good agent still mentions
// the closest option even if it's a bit pricier ("₹90L vs your ₹50L"). We only
// surface stretch options up to 2x the stated budget — beyond that it's not a
// real alternative, just noise.
const STRETCH_CEILING = 2.0

export function filterPropertiesForLead(properties: any[], lead: any): any[] {
  return (properties || []).filter((p) => {
    if (lead.intent) {
      const wantedType = INTENT_TO_PROPERTY_TYPE[lead.intent]
      if (wantedType && p.type !== wantedType) return false
    }

    if (lead.preferred_areas && lead.preferred_areas.length > 0) {
      const matchesArea = lead.preferred_areas.some((area: string) =>
        areaMatches(p.location, area)
      )
      if (!matchesArea) return false
    }

    if (lead.budget_max) {
      const propPrice = p.type === 'rental' ? p.rent_per_month : p.price
      if (propPrice && propPrice > lead.budget_max * BUDGET_TOLERANCE) return false
    }

    return true
  })
}

// Deterministic "best fit first" ordering for the matched set (code-first: the
// AI never picks). Higher score = better fit. Signals, in priority:
//   • within budget (and using more of it ranks a touch higher — better home);
//     over-budget-but-tolerant ranks below any within-budget option
//   • exact area match (location contains the wanted area)
//   • BHK match when the lead's desired BHK is known
// `criteria` accepts either a lead row or an extracted-intent object
// ({ preferred_areas|areas, budget_max, bhk }).
function fitScore(p: any, criteria: any): number {
  let s = 0
  const areas: string[] = criteria.preferred_areas || criteria.areas || []
  const price = p.type === 'rental' ? Number(p.rent_per_month || p.price || 0) : Number(p.price || 0)
  const budgetMax = Number(criteria.budget_max || 0)

  if (budgetMax > 0 && price > 0) {
    if (price <= budgetMax) {
      // within budget: 60 base + up to 40 for using more of the budget
      s += 60 + Math.round((price / budgetMax) * 40)
    } else {
      // over budget (still within tolerance, else it'd be filtered out): penalise
      s -= 40
    }
  }
  if (areas.length && p.location) {
    const loc = String(p.location).toLowerCase()
    if (areas.some((a) => loc.includes(String(a).toLowerCase()))) s += 50
    else if (areas.some((a) => areaMatches(p.location, a))) s += 25 // fuzzy/typo match
  }
  const wantBhk = criteria.bhk
  if (wantBhk && p.bhk && String(p.bhk).toLowerCase().includes(String(wantBhk).toLowerCase())) s += 30
  return s
}

export function rankPropertiesForLead(properties: any[], criteria: any): any[] {
  return (properties || [])
    .map((p) => ({ p, s: fitScore(p, criteria) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p)
}

// "Near matches" — properties that fit the lead's intent + area but sit ABOVE
// their budget (between the tolerant cap and the stretch ceiling). Surfaced ONLY
// when filterPropertiesForLead returns nothing, so the bot can honestly offer
// the closest option ("a bit above your range") instead of going empty-handed.
// Never includes anything already returned by the strict filter.
export function findNearMatches(properties: any[], lead: any): any[] {
  if (!lead.budget_max) return [] // budget is the binding constraint here
  return (properties || []).filter((p) => {
    if (lead.intent) {
      const wantedType = INTENT_TO_PROPERTY_TYPE[lead.intent]
      if (wantedType && p.type !== wantedType) return false
    }
    if (lead.preferred_areas && lead.preferred_areas.length > 0) {
      if (!lead.preferred_areas.some((area: string) => areaMatches(p.location, area))) return false
    }
    const price = p.type === 'rental' ? p.rent_per_month : p.price
    if (!price) return false
    return price > lead.budget_max * BUDGET_TOLERANCE && price <= lead.budget_max * STRETCH_CEILING
  })
}

// ─── Nearby areas fallback ──────────────────────────────────────────────────
// When the exact preferred areas return nothing, expand to adjacent localities
// (neighbouring areas) so the bot can offer nearby options instead of a hard
// no-match. Pure code — no AI involvement. Returns ranked matches + the list
// of nearby areas that produced them (for the intro text).

export type NearbyResult = {
  properties: any[]           // ranked best-first, same budget/intent filters
  nearbyAreas: string[]       // the adjacent areas that had matches (title-cased for display)
} | null

export function getNearbyProperties(properties: any[], criteria: {
  intent: 'buy' | 'rent' | null
  preferred_areas: string[]
  budget_min: number | null
  budget_max: number | null
  bhk: string | null
}): NearbyResult {
  if (!criteria.preferred_areas?.length) return null

  const searched = new Set<string>()
  const toSearch: string[] = []

  // Expand each preferred area → its adjacent localities, deduping
  for (const area of criteria.preferred_areas) {
    const key = area.toLowerCase().trim()
    if (!key) continue
    searched.add(key)
    const adjacent = NEARBY_AREAS[key]
    if (adjacent) {
      for (const nb of adjacent) {
        if (!searched.has(nb)) {
          searched.add(nb)
          toSearch.push(nb)
        }
      }
    }
  }

  if (!toSearch.length) return null

  // Build a criteria clone with the nearby areas substituted in
  const nearbyCriteria = {
    ...criteria,
    preferred_areas: toSearch,
  }

  const matched = filterPropertiesForLead(properties, nearbyCriteria)
  if (!matched.length) return null

  const ranked = rankPropertiesForLead(matched, nearbyCriteria)
  const nearbyAreas = toSearch.map(a => a.replace(/\b\w/g, c => c.toUpperCase()))

  return { properties: ranked, nearbyAreas }
}

// Validates that a property ID the LLM claims to have recommended actually
// came from the filtered list it was given. If the LLM hallucinates an ID
// (wrong UUID, an inactive property, or one outside the lead's filtered
// match set), the caller should discard the field and alert — never trust
// an unvalidated property reference forward to the lead.
export function isValidMatchedProperty(propertyId: string | undefined | null, filteredProperties: any[]): boolean {
  if (!propertyId) return false
  return filteredProperties.some((p) => p.id === propertyId)
}