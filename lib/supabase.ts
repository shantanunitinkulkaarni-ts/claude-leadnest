import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

type GenericTable = {
  Row: any
  Insert: any
  Update: any
  Relationships: any[]
}

type Database = {
  public: {
    Tables: Record<string, GenericTable>
    Views: Record<string, GenericTable>
    Functions: Record<string, { Args: any; Returns: any }>
  }
}

type ConvorianSupabaseClient = SupabaseClient<Database>

// Lazy initialisation — only creates client when first called
// This prevents build-time errors when env vars are not available
let _supabaseAdmin: ConvorianSupabaseClient | null = null
let _supabase: ConvorianSupabaseClient | null = null

export function getSupabaseAdmin(): ConvorianSupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env vars missing')
    _supabaseAdmin = createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _supabaseAdmin!
}

export function getSupabase(): ConvorianSupabaseClient {
  if (!_supabase) {
    // Fail-closed: no hardcoded URL / publishable-key fallback. If env is
    // missing in production, surface the misconfig loudly. (CLAUDE.md rule:
    // "All URLs ... come from environment variables only. Omit defaults so
    // missing config fails fast.")
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)')

    // Use createBrowserClient so sessions are automatically synced to cookies!
    // This allows middleware.ts to see the user and not kick them to /login
    _supabase = createBrowserClient<Database>(url, key)
  }
  return _supabase!
}

// Keep backwards compat — these are now getters not instances
export const supabaseAdmin = new Proxy({} as ConvorianSupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop]
  }
})

export const supabase = new Proxy({} as ConvorianSupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  }
})
