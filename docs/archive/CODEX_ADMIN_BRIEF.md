# Codex Brief — Admin Panel + Analytics (TING)

Paste this whole file to Codex as its working brief. It is self-contained.

## 1. What you're working on
**TING** is an AI WhatsApp assistant SaaS for Indian real-estate agents (company brand: **Convorian**, domain convorian.in). Agents connect their WhatsApp; the bot answers, qualifies, nurtures leads and books site visits 24/7. ₹999/month, with a free-forever tier (100 AI messages, 10 leads, 5 properties).

**Your scope is exactly two surfaces — do not touch anything else:**
1. **Superadmin admin panel** — `app/admin/page.tsx` + a server API (`app/api/admin/ops/route.ts`, already started).
2. **Agent analytics / ROI dashboard** — `components/screens/AnalyticsScreen.tsx` and `components/screens/ROIScreen.tsx`, backed by `app/api/analytics/route.ts` and `app/api/roi/route.ts`.

## 2. Stack & conventions (match the existing code)
- **Next.js 14 App Router + TypeScript.** Note: this repo pins a customized Next — read `AGENTS.md` and the relevant guide under `node_modules/next/dist/docs/` before using any unfamiliar API.
- **Supabase Postgres.** Server code uses the service-role client `supabaseAdmin` from `@/lib/supabase` (bypasses RLS) — **only ever in API routes / server code, never shipped to the browser.** Browser code uses `getSupabase()` (anon, RLS-bound).
- All API routes start with `export const dynamic = "force-dynamic"`.
- Auth helpers in `lib/apiAuth.ts`: `getAuthContext()`, `requireAgentAccess(agentId)`, and superadmin checks. Admin endpoints must verify the caller is a superadmin (`superadmins` table) before returning anything.
- Styling: inline styles, indigo/violet theme (`#4F46E5` primary, ink `#15161B`). Match the look of existing screens. No new CSS frameworks.
- Money in ₹, dates in IST (`Asia/Kolkata`), Indian number formatting (`toLocaleString('en-IN')`).

## 3. HARD RULES (do not break these)
- **NEVER `select('*')` from `agents` in browser/client code, and never return secrets to the browser.** The columns `wa_access_token`, `wa_pin`, and any provider/payment secret must NEVER reach client memory. The admin page must fetch via the server API (`/api/admin/ops`) which returns an explicit allowlist: agency name, owner email/phone, status, plan fields, message usage, connected number/display name, created date, counts. (This fixes a known security finding — the old admin page did `supabase.from('agents').select('*')` in the browser.)
- **Do NOT modify** any of: `lib/ai-bot.ts`, `lib/nurtureFlow.ts`, `lib/nurtureEngine.ts`, `lib/llm.ts`, `lib/whatsapp.ts`, `lib/outreach.ts`, `app/api/webhook/**`, `app/api/razorpay-webhook/**`, `lib/entitlement.ts`, `lib/botGating.ts`, onboarding, or billing. Those are owned by the main developer (Claude).
- **Read-only where possible.** Admin "ops" actions that mutate data (impersonate, toggle, set WhatsApp number) must go through the server API with superadmin verification — never direct client writes.

## 4. Data model (read the live shape — don't assume)
Read `db/schema.sql` and the migrations under `db/migrations/` for exact columns. Key tables:
- `agents` (workspaces): agency_name, email, phone, city, state, plan, plan_status, plan_expires_at, messages_used, messages_limit, bot_active, wa_phone_number_id, wa_display_name, wa_verified, razorpay_subscription_id, created_at. **(secrets: wa_access_token, wa_pin — never expose)**
- `leads`: agent_id, name, phone, status, temperature, intent, budget_min/max, preferred_areas, created_at, post_visit_result, personality, engagement.
- `appointments`: agent_id, lead_id, scheduled_at, status.
- `properties`: agent_id, title, type, category, price, rent_per_month, status.
- `messages`: lead_id, agent_id, direction, sent_by, created_at, delivery_status.
- `nurture_events`, `activity_log`, `subscription_events`, `support_tickets`, `superadmins`, `team_members`.

## 5. Deliverable 1 — Superadmin admin panel
A superadmin-only dashboard to run the business. Build on the `/api/admin/ops` server route (superadmin-verified) returning per-agent rows from the allowlist above, plus computed counts (leads, properties, appointments, AI messages used, failed sends). The page should show:
- A sortable/searchable table of all agencies: name, owner, plan + status badge, message usage (used/limit), WhatsApp connection state, lead/property counts, signup date.
- Drill-in per agency: recent activity, appointment/booking counts, conversion, last-active.
- Safe ops actions (all via the server API, superadmin-checked): pause/resume bot, set the agency's WhatsApp routing number, impersonate (open their dashboard read-only), mark concierge-onboarding done.
- A top summary: total agencies, active vs free, paying count, MRR (₹999 × paying), signups this week.

## 6. Deliverable 2 — Agent analytics / ROI dashboard
The agent's own view of the value TING delivers. Back it with `/api/analytics` + `/api/roi` (agent-scoped via `requireAgentAccess`). Show:
- Leads captured, qualified, site visits booked, visits done, conversions (sales/rentals) → funnel.
- Response time / messages handled / after-hours replies (the bot's 24/7 value).
- **ROI framing**: estimated commission value from bookings vs the ₹999 cost — the headline "TING earned you ₹X this month".
- Trends over time (week/month), with empty states for new agents.

## 7. Process (important — how your work gets shipped)
- Work on a branch named `codex/admin-analytics`. **Do NOT merge to `main` or deploy.**
- Keep changes limited to the files in section 1 (+ new files you create under `app/api/admin/`, `components/screens/Analytics*`, `components/screens/ROI*`).
- When done: open a PR and stop. The main developer (Claude) will review the delta, port/adjust as needed, run typecheck + CI, and deploy. (External branches are never merged blind here — keep your diff clean and self-contained so review is easy.)
- Run `npm run typecheck` before opening the PR; fix all type errors. Lint warnings are OK, errors are not.

## 8. Definition of done
- Admin page fetches only via the server allowlist API — zero secrets in browser. `grep -n "select('\*')" app/admin/page.tsx` returns nothing.
- Superadmin verification on every admin API path.
- Both dashboards render with real data and have sane empty states.
- `npm run typecheck` clean.
