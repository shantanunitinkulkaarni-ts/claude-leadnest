export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentAccess } from '@/lib/apiAuth'

// Renders a branded, printable payment receipt for a single subscription charge.
// Opened in a new browser tab (carries the auth cookie); the user prints or
// "Save as PDF" from the browser — no server-side PDF dependency.
//
// We label it a "Payment Receipt" (not a tax invoice): Convorian is run as a
// sole proprietorship and is not GST-registered.

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '—' }
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const agentId = params.get('agent_id')
  const eventId = params.get('event_id')
  if (!agentId || !eventId) {
    return new NextResponse('agent_id and event_id required', { status: 400 })
  }

  try {
    const access = await requireAgentAccess(agentId)
    if ('error' in access) return access.error

    const { data: ev, error: evErr } = await supabaseAdmin
      .from('subscription_events')
      .select('id, created_at, amount, payment_id, agent_id')
      .eq('id', eventId)
      .eq('agent_id', agentId) // scope to the authorised agent
      .maybeSingle()
    if (evErr) throw evErr
    if (!ev) return new NextResponse('Receipt not found', { status: 404 })

    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('name, email, agency_name, phone, city, state')
      .eq('id', agentId)
      .single()

    const amount = ev.amount != null ? Number(ev.amount) : 999
    const receiptNo = 'CVN-' + String(ev.payment_id || ev.id).replace(/^pay_/, '').slice(-12).toUpperCase()
    const billedTo = [agent?.agency_name, agent?.name].filter(Boolean).join(' · ') || agent?.email || '—'
    const location = [agent?.city, agent?.state].filter(Boolean).join(', ')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${esc(receiptNo)} — Convorian</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2024; background: #F4F3EE; padding: 32px 16px; }
  .sheet { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 16px; border: 1px solid rgba(26,25,22,0.08); overflow: hidden; }
  .head { background: linear-gradient(135deg,#4F46E5,#7C3AED); color: #fff; padding: 32px 36px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .brand small { display: block; font-size: 12px; font-weight: 400; opacity: 0.85; margin-top: 4px; }
  .doc-label { text-align: right; }
  .doc-label .t { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9; }
  .doc-label .n { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .body { padding: 32px 36px; }
  .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 24px; margin-bottom: 28px; }
  .meta .col { font-size: 13px; line-height: 1.7; }
  .meta .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9E9B92; margin-bottom: 4px; }
  .meta strong { color: #15161B; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9E9B92; padding: 0 0 10px; border-bottom: 1px solid rgba(26,25,22,0.1); }
  th.r, td.r { text-align: right; }
  td { padding: 14px 0; font-size: 14px; color: #3D3B34; border-bottom: 1px solid rgba(26,25,22,0.06); }
  td .desc-sub { display: block; font-size: 12px; color: #9E9B92; margin-top: 2px; }
  .totals { margin-left: auto; width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #3D3B34; }
  .totals .grand { border-top: 2px solid #15161B; margin-top: 6px; padding-top: 12px; font-size: 18px; font-weight: 700; color: #15161B; }
  .paid { display: inline-block; margin-top: 6px; background: #E7F6EC; color: #1B7A43; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.04em; }
  .note { margin-top: 28px; padding: 16px 18px; background: #F4F3EE; border-radius: 10px; font-size: 12px; color: #6B6860; line-height: 1.6; }
  .foot { padding: 20px 36px 32px; font-size: 12px; color: #9E9B92; text-align: center; line-height: 1.6; }
  .foot a { color: #4F46E5; text-decoration: none; }
  .actions { max-width: 640px; margin: 20px auto 0; text-align: center; }
  .actions button { background: #4F46E5; color: #fff; border: none; padding: 11px 24px; border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: none; border-radius: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">Convorian<small>AI WhatsApp Assistant for Real Estate</small></div>
      <div class="doc-label">
        <div class="t">Payment Receipt</div>
        <div class="n">${esc(receiptNo)}</div>
      </div>
    </div>
    <div class="body">
      <div class="meta">
        <div class="col">
          <div class="lbl">Billed to</div>
          <strong>${esc(billedTo)}</strong><br/>
          ${agent?.email ? esc(agent.email) + '<br/>' : ''}
          ${agent?.phone ? esc(agent.phone) + '<br/>' : ''}
          ${location ? esc(location) : ''}
        </div>
        <div class="col" style="text-align:right">
          <div class="lbl">Payment date</div>
          <strong>${esc(fmtDate(ev.created_at))}</strong><br/>
          <div class="lbl" style="margin-top:12px">Payment ID</div>
          ${esc(ev.payment_id || '—')}
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Description</th><th class="r">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Convorian — Monthly Subscription<span class="desc-sub">AI WhatsApp assistant · 1 month</span></td>
            <td class="r">${esc(fmtINR(amount))}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${esc(fmtINR(amount))}</span></div>
        <div class="row"><span>Tax (GST)</span><span>Not applicable</span></div>
        <div class="row grand"><span>Total paid</span><span>${esc(fmtINR(amount))}</span></div>
        <div style="text-align:right"><span class="paid">✓ Paid</span></div>
      </div>

      <div class="note">
        Paid via UPI Autopay (Razorpay). This is a payment receipt, not a tax invoice — Convorian is
        operated as a sole proprietorship and is not registered for GST, so no GST has been charged.
        Please retain this receipt for your records.
      </div>
    </div>
    <div class="foot">
      Convorian · <a href="https://convorian.in">convorian.in</a> · Questions? <a href="mailto:support@convorian.in">support@convorian.in</a>
    </div>
  </div>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' }
    })
  } catch (e: any) {
    return new NextResponse('Could not generate receipt: ' + esc(e.message), { status: 500 })
  }
}
