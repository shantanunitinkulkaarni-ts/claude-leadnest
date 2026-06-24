import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import MarkdownDoc from '@/components/MarkdownDoc'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — Convorian',
  description: 'How billing, cancellations and refunds work for Convorian subscriptions.',
}

function getContent(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'files', 'REFUND_POLICY.md'), 'utf-8')
  } catch {
    return '# Refund & Cancellation Policy\n\nOur refund policy is being finalised. Contact support@convorian.in for any queries.'
  }
}

export default function RefundPolicyPage() {
  return (
    <LegalShell>
      <MarkdownDoc content={getContent()} />
    </LegalShell>
  )
}
