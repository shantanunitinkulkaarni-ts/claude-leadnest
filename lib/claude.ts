import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'

let client: AnthropicVertex

export function getClient(): AnthropicVertex {
  if (client) return client

  // If running on Vercel, credentials come from env var JSON
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    client = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0794202345',
      region: process.env.VERTEX_REGION || 'us-east5',
      googleAuth: {
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      }
    })
  } else {
    // Local dev — uses gcloud CLI credentials
    client = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0794202345',
      region: process.env.VERTEX_REGION || 'us-east5'
    })
  }

  return client
}

// Model to use — Sonnet 4.6 on Vertex
export const CLAUDE_MODEL = 'claude-sonnet-4-6@20251114'
