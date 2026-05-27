import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import { GoogleAuth } from 'google-auth-library'

let client: AnthropicVertex

export function getClient(): AnthropicVertex {
  if (client) return client

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0794202345'
  const region = process.env.VERTEX_REGION || 'us-east5'

  // On Vercel — credentials come from env var
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })
    client = new AnthropicVertex({ projectId, region, googleAuth: auth })
  } else {
    // Local dev — uses gcloud CLI default credentials
    client = new AnthropicVertex({ projectId, region })
  }

  return client
}

// Sonnet 4.6 on Vertex — best balance for both bot and coding
export const CLAUDE_MODEL = 'claude-sonnet-4-6@20251114'
