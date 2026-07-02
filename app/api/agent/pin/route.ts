export const dynamic = "force-dynamic"

import { NextRequest } from 'next/server'
import { DEFAULT_AGENT_PIN_ROUTE_DEPS, handleSetPin, handleVerifyPin } from '@/lib/agentPinRouteHandlers'

export async function POST(request: NextRequest) {
  return handleVerifyPin(request, DEFAULT_AGENT_PIN_ROUTE_DEPS)
}

export async function PUT(request: NextRequest) {
  return handleSetPin(request, DEFAULT_AGENT_PIN_ROUTE_DEPS)
}
