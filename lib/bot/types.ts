// lib/bot/types.ts
// Shared types for the AI bot engine. Extracted from lib/ai-bot.ts as part of
// the Phase 1 refactor (behaviour-preserving — no logic changes here).

export type BotStage =
  | 'greeting'
  | 'language'
  | 'name'
  | 'intent'
  | 'qualifying'
  | 'property_shown'
  | 'awaiting_visit_time'
  | 'awaiting_email'
  | 'visit_confirmed'
  | 'handover'

export type ChatEntry = {
  role: 'user' | 'bot'
  text: string
  ts: string
}

export type BotAction =
  | 'search_properties'
  | 'send_photos'
  | 'book_visit'
  | 'reschedule_visit'
  | 'cancel_visit'
  | 'share_contact'
  | 'handover'
  | null

export type AIDecision = {
  stage: BotStage
  reply: string
  action: BotAction
  updates: {
    name?: string
    language?: string
    intent?: 'rent' | 'buy'
    property_category?: string
    preferred_areas?: string[]
    budget_min?: number
    budget_max?: number
    bhk?: string
    sqft_preference?: number
    visit_time?: string
    email?: string
  }
  // SILENT sales profiling — inferred traits, NEVER shown to the customer.
  personality_cues?: Record<string, string | number | boolean>
}

export type TutorialDecision = {
  reply: string
  updates?: Record<string, any>
  action?: BotAction
}

// Max chat entries to keep in lead.chat_history (≈6 exchanges).
export const MAX_HISTORY = 12
// Max property photos to send in one turn.
export const MAX_PHOTOS = 5
