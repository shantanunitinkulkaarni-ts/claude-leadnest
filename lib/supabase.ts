import { createClient } from '@supabase/supabase-js'

// Lazy initialisation — only creates client when first called
// This prevents build-time errors when env vars are not available
let _supabaseAdmin: ReturnType<typeof createClient> | null = null
let _supabase: ReturnType<typeof createClient> | null = null

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env vars missing')
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _supabaseAdmin
}

import { createBrowserClient } from '@supabase/ssr'

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase env vars missing')
    
    // Use createBrowserClient so sessions are automatically synced to cookies!
    // This allows middleware.ts to see the user and not kick them to /login
    _supabase = createBrowserClient(url, key) as any
  }
  return _supabase
}

// Keep backwards compat — these are now getters not instances
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop]
  }
})

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  }
})
