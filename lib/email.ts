/**
 * Transactional email via Resend (REST API — no SDK dependency).
 *
 * Requires env:
 *   RESEND_API_KEY      — from resend.com → API Keys
 *   RESEND_FROM_EMAIL   — e.g. "Convorian <noreply@convorian.in>"
 *
 * NOTE: emails will only actually deliver once convorian.in is verified
 * in Resend (Domains → Add Domain → add DNS records → Verify).
 * Until then sendEmail() logs a warning and resolves without throwing,
 * so it never breaks a signup/payment flow.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / RESEND_FROM_EMAIL not set — skipping email to', to)
    return { ok: false, error: 'email_not_configured' }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[email] Resend send failed:', res.status, detail)
      return { ok: false, error: `resend_${res.status}` }
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: data.id }
  } catch (err: any) {
    // Never let an email failure break the calling flow.
    console.error('[email] Resend send threw:', err?.message || err)
    return { ok: false, error: 'send_exception' }
  }
}

/** Shared branded wrapper so all emails look consistent. */
function layout(bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#FAFAFB;padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #ECECEF;">
      <div style="background:#4F46E5;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">Convorian</span>
      </div>
      <div style="padding:28px;color:#15161B;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;border-top:1px solid #ECECEF;color:#8A8A93;font-size:12px;">
        Convorian — AI WhatsApp assistant for real-estate agents.<br/>
        <a href="https://convorian.in" style="color:#7C3AED;text-decoration:none;">convorian.in</a>
      </div>
    </div>
  </div>`
}

/** Welcome email on signup. */
export async function sendWelcomeEmail(to: string, name?: string) {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  return sendEmail({
    to,
    subject: 'Welcome to Convorian 🎉',
    html: layout(`
      <p>${greeting}</p>
      <p>Your Convorian account is ready. Add your first lead and let the AI assistant nurture it for you — 24/7 on WhatsApp.</p>
      <p style="margin:24px 0;">
        <a href="https://convorian.in/dashboard"
           style="background:#4F46E5;color:#fff;text-decoration:none;padding:11px 22px;border-radius:9px;font-weight:500;display:inline-block;">
          Open your dashboard
        </a>
      </p>
      <p style="color:#8A8A93;">Questions? Just reply to this email — we read every one.</p>
    `),
    replyTo: 'support@convorian.in',
  })
}
