// ─────────────────────────────────────────────────────────────────────────────
// Structured request logging.
//
// Every webhook POST gets one traceId. Every log line for that request carries
// it (plus agentId/leadId once known) as a single JSON object. In Vercel logs,
// grep one traceId and you see the entire journey of one inbound message:
// receive → agent lookup → lead lookup → engine call → reply → appointment →
// WhatsApp send — instead of guessing which of several interleaved requests
// a bare console.log line belonged to.
// ─────────────────────────────────────────────────────────────────────────────

export type Logger = (event: string, data?: Record<string, any>) => void

export function createLogger(traceId: string): {
  log: Logger
  logError: Logger
  setContext: (ctx: Record<string, any>) => void
} {
  let context: Record<string, any> = {}
  const line = (event: string, data?: Record<string, any>) =>
    JSON.stringify({ traceId, ts: Date.now(), event, ...context, ...data })
  const log: Logger = (event, data) => console.log(line(event, data))
  // Same shape, routed through console.error so Vercel still flags it red.
  const logError: Logger = (event, data) => console.error(line(event, data))
  const setContext = (ctx: Record<string, any>) => {
    context = { ...context, ...ctx }
  }
  return { log, logError, setContext }
}
