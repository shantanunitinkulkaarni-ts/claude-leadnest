import { callLLM } from './llm'

// Same check as promptEngine.ts's isMediaPlaceholder — duplicated rather than
// imported to avoid a circular dependency (promptEngine.ts imports this module).
function isMediaPlaceholder(text: string): boolean {
  return /^\s*\[(photo|image|video|media|file|attachment)\b/i.test(text || '')
}

// Structured lead facts (name, intent, budget, areas, temperature, status) are
// already persisted on the leads row and never lost — see ctx.lead in
// buildEnginePrompt. What's lost once a conversation exceeds the raw 12-message
// history window is unstructured narrative detail: objections, asides, things
// the lead liked/disliked, promises made. This module keeps a small rolling
// summary of exactly that, so it survives past the raw window.

const REFRESH_AFTER_MESSAGES = 8   // re-summarize once this many new messages have piled up
const TRIGGER_AT_MESSAGES = 20     // don't bother summarizing short conversations at all
const OLDER_WINDOW = 100           // cap how many "older" messages we feed the summarizer per refresh

export function shouldRefreshSummary(totalMessageCount: number, lastSummarizedCount: number | null): boolean {
  if (totalMessageCount <= TRIGGER_AT_MESSAGES) return false
  return totalMessageCount - (lastSummarizedCount || 0) >= REFRESH_AFTER_MESSAGES
}

export const SUMMARY_OLDER_WINDOW = OLDER_WINDOW

export async function refreshConversationSummary(
  previousSummary: string | null,
  olderMessages: { direction: string; content: string }[]
): Promise<string> {
  const transcript = olderMessages
    .filter(m => m.content && m.content.trim() && !isMediaPlaceholder(m.content))
    .map(m => `${m.direction === 'inbound' ? 'Lead' : 'Bot'}: ${m.content}`)
    .join('\n')

  if (!transcript) return previousSummary || ''

  const prompt = `Summarize the OLDER part of this real-estate sales WhatsApp conversation in 3-5 short sentences.
Focus ONLY on facts that are NOT already tracked as structured data — do not mention budget, area, or buy/rent intent (those are stored separately). Capture: objections raised, specific concerns, things the lead liked/disliked, promises made, anything memorable an agent would want to know before replying.
Be concise and factual. No preamble, just the summary.
${previousSummary ? `\nEXISTING SUMMARY (update/extend it, don't just repeat it verbatim):\n${previousSummary}\n` : ''}
CONVERSATION:
${transcript}

SUMMARY:`

  const text = await callLLM([{ role: 'user', content: prompt }], { maxTokens: 220, temperature: 0.3 })
  return text.trim()
}
