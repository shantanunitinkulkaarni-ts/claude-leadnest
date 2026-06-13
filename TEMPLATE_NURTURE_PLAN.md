# Template (post-24h) re-engagement engine

*Built June 13, 2026. Goes live once `MSG91_NURTURE_TEMPLATE` env is set.*

## The idea
The free 24h WhatsApp window covers immediate back-and-forth (handled by the
in-window 3h/10h/23h nudges). After it closes, the ONLY compliant way to reach a
quiet lead is an **approved Marketing template** — and each send costs money
(this is what the WhatsApp-credits wallet funds). This engine decides, per lead,
**whether *now* is a good moment to spend one template touch** — context-driven,
not fixed Day-3/Day-5 intervals.

## Decision model (`lib/outreach.ts` → `decideOutreach`)
For each quiet lead whose window has closed:
1. **Cap by intensity** — agent setting `outreach_intensity` (gentle 3 / balanced 5 / persistent 8 max touches). Default **persistent**. Beyond the cap → `nurture_state='dormant'`, stop.
2. **Decaying cadence** — required gap before touch N ≈ `baseGap × growth^N` → gaps GROW each time (e.g. persistent ≈ 1.5d → 2.4d → 3.8d …, ~8 touches over ~2 months).
3. **Lead-value scaling** — hot/score≥8 → 0.6× gap (sooner/closer); warm → 0.85×; cold → 1.6× (slower). So hot leads are pursued harder.
4. **Day/time fit (IST)** — only late-morning (10–13) or early-evening (16–20); never at night. Visit-minded leads (qualified / score≥6) skip Mondays (visits cluster Thu–Sun).
5. **Budget gate** — only if `agent.wa_balance ≥ template cost`. No credits → no send.
6. **Personalised variables** — fills the template's `{{1}},{{2}}` with `[first name, area]` by default (adjust mapping to the live template).

## Sending (`/api/cron` section 1b, every 15 min)
- Scans leads: window closed (>24h since last msg), `opted_in`, `nurture_state` active, not paused/closed, agent on MSG91 with credits.
- `decideOutreach` → if send: `sendViaMsg91Template`, `deductWABalance`, log a `messages` row + `template_sent` activity, bump `template_touches`/`last_template_at`.
- A lead **reply** (webhook) resets `template_touches`, `last_template_at`, and `nurture_state='active'` → reopens the free window and restarts the whole lifecycle.

## Agent control (Settings → "Lead follow-up intensity")
Gentle / Balanced / Persistent segmented control, **PIN-gated** (it spends money),
with a clear spend disclaimer. Default persistent. *(Future: per-lead override in the Inbox.)*

## Config (env) — set these to GO LIVE
| Env | Meaning | Example |
|---|---|---|
| `MSG91_NURTURE_TEMPLATE` | approved template **name** | `re_engage_v1` |
| `MSG91_NURTURE_TEMPLATE_LANG` | language code | `en` |
| `MSG91_TEMPLATE_COST` | ₹ deducted per send | `1` |

Until `MSG91_NURTURE_TEMPLATE` is set, the engine is **inert** (no sends) — safe to ship.

## Open items / future
- Confirm the live template's variable count/order → adjust `buildTemplateValues`.
- Multiple templates (different angles) + pick best per context.
- AI-written free variable (a personalised hook) where the template allows it.
- Meta/MSG91 per-message price confirmation → set `MSG91_TEMPLATE_COST` accurately.
- Per-lead intensity override in the Inbox.
