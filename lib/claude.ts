import Anthropic from '@anthropic-ai/sdk'

// For Vertex AI — uses Google Cloud credentials automatically
// No API key needed, billed to your Google account
let client: any

function getClient() {
  if (client) return client

  // Check if we're using Vertex AI or direct Anthropic
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    const { AnthropicVertex } = require('@anthropic-ai/vertex-sdk')
    client = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      region: process.env.VERTEX_REGION || 'us-east5'
    })
  } else {
    // Fallback to direct Anthropic if API key provided
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  return client
}

export { getClient }
