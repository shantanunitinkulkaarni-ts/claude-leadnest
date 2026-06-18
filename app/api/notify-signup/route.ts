export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'

// Alerts the Convorian team that a new agent signed up and needs their WhatsApp
// number activated on MSG91 (concierge onboarding, pre-self-serve). Public —
// called from the onboarding flow; only sends a team email, no data exposure.
const ALERT_TO = process.env.FOUNDER_ALERT_EMAIL || 'support@convorian.in'

// Public + fires real emails → cap per IP so it can't be turned into a mail
// cannon against our team inbox (which would also wreck sender reputation).
const NOTIFY_IP_LIMIT = 10
const NOTIFY_WINDOW_MS = 60_000

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(`notify-signup:${ip}`, NOTIFY_IP_LIMIT, NOTIFY_WINDOW_MS).allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }
    const b = await request.json()
    const agency = String(b.agency_name || '—').slice(0, 120)
    const name = String(b.name || '—').slice(0, 120)
    const phone = String(b.phone || '—').slice(0, 30)
    const email = String(b.email || '—').slice(0, 160)

    await sendEmail({
      to: ALERT_TO,
      subject: `🆕 New Convorian signup — activate WhatsApp for ${agency}`,
      html: `<p>A new agent just signed up and is waiting for WhatsApp activation.</p>
        <table style="font-size:14px;line-height:1.8">
          <tr><td><strong>Agency</strong></td><td>&nbsp;${agency}</td></tr>
          <tr><td><strong>Name</strong></td><td>&nbsp;${name}</td></tr>
          <tr><td><strong>WhatsApp</strong></td><td>&nbsp;${phone}</td></tr>
          <tr><td><strong>Email</strong></td><td>&nbsp;${email}</td></tr>
        </table>
        <p><strong>Action:</strong> onboard <strong>${phone}</strong> in MSG91, then set it as this agency's WhatsApp # in <a href="https://convorian.in/admin">/admin</a>.</p>`,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    // Never block onboarding on a failed alert.
    return NextResponse.json({ ok: false, error: e.message })
  }
}
