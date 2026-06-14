import type { Metadata } from 'next'

const SITE_URL = 'https://convorian.in'
const TITLE = 'Convorian — AI WhatsApp Sales Engine for Real Estate'
const DESCRIPTION = 'Convorian is an AI-powered WhatsApp automation platform that helps real estate agents in India answer, qualify, and nurture leads 24/7 — booking site visits and closing deals on autopilot.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s | Convorian' },
  description: DESCRIPTION,
  keywords: ['WhatsApp CRM India', 'real estate AI assistant', 'lead nurturing WhatsApp', 'AI sales assistant real estate', 'India real estate software', 'Convorian', 'WhatsApp bot real estate', 'site visit booking AI'],
  authors: [{ name: 'Convorian', url: SITE_URL }],
  creator: 'Convorian',
  publisher: 'Convorian',
  category: 'Technology',
  openGraph: {
    title: TITLE,
    description: 'Answer, qualify, and nurture every WhatsApp lead 24/7. Book site visits and close deals on autopilot.',
    url: SITE_URL,
    siteName: 'Convorian',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'Answer, qualify, and nurture every WhatsApp lead 24/7. Book site visits and close deals on autopilot.',
    site: '@convorian',
    creator: '@convorian',
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icon.webp', type: 'image/webp' }],
    apple: '/icon.png',
    shortcut: '/favicon.ico',
  },
  alternates: { canonical: SITE_URL },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Convorian',
  url: 'https://convorian.in',
  description: 'AI-powered WhatsApp automation platform for real estate agents in India. Answers, qualifies, and nurtures leads 24/7, booking site visits on autopilot.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, WhatsApp',
  offers: {
    '@type': 'Offer',
    price: '999',
    priceCurrency: 'INR',
    priceValidUntil: '2027-12-31',
    availability: 'https://schema.org/InStock',
  },
  provider: {
    '@type': 'Organization',
    name: 'Convorian',
    url: 'https://convorian.in',
    contactPoint: { '@type': 'ContactPoint', email: 'support@convorian.in', contactType: 'customer support' },
  },
  audience: { '@type': 'Audience', audienceType: 'Real estate agents in India' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
