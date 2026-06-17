'use client'

// Waitlist is disabled — Convorian is now in direct launch. Any visit to
// /waitlist is redirected to onboarding so users can sign up immediately.
// (The previous waitlist UI is preserved in git history if ever needed again,
// and its AI chat demo now lives on the landing page via <LiveChatDemo />.)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function WaitlistPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/onboarding')
  }, [router])
  return null
}
