import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Fail-closed: never silently fall back to the service-role key in a
  // cookie/request context. If the anon key is missing, that's a deploy-time
  // misconfig — surface it loudly instead of running middleware with the
  // service-role key (which would bypass RLS and be a serious auth-bypass risk).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with cross-site tracking later on.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtectedPath = path.startsWith('/dashboard') || path.startsWith('/admin')

  if (isProtectedPath && !user) {
    // Redirect unauthenticated users to login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2FA gate (opt-in TOTP): an enrolled user whose session is still aal1 must
  // complete the TOTP challenge before reaching protected pages. This covers
  // Google OAuth, which finishes in the server callback and would otherwise skip
  // the login-form challenge. Non-enrolled users have nextLevel 'aal1' → no gate,
  // so this can never lock anyone out. Any error here fails OPEN by design
  // (defense-in-depth, not the primary auth wall).
  if (isProtectedPath && user) {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const url = request.nextUrl.clone()
        url.pathname = '/mfa'
        url.searchParams.set('next', path)
        return NextResponse.redirect(url)
      }
    } catch {
      // never block access on a middleware MFA-check failure
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/ (API routes - handled separately)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
