import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://convorian.in'),
  title: 'Convorian — AI WhatsApp Sales Engine for Real Estate',
  description: 'Convorian is an AI-powered WhatsApp automation platform that helps real estate agents in India answer, qualify, and nurture leads 24/7 — booking site visits and closing deals on autopilot.',
  keywords: ['WhatsApp CRM', 'real estate AI', 'lead nurturing', 'AI sales assistant', 'India real estate software', 'Convorian'],
  authors: [{ name: 'Convorian' }],
  openGraph: {
    title: 'Convorian — AI WhatsApp Sales Engine for Real Estate',
    description: 'Answer, qualify, and nurture every WhatsApp lead 24/7. Book site visits and close deals on autopilot.',
    url: 'https://convorian.in',
    siteName: 'Convorian',
    type: 'website',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.png', apple: '/icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
