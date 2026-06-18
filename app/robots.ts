import type { MetadataRoute } from 'next'

// Allow public marketing/legal pages; keep app + API out of search indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/admin', '/auth/', '/onboarding', '/reset-password', '/forgot-password'],
    },
    sitemap: 'https://convorian.in/sitemap.xml',
    host: 'https://convorian.in',
  }
}
