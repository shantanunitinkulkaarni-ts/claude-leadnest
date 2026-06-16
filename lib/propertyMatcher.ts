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
      const location = (p.location || '').toLowerCase()
      const matchesArea = lead.preferred_areas.some((area: string) =>
        location.includes((area || '').toLowerCase())
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
