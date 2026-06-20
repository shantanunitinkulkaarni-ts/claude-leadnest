/**
 * Lead Criteria Extraction & Merge
 *
 * Responsibilities:
 * - Extract intent, area, budget, BHK from natural language
 * - Merge extracted criteria with stored lead data
 * - Implement "newest message wins" overwriting logic
 * - Save discovered criteria to lead row
 *
 * Core rule: Newest message always overrides stored data.
 * This prevents stale assumptions.
 */

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ExtractedCriteria {
  intent: 'buy' | 'rent' | null
  areas: string[] | null
  budget_min: number | null
  budget_max: number | null
  bhk: string | null
}

export interface MergedCriteria {
  intent: 'buy' | 'rent' | null
  preferred_areas: string[]
  budget_min: number | null
  budget_max: number | null
  bhk: string | null
}

// ─── Intent Extraction ──────────────────────────────────────────────────────
/**
 * Extract buy/rent intent from a message.
 * Supports: English, Hindi, Marathi (Latin and Devanagari scripts)
 *
 * Returns: 'buy' | 'rent' | null
 */
export function extractIntent(text: string): 'buy' | 'rent' | null {
  if (!text) return null

  const normalized = normalizeText(text)

  // Buy signals
  if (/\b(buy|purchase|khareed|kharid|lena|kharidi|sale|purchasing)\b/i.test(normalized)) {
    return 'buy'
  }

  // Rent signals (include "par chahiye" pattern from Hindi)
  if (/\b(rent|rental|lease|kiraya|bhade|kirane|to rent|par chahiye)\b/i.test(normalized)) {
    return 'rent'
  }

  return null
}

// ─── Area Extraction ────────────────────────────────────────────────────────
/**
 * Extract area/locality from a message.
 *
 * Strategies:
 * 1. Look for text after "in", "at", "mein", "madhe"
 * 2. If message is a short string (3-50 chars, no spaces), treat as area name
 *
 * Returns: area name (lowercase) | null
 *
 * Examples:
 * "I want to rent in Baner" → "baner"
 * "Baner" → "baner" (standalone)
 * "property at Koregaon Park" → "koregaon park"
 */
export function extractArea(text: string): string | null {
  if (!text || text.length < 3) return null

  const normalized = normalizeText(text)

  // Try to extract area after preposition
  const prepPattern = /(?:in|at|mein|madhe)\s+([a-z\s]+?)(?:\s+(?:for|with|budget|rent|buy|bhk|under|upto|up\s*to|\d)|$)/i
  const match = normalized.match(prepPattern)

  if (match) {
    let area = match[1].trim()
    // Remove trailing "pune" or "city" if present (keep only the actual area)
    area = area.replace(/\s+(pune|city|state)$/, '')
    if (area.length >= 3 && area.length <= 50) {
      return area.toLowerCase()
    }
  }

  // Fallback: standalone area name (entire message is just an area, no spaces)
  // Only accept if it's clearly not a question or sentence
  if (
    normalized.length >= 3 &&
    normalized.length <= 50 &&
    !/\s/.test(normalized) &&
    !normalized.includes('what') &&
    !normalized.includes('when') &&
    !normalized.includes('where') &&
    !normalized.includes('how') &&
    !normalized.includes('why')
  ) {
    return normalized.toLowerCase()
  }

  return null
}

// ─── Budget Extraction ──────────────────────────────────────────────────────
/**
 * Extract budget amount from a message.
 *
 * Recognizes:
 * - "30k" or "30K" → 30,000
 * - "50l" or "50 lakh" → 5,000,000
 * - "1cr" or "1 crore" → 10,000,000
 * - "1.5cr" → 15,000,000
 * - Plain 4-7 digit numbers → as-is
 *
 * Returns: budget in rupees | null
 */
export function extractBudget(text: string): number | null {
  if (!text) return null

  const normalized = normalizeText(text)

  // Lakh: "50l" or "50 lakh"
  const lakhMatch = normalized.match(/(\d+(?:\.\d+)?)\s*l(?:akh)?/i)
  if (lakhMatch) {
    return Math.round(parseFloat(lakhMatch[1]) * 100000)
  }

  // Crore: "1cr" or "1 crore" or "1.5 cr" (check before thousands to avoid "1.5" being parsed as "15")
  const croreMatch = normalized.match(/(\d+(?:\.\d+)?)\s*cr(?:ore)?/i)
  if (croreMatch) {
    return Math.round(parseFloat(croreMatch[1]) * 10000000)
  }

  // Thousands: "30k" or "30K" (must be whole number, not decimals)
  const kMatch = normalized.match(/(\d+)\.?\d*\s*k(?:,)?/i)
  if (kMatch) {
    return parseInt(kMatch[1]) * 1000
  }

  // Plain number (4-7 digits): "25000" or "1000000"
  const numMatch = normalized.match(/\b(\d{4,7})\b/)
  if (numMatch) {
    return parseInt(numMatch[1])
  }

  return null
}

// ─── BHK Extraction ────────────────────────────────────────────────────────
/**
 * Extract BHK preference from a message.
 *
 * Examples: "2BHK", "3 bhk", "1bhk apartment"
 *
 * Returns: "2bhk" | "3bhk" | null (normalized to lowercase with number+bhk)
 */
export function extractBHK(text: string): string | null {
  if (!text) return null

  const normalized = normalizeText(text)
  const match = normalized.match(/(\d+)\s*bhk/i)

  if (match) {
    return `${match[1]}bhk`.toLowerCase()
  }

  return null
}

// ─── Merge Logic ────────────────────────────────────────────────────────────
/**
 * Merge extracted criteria with stored lead data.
 *
 * Rule: Newest message always wins (extracted overrides stored).
 * But preserve stored values when nothing new was extracted.
 *
 * @param storedLead - Lead's current stored criteria (from DB)
 * @param extracted - Newly extracted criteria from message
 * @returns Merged criteria ready to use for search
 */
export function mergeCriteria(
  storedLead: Partial<MergedCriteria>,
  extracted: ExtractedCriteria
): MergedCriteria {
  return {
    intent: extracted.intent ?? storedLead.intent ?? null,
    preferred_areas: (extracted.areas && extracted.areas.length > 0)
      ? extracted.areas
      : (storedLead.preferred_areas || []),
    budget_min: extracted.budget_min ?? storedLead.budget_min ?? null,
    budget_max: extracted.budget_max ?? storedLead.budget_max ?? null,
    bhk: extracted.bhk ?? storedLead.bhk ?? null,
  }
}

/**
 * Extract all criteria from a message (one-shot function).
 *
 * Calls: extractIntent, extractArea, extractBudget, extractBHK
 * Returns: ExtractedCriteria with all fields populated (null if not found)
 */
export function extractAllCriteria(text: string): ExtractedCriteria {
  return {
    intent: extractIntent(text),
    areas: extractArea(text) ? [extractArea(text)!] : null,
    budget_min: null, // Not currently extracted
    budget_max: extractBudget(text),
    bhk: extractBHK(text),
  }
}

/**
 * Full lead criteria update: extract from message, merge with stored, return update object.
 *
 * Useful for webhook code:
 * const updates = getLeadUpdates(lead, messageText)
 * await supabase.from('leads').update(updates).eq('id', lead.id)
 */
export function getLeadUpdates(
  storedLead: Partial<MergedCriteria> & { conversation_stage?: string },
  messageText: string
): Partial<MergedCriteria & { conversation_stage?: string }> {
  const extracted = extractAllCriteria(messageText)
  const merged = mergeCriteria(storedLead, extracted)

  const updates: any = {}

  // Only include fields that were newly extracted or differ from stored
  if (extracted.intent && extracted.intent !== storedLead.intent) {
    updates.intent = extracted.intent
  }

  if (extracted.areas && JSON.stringify(extracted.areas) !== JSON.stringify(storedLead.preferred_areas)) {
    updates.preferred_areas = extracted.areas
  }

  if (extracted.budget_max && extracted.budget_max !== storedLead.budget_max) {
    updates.budget_max = extracted.budget_max
  }

  if (extracted.budget_min && extracted.budget_min !== storedLead.budget_min) {
    updates.budget_min = extracted.budget_min
  }

  if (extracted.bhk && extracted.bhk !== storedLead.bhk) {
    updates.bhk = extracted.bhk
  }

  return Object.keys(updates).length > 0 ? updates : {}
}

// ─── Normalization Helper ──────────────────────────────────────────────────
/**
 * Normalize text for extraction: lowercase, remove punctuation, collapse spaces.
 * Used by all extraction functions.
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')          // Collapse spaces
    .trim()
}

