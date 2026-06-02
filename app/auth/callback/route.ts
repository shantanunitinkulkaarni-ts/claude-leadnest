import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hinqahjhtgsmljrrozql.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFhaGpodGdzbWxqcnJvenFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDgxMzAsImV4cCI6MjA5NTIyNDEzMH0.0LJNkJwdj5A12XaB8wFXCVI4uyfy19N6sjS5dKTg6JE',
      {
        cookies: {
          getAll() {
            return request.headers.get('cookie') ? request.headers.get('cookie')!.split(';').map(c => {
              const [name, ...rest] = c.split('=')
              return { name: name.trim(), value: rest.join('=') }
            }) : []
          },
          setAll(cookiesToSet) {
            // This is just a dummy setter because the actual setting happens via the response
          },
        },
      }
    )
    
    // We actually need the route handler specific cookie handling
    // It's easier to just use the standard route handler setup
    const response = NextResponse.redirect(`${origin}${next}`)
    
    const supabaseRoute = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hinqahjhtgsmljrrozql.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbnFhaGpodGdzbWxqcnJvenFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDgxMzAsImV4cCI6MjA5NTIyNDEzMH0.0LJNkJwdj5A12XaB8wFXCVI4uyfy19N6sjS5dKTg6JE',
      {
        cookies: {
          getAll() {
            // Not needed for code exchange
            return []
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabaseRoute.auth.exchangeCodeForSession(code)
    if (!error) {
      return response
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
