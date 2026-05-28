import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic

export function getClient(): Anthropic {
  if (client) return client

  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.aicredits.in/v1'
  })

  return client
}

export const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
