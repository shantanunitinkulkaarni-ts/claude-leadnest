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
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_TO_PROPERTY_TYPE: Record<string, string> = {
  buy: 'sale',
  rent: 'rental',
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

// Validates that a property ID the LLM claims to have recommended actually
// came from the filtered list it was given. If the LLM hallucinates an ID
// (wrong UUID, an inactive property, or one outside the lead's filtered
// match set), the caller should discard the field and alert — never trust
// an unvalidated property reference forward to the lead.
export function isValidMatchedProperty(propertyId: string | undefined | null, filteredProperties: any[]): boolean {
  if (!propertyId) return false
  return filteredProperties.some((p) => p.id === propertyId)
}
