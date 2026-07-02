export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail, escapeHtml } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'

const SUPPORT_INBOX = 'support@convorian.in'

// Public endpoint (logged-out users on /help can raise tickets), so it must be
// abuse-capped: without this an attacker could flood support_tickets + spam the
// team inbox (and torch our email sender reputation). Per-IP sliding window.
const TICKET_IP_LIMIT = 5
const TICKET_WINDOW_MS = 60_000

// Raise a support ticket: store it + email the team. Public (logged-out users
// on /help can use it too) — light validation, no auth required.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(`ticket:${ip}`, TICKET_IP_LIMIT, TICKET_WINDOW_MS).allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a minute.' }, { status: 429 })
    }

    const body = await request.json()
    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()
    const email = String(body.email || '').trim()
    const name = String(body.name || '').trim()
    const agent_id = typeof body.agent_id === 'string' ? body.agent_id : null

    if (!subject || !message) return NextResponse.json({ error: 'Subject and message are required.' }, { status: 400 })
    if (subject.length > 200 || message.length > 4000) return NextResponse.json({ error: 'Message too long.' }, { status: 400 })

    const { data: ticket, error } = await supabaseAdmin.from('support_tickets').insert({
      agent_id, email: email || null, name: name || null, subject, message,
      source: body.source === 'support_chat' ? 'support_chat' : 'help_page',
    }).select('id').single()

    if (error) {
      console.error('Ticket insert failed:', error.message)
      return NextResponse.json({ error: 'Could not raise ticket. Please email ' + SUPPORT_INBOX }, { status: 500 })
    }

    // Email the team (best-effort) + acknowledge the user if we have their email.
    try {
      await sendEmail({
        to: SUPPORT_INBOX,
        replyTo: email || undefined,
        subject: `[Ticket] ${subject}`,
        html: `<p><strong>From:</strong> ${escapeHtml(name || 'Unknown')} ${email ? `&lt;${escapeHtml(email)}&gt;` : ''}</p><p><strong>Agent ID:</strong> ${escapeHtml(agent_id || '—')}</p><p><strong>Ticket:</strong> ${escapeHtml(ticket?.id || '')}</p><hr/><p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
      })
      if (email) {
        await sendEmail({
          to: email,
          subject: 'We received your request — TING Support',
          html: `<p>Hi ${escapeHtml(name || 'there')},</p><p>Thanks for reaching out. We've logged your request and our team will get back to you soon.</p><p><strong>Your message:</strong><br/>${escapeHtml(message).replace(/\n/g, '<br/>')}</p><p>— Team TING</p>`,
        })
      }
    } catch (mailErr: any) {
      console.error('Ticket email failed (non-critical):', mailErr?.message)
    }

    return NextResponse.json({ ok: true, ticket_id: ticket?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
