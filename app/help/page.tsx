import type { Metadata } from 'next'
import LegalShell from '@/components/LegalShell'
import HelpContent from '@/components/HelpContent'

export const metadata: Metadata = {
  title: 'Help & FAQ — Convorian',
  description: 'Answers to common questions about Convorian — your AI WhatsApp assistant for real estate. Billing, setup, data privacy and how to reach support.',
}

export default function HelpPage() {
  return (
    <LegalShell>
      <HelpContent />
    </LegalShell>
  )
}
