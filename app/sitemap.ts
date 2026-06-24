import type { MetadataRoute } from 'next'

// Public, indexable pages only. App/auth pages are intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://convorian.in'
  const now = new Date()
  const routes = ['', '/help', '/privacy-policy', '/terms-of-service', '/refund-policy', '/login']
  return routes.map(path => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.6,
  }))
}
