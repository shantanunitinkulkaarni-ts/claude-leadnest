import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from './supabase'

type AuthResult = {
  user: any
  isSuperadmin: boolean
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function unauthorized(message = 'Authentication required') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function pickFields(body: Record<string, any>, allowedFields: string[]) {
  const picked: Record<string, any> = {}
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) picked[key] = body[key]
  }
  return picked
}

export async function getAuthContext(): Promise<AuthResult | { error: NextResponse }> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Route handler read-only context — token refresh cookies can't be set here.
            // Auth validation still works; middleware handles refresh on next page load.
          }
        }
      }
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: unauthorized() }

  const { data: superadmin } = await supabaseAdmin
    .from('superadmins')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return { user, isSuperadmin: !!superadmin }
}

export async function requireAgentAccess(agentId: string): Promise<AuthResult | { error: NextResponse }> {
  const auth = await getAuthContext()
  if ('error' in auth) return auth
  if (auth.isSuperadmin) return auth

  const { data } = await supabaseAdmin
    .from('team_members')
    .select('agent_id')
    .eq('auth_user_id', auth.user.id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!data) return { error: forbidden() }
  return auth
}

export async function getLeadAgentId(leadId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('agent_id')
    .eq('id', leadId)
    .maybeSingle()

  return data?.agent_id || null
}

export async function getPropertyAgentId(propertyId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('properties')
    .select('agent_id')
    .eq('id', propertyId)
    .maybeSingle()

  return data?.agent_id || null
}

export async function getAppointmentAgentId(appointmentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('agent_id')
    .eq('id', appointmentId)
    .maybeSingle()

  return data?.agent_id || null
}

export async function getKnowledgeGapAgentId(knowledgeGapId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('knowledge_gaps')
    .select('agent_id')
    .eq('id', knowledgeGapId)
    .maybeSingle()

  return data?.agent_id || null
}

export async function requireLeadAccess(leadId: string): Promise<(AuthResult & { agentId: string }) | { error: NextResponse }> {
  const agentId = await getLeadAgentId(leadId)
  if (!agentId) return { error: forbidden('Lead not found') }
  const auth = await requireAgentAccess(agentId)
  if ('error' in auth) return auth
  return { ...auth, agentId }
}

export async function requirePropertyAccess(propertyId: string): Promise<(AuthResult & { agentId: string }) | { error: NextResponse }> {
  const agentId = await getPropertyAgentId(propertyId)
  if (!agentId) return { error: forbidden('Property not found') }
  const auth = await requireAgentAccess(agentId)
  if ('error' in auth) return auth
  return { ...auth, agentId }
}

export async function requireAppointmentAccess(appointmentId: string): Promise<(AuthResult & { agentId: string }) | { error: NextResponse }> {
  const agentId = await getAppointmentAgentId(appointmentId)
  if (!agentId) return { error: forbidden('Appointment not found') }
  const auth = await requireAgentAccess(agentId)
  if ('error' in auth) return auth
  return { ...auth, agentId }
}

export async function requireKnowledgeGapAccess(knowledgeGapId: string): Promise<(AuthResult & { agentId: string }) | { error: NextResponse }> {
  const agentId = await getKnowledgeGapAgentId(knowledgeGapId)
  if (!agentId) return { error: forbidden('Knowledge gap not found') }
  const auth = await requireAgentAccess(agentId)
  if ('error' in auth) return auth
  return { ...auth, agentId }
}
