import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import MarkdownDoc from '@/components/MarkdownDoc'
import LegalShell from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy — TING',
  description: 'How TING collects, uses, stores and protects your data.',
}

function getContent(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'files', 'PRIVACY_POLICY.md'), 'utf-8')
  } catch {
    return '# Privacy Policy\n\nOur privacy policy is being finalised. Contact privacy@convorian.in for any queries.'
  }
}

export default function PrivacyPolicyPage() {
  return (
    <LegalShell>
      <MarkdownDoc content={getContent()} />
    </LegalShell>
  )
}
