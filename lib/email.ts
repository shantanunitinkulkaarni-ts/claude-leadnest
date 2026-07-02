/**
 * Transactional + lifecycle email via Resend (REST API — no SDK dependency).
 *
 * Requires env:
 *   RESEND_API_KEY      — from resend.com → API Keys
 *   RESEND_FROM_EMAIL   — e.g. "TING <noreply@convorian.in>"
 *
 * convorian.in is verified in Resend, so emails deliver.
 * sendEmail() never throws — failures are logged and swallowed so a
 * broken email can never break a signup / payment / cron flow.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// Escape user-controlled text before interpolating it into email HTML, so a
// malicious subject/name/message can't inject markup, links or tracking pixels
// into our team inbox (or a user-facing ack email). Use on ANY public input.
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Brand theme (matches app: indigo/violet) ──────────────────────────────
const THEME = {
  primary: '#4F46E5',
  accent: '#7C3AED',
  ink: '#15161B',
  sub: '#6B6B76',
  faint: '#9A9AA3',
  bg: '#F4F4F7',
  card: '#FFFFFF',
  border: '#ECECEF',
  softBg: '#F6F5FF',
}

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
    console.error('[email] Resend send threw:', err?.message || err)
    return { ok: false, error: 'send_exception' }
  }
}

// ── Reusable building blocks ───────────────────────────────────────────────

const APP_URL = 'https://convorian.in'

/** Primary CTA button. */
function button(label: string, href: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
    <tr><td style="border-radius:10px;background:linear-gradient(135deg,${THEME.primary},${THEME.accent});">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">
        ${label}
      </a>
    </td></tr>
  </table>`
}

/** A soft highlighted tip/stat box. */
function infoBox(html: string): string {
  return `
  <div style="background:${THEME.softBg};border:1px solid #E7E4FF;border-radius:12px;padding:16px 18px;margin:18px 0;color:${THEME.ink};font-size:14px;line-height:1.6;">
    ${html}
  </div>`
}

/** Full responsive email shell with branded header + footer. */
function layout(opts: { preheader?: string; body: string }): string {
  const { preheader = '', body } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light only"/>
  <title>TING</title>
</head>
<body style="margin:0;padding:0;background:${THEME.bg};">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${THEME.bg};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${THEME.card};border-radius:16px;overflow:hidden;border:1px solid ${THEME.border};box-shadow:0 1px 3px rgba(20,22,27,0.04);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,${THEME.primary},${THEME.accent});padding:22px 32px;">
          <span style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.02em;">TING</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;color:${THEME.ink};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:22px 32px;border-top:1px solid ${THEME.border};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;color:${THEME.sub};font-size:13px;line-height:1.5;">
            <strong style="color:${THEME.ink};">TING</strong> — your AI WhatsApp assistant for real estate.
          </p>
          <p style="margin:0;color:${THEME.faint};font-size:12px;line-height:1.5;">
            <a href="${APP_URL}" style="color:${THEME.accent};text-decoration:none;">convorian.in</a>
            &nbsp;·&nbsp; Questions? Reply to this email.
            <br/>You're receiving this because you have a TING account.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:${THEME.faint};font-size:11px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">© 2026 Convorian. TING is a product of Convorian.</p>
    </td></tr>
  </table>
</body>
</html>`
}

const h1 = (t: string) => `<h1 style="margin:0 0 14px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${THEME.ink};">${t}</h1>`
const p = (t: string) => `<p style="margin:0 0 14px;color:${THEME.sub};font-size:15px;line-height:1.65;">${t}</p>`

// ── Public senders ─────────────────────────────────────────────────────────

const SUPPORT = 'support@convorian.in'

const firstName = (name?: string) => (name ? name.split(' ')[0] : 'there')

export async function sendWelcomeEmail(to: string, name?: string) {
  const hi = name ? `Welcome, ${firstName(name)} 👋` : 'Welcome to TING 👋'
  return sendEmail({
    to,
    subject: 'Welcome to TING — let’s set up your AI assistant',
    replyTo: SUPPORT,
    html: layout({
      preheader: 'Your AI WhatsApp assistant is ready. Add your first lead in 2 minutes.',
      body: `
        ${h1(hi)}
        ${p('Your account is live. TING’s AI now works 24/7 — answering leads, qualifying them, and booking site visits on WhatsApp, even while you sleep.')}
        ${infoBox('<strong>Fastest path to value:</strong> add one real lead and watch the assistant strike up the conversation. That’s the “aha” moment.')}
        ${button('Add your first lead', `${APP_URL}/dashboard`)}
        ${p('Need a hand getting started? Just reply — a real person reads every message.')}
      `,
    }),
  })
}

// ── Lifecycle / nurture sequence ───────────────────────────────────────────
// Each step is keyed; `nurture_emails_sent` text[] on agents tracks what's sent.
// `day` = days since signup at/after which the email becomes eligible.

export type NurtureStep = {
  key: string
  day: number
  send: (to: string, name: string | undefined, ctx: NurtureContext) => Promise<{ ok: boolean }>
}

export type NurtureContext = {
  leadsCount: number
  messagesSent: number
  plan: string
  planStatus: string
}

export const NURTURE_SEQUENCE: NurtureStep[] = [
  {
    key: 'day1_first_lead',
    day: 1,
    send: (to, name) =>
      sendEmail({
        to,
        subject: 'Your AI assistant is waiting for its first lead',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Add one lead and TING starts the conversation for you.',
          body: `
            ${h1(`Hi ${firstName(name)}, let’s get your first win`)}
            ${p('You signed up yesterday — the single best thing you can do now is add one real lead. TING instantly starts a natural WhatsApp conversation, qualifies them, and nudges toward a site visit.')}
            ${infoBox('It takes about <strong>2 minutes</strong>. Most agents are surprised how human the first reply feels.')}
            ${button('Add a lead now', `${APP_URL}/dashboard`)}
          `,
        }),
      }),
  },
  {
    key: 'day3_tips',
    day: 3,
    send: (to, name) =>
      sendEmail({
        to,
        subject: '3 ways agents close more with TING',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Small setup tweaks that noticeably lift conversions.',
          body: `
            ${h1('Get more out of your assistant')}
            ${p(`A few things, ${firstName(name)}, that the top agents on TING do:`)}
            ${infoBox(`
              <strong>1. Add your properties.</strong> The bot pitches specifics — area, price, layout — instead of generic replies.<br/><br/>
              <strong>2. Set your bot tone.</strong> Friendly, professional, or concise — match how you actually talk.<br/><br/>
              <strong>3. Log site-visit feedback.</strong> The post-visit AI uses it to close warm leads.`)}
            ${button('Open settings', `${APP_URL}/dashboard`)}
          `,
        }),
      }),
  },
  {
    key: 'day7_value',
    day: 7,
    send: (to, name, ctx) =>
      sendEmail({
        to,
        subject: 'A week in — here’s what your assistant has been doing',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Your leads are being nurtured automatically, 24/7.',
          body: `
            ${h1('One week with TING 🎉')}
            ${p(`Hi ${firstName(name)} — while you’ve been busy, your assistant has been working in the background.`)}
            ${infoBox(`So far it’s handling <strong>${ctx.leadsCount} lead${ctx.leadsCount === 1 ? '' : 's'}</strong> and has sent <strong>${ctx.messagesSent} message${ctx.messagesSent === 1 ? '' : 's'}</strong> on your behalf — every one a chance you didn’t have to chase manually.`)}
            ${p('Agents who add 10+ leads in the first two weeks see the biggest jump in booked visits. Keep feeding it.')}
            ${button('View your dashboard', `${APP_URL}/dashboard`)}
          `,
        }),
      }),
  },
  {
    key: 'day14_upgrade',
    day: 14,
    send: (to, name, ctx) =>
      sendEmail({
        to,
        subject: 'Keep your assistant working — pick your plan',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Lock in intro pricing at ₹999/mo before it rises.',
          body: `
            ${h1('You’re getting the hang of it')}
            ${p(`Hi ${firstName(name)} — you’ve seen what TING can do across ${ctx.leadsCount} lead${ctx.leadsCount === 1 ? '' : 's'}. To keep your assistant running without interruption, lock in a plan.`)}
            ${infoBox('<strong>Intro pricing — ₹999/month.</strong> Unlimited leads, 5,000 messages, 24/7 AI, site-visit booking, ROI dashboard, priority support. This rate is for our first agents only — it goes up soon.')}
            ${button('Choose your plan', `${APP_URL}/dashboard`)}
            ${p('Questions about billing? Just reply — happy to help.')}
          `,
        }),
      }),
  },
  {
    key: 'day21_social_proof',
    day: 21,
    send: (to, name) =>
      sendEmail({
        to,
        subject: 'The leads you don’t follow up on cost the most',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Consistency is the whole game in real estate.',
          body: `
            ${h1('The follow-up gap')}
            ${p(`${firstName(name)}, most deals aren’t lost at the pitch — they’re lost in the silence after the first message. That’s exactly the gap TING fills: it never forgets, never gets tired, and follows up at the right time, every time.`)}
            ${infoBox('Let the assistant carry the repetitive follow-ups so you spend your time only on leads that are ready to move.')}
            ${button('Back to your dashboard', `${APP_URL}/dashboard`)}
          `,
        }),
      }),
  },
  {
    key: 'day30_final',
    day: 30,
    send: (to, name) =>
      sendEmail({
        to,
        subject: 'Let’s keep your AI assistant on',
        replyTo: SUPPORT,
        html: layout({
          preheader: 'Continue at intro pricing — ₹999/mo.',
          body: `
            ${h1('A month of TING')}
            ${p(`It’s been a month, ${firstName(name)}. If the assistant has saved you even a few hours of chasing leads, it’s already paid for itself.`)}
            ${infoBox('<strong>Stay on at ₹999/month</strong> — intro pricing for early agents. Upgrade in a couple of taps and nothing in your setup changes.')}
            ${button('Continue with TING', `${APP_URL}/dashboard`)}
            ${p('And if something’s holding you back, reply and tell me — I read every response personally. — Team TING')}
          `,
        }),
      }),
  },
]
