import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Convorian — AI WhatsApp Lead Nurturing',
  description: 'Automate your real estate leads with AI',
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
