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
