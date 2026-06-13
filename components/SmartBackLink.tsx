'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

// Back link that sends logged-in users to their dashboard and visitors to the
// marketing home. Used in LegalShell (Help / Privacy / Terms) so a signed-in
// agent on /help doesn't get bounced out to the landing page.
export default function SmartBackLink({ style }: { style?: React.CSSProperties }) {
  const [href, setHref] = useState('/')
  const [label, setLabel] = useState('← Back to home')

  useEffect(() => {
    let active = true
    getSupabase().auth.getSession().then(({ data }) => {
      if (active && data.session) { setHref('/dashboard'); setLabel('← Back to dashboard') }
    }).catch(() => {})
    return () => { active = false }
  }, [])

  return <a href={href} style={style}>{label}</a>
}
