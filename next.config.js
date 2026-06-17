const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3003',
        'convorian.in',
        'www.convorian.in',
        '*.awsapprunner.com',
        '*.vercel.app'
      ]
    }
  },
  images: {
    domains: ['hinqahjhtgsmljrrozql.supabase.co']
  },
  // Security headers applied to every response (defense-in-depth hardening).
  async headers() {
    // Content Security Policy. Shipped as Report-Only first so we can monitor
    // violations in Sentry / browser console BEFORE switching to enforcement —
    // an over-tight CSP can silently break Razorpay Checkout or Sentry. After
    // a week of clean reports, swap header key to 'Content-Security-Policy'.
    //
    // Allowances explained:
    //  - script-src: self + Razorpay Checkout + Sentry. 'unsafe-inline' is
    //    needed for Next.js inline scripts (hydration bootstrap). 'unsafe-eval'
    //    is required by Razorpay Checkout's runtime.
    //  - style-src: self + 'unsafe-inline' (Tailwind/Next emit inline styles).
    //  - img-src: self + data: + blob: + Supabase storage + https (broad,
    //    fine for an MVP — tighten later when sources are stable).
    //  - connect-src: self + Supabase REST/realtime + Razorpay API + Sentry.
    //  - frame-src: Razorpay Checkout iframe.
    //  - frame-ancestors: 'none' replaces X-Frame-Options for modern browsers.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://*.sentry.io https://api.z.ai https://api.cerebras.ai",
      "frame-src https://*.razorpay.com https://api.razorpay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.razorpay.com",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          // Force HTTPS for 2 years incl. subdomains (HSTS).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Disallow our pages being framed (clickjacking protection).
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Stop MIME-type sniffing.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak full URLs to third parties.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Lock down powerful browser features by default.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
          // Isolate cross-origin policy files.
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          // CSP in Report-Only mode (monitor first, enforce after one clean week).
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
})
