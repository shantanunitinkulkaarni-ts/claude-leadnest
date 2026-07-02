import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import MarkdownDoc from '@/components/MarkdownDoc'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service — TING',
  description: 'The terms that govern your use of the TING platform.',
}

function getContent(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'files', 'TERMS_OF_SERVICE.md'), 'utf-8')
  } catch {
    return '# Terms of Service\n\nOur terms of service are being finalised. Contact legal@convorian.in for any queries.'
  }
}

export default function TermsOfServicePage() {
  return (
    <LegalShell>
      <MarkdownDoc content={getContent()} />
    </LegalShell>
  )
}
