# TING (formerly LeadNest/Convorian) — Complete Source of Truth

> **Master documentation for TING, the AI-powered WhatsApp assistant SaaS for Indian real-estate agents**
>
> Last updated: 2026-07-11
> Version: 1.0 (Consolidated Single Source of Truth)

---

## TABLE OF CONTENTS

1. [PROJECT OVERVIEW](#project-overview)
2. [TECH STACK](#tech-stack)
3. [BUSINESS CONTEXT](#business-context)
4. [CORE ARCHITECTURE](#core-architecture)
5. [BOT FLOW & STATE MACHINE](#bot-flow--state-machine)
6. [LEAD NURTURE ENGINE](#lead-nurture-engine)
7. [DATABASE SCHEMA](#database-schema)
8. [API ENDPOINTS](#api-endpoints)
9. [SECURITY & COMPLIANCE](#security--compliance)
10. [DEPLOYMENT & OPERATIONS](#deployment--operations)
11. [TESTING STRATEGY](#testing-strategy)
12. [TEAM & DEVELOPMENT](#team--development)
13. [LAUNCH & GO-LIVE](#launch--go-live)
14. [ENGINE ROADMAP](#engine-roadmap)
15. [EVALUATION FRAMEWORK](#evaluation-framework)
16. [COMMON OPERATIONS](#common-operations)
17. [EMERGENCY PROCEDURES](#emergency-procedures)
18. [CHANGE LOG](#change-log)

---

## PROJECT OVERVIEW

### What is TING?

**TING** (formerly LeadNest/Convorian) is a production-grade AI-powered WhatsApp SaaS platform for Indian real-estate agents. The bot answers, qualifies, nurtures leads and books site visits 24/7.

**Price:** ₹999/month vs ₹5K/mo competitors (Wati, Interakt, Wise Parrot)

**Target:** Indian real-estate agents, first 10 clients via warm network

**Live at:** https://convorian.in

**Status:** Pre-launch (zero real users) — Meta App Review + Tech Provider APPROVED (2026-06-22) — launch unblocked

---

## TECH STACK

### Frontend & Backend
- **Next.js 14.2.29** with App Router and TypeScript 5
- **Tailwind CSS 3.4.1** for styling
- **React 18** with modern hooks and patterns

### Database & Authentication
- **Supabase PostgreSQL** with Row Level Security (RLS)
- **@supabase/ssr** for server-side auth
- **Supabase Auth** for user authentication and sessions

### AI & LLM Integration
- **Groq API** (llama-3.3-70b-versatile) - Primary LLM
- **GLM-4.5-Flash (Z.ai)** - Fallback LLM
- Hedged request system with parallel attempts and retries
- DeepSeek removed (balance hit zero)
- Cerebras retired from live path (5 req/min free cap too low)
- Gemini/Claude/Anthropic are NOT in the live path

### WhatsApp Integration
- **Meta Cloud API DIRECT** (Tech Provider) - Primary channel
- MSG91 removed from live path (legacy peripheral systems only)
- Per-agent credentials stored in database: `wa_phone_number_id` + `wa_access_token`
- Inbound webhook: `/api/webhook` verifies Meta's `X-Hub-Signature-256`
- Webhook verification token: `WHATSAPP_VERIFY_TOKEN` = `convorian_meta_verify_2026`

### Payments
- **Razorpay** - Subscription and wallet top-up system
- Webhook integration for payment events
- **LIVE** — wallet top-up + ₹999/mo subscriptions (UPI Autopay)
- Test mode: success@razorpay

### Email
- **Resend** via REST (`lib/email.ts` `sendEmail`)
- Domain verified: noreply@convorian.in
- Required env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

### DevOps & CI/CD
- **Vercel** - Primary hosting platform (git auto-deploy DISCONNECTED)
- **GitHub Actions** - CI/CD workflows and scheduled cron jobs
- **Playwright** - E2E testing
- **Sentry** - Error tracking (org `covorian`, EU region)

### Other Tools
- **Papaparse** - CSV processing
- **Sharp** - Image processing
- **Zustand** - State management (for client-side)

---

## BUSINESS CONTEXT

### Business Model
**¥999/mo vs competitors (Wati, Interakt, Wise Parrot ¥5K/mo)**

**Edge case:** AI conversion engine + real-estate niche

**Target:** Indian agents, first 10 clients via warm network

### Pricing Tiers
- **Free plan:** 500 AI msgs / 10 leads / 5 properties (no expiry, no billing)
- **Subscription:** ₹999/month (waits for founder approval to enforce)

### Pre-revenue Status
- **NOT launched** — zero real users
- Everything live is testing only
- Meta App Review + Tech Provider now APPROVED
- First real onboarding = actual launch

### Constraints
- **Vercel Hobby plan:** cron max once/day
- **Groq free tier can throttle** → GLM fallback exists for this reason
- **WhatsApp 24h-window + templates:** strict to avoid bans
- **Privacy:** conversation-only data; consent captured; anonymise for cross-client learning

---

## CORE ARCHITECTURE

### AI-First Bot Design
- **AI decodes intent, code executes actions** - AI never types property facts directly
- **Hedged LLM requests** - Parallel Groq attempts with GLM fallback
- **Max history constraint** - Keeps conversation focused (12 messages max)
- **Decision adapter pattern** - AI→code translation via flow controller

### Separation of Concerns
- **Bot orchestration** - `lib/ai-bot.ts` as central handler (1045 lines)
- **Pure functions** - Testable logic extracted to `lib/bot/` subdirectory
- **Prompt engineering** - Separate system prompts with clear stage instructions
- **Flow control** - Decision adapter pattern for AI→code translation

### Data Architecture
- **Migration-based schema** - 37+ migration files tracking changes
- **Comprehensive indexing** - 50+ indexes for query performance
- **JSONB metadata** - Flexible schema for evolving requirements
- **Tenant isolation** - Each agent/team only sees their data (RLS)

### Testing Strategy
- **Playwright for E2E** - Full flow testing (smoke, golden path, security, live booking)
- **Unit tests for pure functions** - 50+ individual tests for LLM, intent, time parsing
- **Critical gate tests** - 5-minute timeout for important flows
- **Evaluations suite** - Engine evaluation with replay capabilities

---

## BOT FLOW & STATE MACHINE

### Live Bot Engine
- **File:** `lib/ai-bot.ts`
- **Function:** `handleAiBotMessage()`
- **Entry point:** `app/api/webhook/route.ts:221` calls on every inbound WhatsApp message
- **Do NOT refactor before launch** - behavior-preserving fixes only

### Dead Code
- **`lib/botOrchestrator.ts`** - NOT wired in, no env var, no DB column. Has passing unit tests. Do not delete (founder decision), but ignore for launch work.

### LLM Pipeline
```
Groq (llama-3.3-70b-versatile) — hedged, primary
  ↓ on failure
GLM-4.5-Flash (z.ai) — one-shot fallback
```

**Entry point:** `callLLM()` in `lib/llm.ts`
**Keys:** `GROQ_API_KEY`, `GLM_API_KEY`
**GLM endpoint:** `https://api.z.ai/api/paas/v4/chat/completions`
**GLM config:** `thinking: { type: 'disabled' }` (saves latency/tokens)

**Hedged request strategy:**
- Parallel Groq attempts
- Automatic GLM fallback on failure
- Retry mechanism with exponential backoff
- Minimizes API costs and improves reliability

### Supabase
- Bot uses **service-role** client (`supabaseAdmin`) - bypasses RLS
- Lazy initialization via Proxy pattern in `lib/supabase.ts`
- Fail-closed: missing env vars throw at first access, never silently default

### Bot State Machine (8 Stages)

1. **NEW_LEAD** → greeting → Template greeting
2. **AWAITING_LANGUAGE** → ask language → store
3. **AWAITING_NAME** → ask name → store
4. **AWAITING_INTENT** → buy/rent? → store
5. **AWAITING_AREA** → extract area → search DB
6. **PROPERTY_SHOWN** → show property card + photos
7. **AWAITING_VISIT_TIME** → "Tell me date/time" → stage pending
8. **AWAITING_EMAIL** → collect email → save
9. **VISIT_CONFIRMED** → confirm → alert agent
10. **HANDOVER** → handover to human

**Conversation history:** Keep only last 12 exchanges to limit token usage

---

## LEAD NURTURE ENGINE

### Nurture Philosophy
- **Consent-tiered** — protect the agent's number above any single lead
- **Goal = sale or clean stop**
- **The moat = data + learned behaviour**, uncopyable without our data

### Decision Layer
- **File:** `lib/nurtureFlow.ts`
- **Founder's tested A/B/C/D timeline:**
  - In-window: 3h/6h/12h/23h nudges
  - Post-window: Plan A→B→C→D
  - Quiet hours: 9am–10pm IST
  - Send slots and halt conditions

### Data Layer (NEW - built)
- `nurture_events` - Learning log (the data moat)
- `personality` - Per-lead inferred profile (silent, never shown to customer)
- `engagement` - Response time, reply length, counts
- `consent_tier` - Opt-in/out tracking

### Nurture Events Table Structure
```sql
nurture_events (
  id uuid primary key,
  lead_id uuid references leads(id),
  event_type text,  -- 'nudge', 'template', 'reminder', etc.
  template_name text,
  event_at timestamptz,
  responded_at timestamptz
)
```

### A Reply MUST Reset
- `window_nudge_count`
- `nurture_plan`
- `plan_d_touches`
- This is done in `lib/ai-bot.ts`

### Post-Window Handling
- Currently still calls MSG91 templates → **must be re-pointed to Meta templates**
- Meta templates approved: `lead_new_match` (en+hi+mr), `lead_visit_invite`, `lead_final_touch`, `lead_open_question`, `lead_offer`, `visit_reminder`

### Nurture Flow Flags
- `NURTURE_FLOW_V2=true` - Enable new nurture system
- `MSG91_TEMPLATES_LIVE=true` - Use MSG91 templates (post-window)
- When Meta templates approved, switch to `NURTURE_FLOW_V2=true` and use Meta templates

---

## DATABASE SCHEMA

### Core Tables (14 total)

1. **agents** - User accounts with WhatsApp credentials, subscription info, settings
2. **leads** - Customer profiles with AI scores, status, conversation history
3. **properties** - Real estate inventory (price, location, features, media)
4. **messages** - Conversation logs with delivery status tracking
5. **appointments** - Site visit scheduling and reminders
6. **team_members** - Agency team member management
7. **activity_log** - System activity tracking
8. **knowledge_gaps** - AI-identified gaps in bot knowledge
9. **support_chat_logs** - Human support conversation history
10. **support_tickets** - Formal support requests
11. **wa_transactions** - WhatsApp credit transactions
12. **subscription_events** - Payment history and events
13. **superadmins** - Platform administrators

### Key Features
- **UUID primary keys** for all records
- **Timestamp tracking** (created_at, updated_at, last_message_at)
- **JSONB columns** for flexible metadata
- **Array columns** for tags, features, preferences
- **Foreign key relationships** with cascade/delete rules
- **Unique constraints** for phone numbers and emails
- **Specialized indexes** for performance

### Important Columns

**Leads table:**
- `conversation_stage` - Bot conversation stage (NEW_LEAD → HANDOVER)
- `lead_state` - Lead lifecycle state (DISCOVERY → PRESENTATION → VISIT_INTEREST → etc.)
- `intent` - buy/rent/sell/other
- `budget_range` - Min/max budget (parsed by AI)
- `personality` - Silently profiled (never shown to customer)
- `nurture_events` - Learning log
- `window_nudge_count` - Resets on inbound

**Properties table:**
- `project_website` - Optional project website
- `website_ai_consent` - AI consent checkbox
- `media` - Photo/video storage

**Appointments table:**
- `scheduled_at` - Visit time
- `status` - pending | confirmed | cancelled | completed

---

## API ENDPOINTS

### Authentication & User Management
- `POST /api/auth/register` - User registration with IP rate limiting (5/min)
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/mfa/verify` - 2FA verification endpoint

### Bot & WhatsApp
- `POST /api/webhook` - Meta WhatsApp webhook handler (primary inbound route)
- `POST /api/demo-chat` - Manual bot message testing
- `POST /api/whatsapp/send` - Direct WhatsApp messaging
- `GET /api/whatsapp/verify` - Meta webhook verification

### Lead & Conversation
- `GET/POST /api/leads` - Lead CRUD operations
- `GET/POST /api/messages` - Message history and tracking
- `GET/POST /api/agent/message` - Bot reply generation

### Property Management
- `GET/POST/PUT /api/properties` - Property CRUD with search/filter
- `GET/POST /api/properties/search` - AI-powered property matching
- `POST /api/properties/media/upload` - Photo/video uploads

### Appointment Management
- `GET/POST /api/appointments` - Appointment scheduling
- `GET/POST /api/appointments/confirm` - Appointment confirmation flow
- `GET/POST /api/appointments/reminder` - Reminder system

### Analytics & Reporting
- `GET /api/analytics/dashboard` - Overview metrics
- `GET /api/analytics/roi` - ROI calculations and charts
- `GET /api/analytics/lead-qualification` - Lead scoring breakdown

### Admin & Management
- `GET/PUT/DELETE /api/admin/agents` - Agent management
- `GET /api/admin/leads` - Lead export and management
- `GET/POST /api/admin/support-ticket` - Support ticket creation

### System & Support
- `POST /api/support-chat` - Human support chat
- `POST /api/support-feedback` - Chat feedback
- `GET /api/knowledge-gaps` - AI knowledge gap analysis

### Cron & Jobs
- `GET /api/cron` - Scheduled job handler (protected by secret)
- `GET /api/subscription/status` - Subscription check
- `GET /api/meta/onboard` - WhatsApp onboarding completion

### Razorpay Integration
- `POST /api/razorpay-webhook` - Payment notification handler
- `GET/POST /api/subscription/manage` - Subscription management

---

## SECURITY & COMPLIANCE

### Per-agent Data Isolation
Enforced at the API layer. Every sensitive route calls auth guards that check:
- Logged-in user owns that agent via `team_members`
- Or is a superadmin
- Agent A cannot read Agent B's leads

### RLS Policies (30+ policies)
- **Tenant isolation** - Each agent/team only sees their data
- **Role-based access** - Service role, authenticated, public
- **Guardrails:**
  - Agents: Create/update own workspace, superadmin reads all
  - Appointments/Leads/Messages/Properties: Tenant-scoped access
  - Team members: Admin vs member roles
  - Superadmins: Read own records

### Secret Handling
- **No secrets exposed client-side** - Only safe values are `NEXT_PUBLIC_*`
- **Service-role key** - Server-only only
- **No secrets in git** - `.gitignore` covers `.env*`
- **Webhooks verified:**
  - Razorpay webhook checks HMAC signature over raw body
  - MSG91 status webhook uses shared-secret token
  - Meta webhook verifies `X-Hub-Signature-256`

### Security Headers
- HSTS (preload, 63072000 seconds)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- CSP: Report-Only (monitor 1 week, then enforce)

### Rate Limiting
- Signup: 5/min (IP rate limit)
- Support chat: 20/min (IP rate limit before LLM call)
- Multiple levels of protection

### 2FA/MFA
- Optional TOTP-based 2FA (opt-in)
- Breach account-lockdown: lock after N failed / anomalous logins

### Privacy (DPDP Compliant)
- Consent captured (terms+marketing+timestamp)
- Lead opt-in/opt-out tracked
- Conversation-only data for AI training
- Anonymise for cross-client learning

---

## DEPLOYMENT & OPERATIONS

### Services
| Service | Used for | Where to log in |
|---------|----------|-----------------|
| **Vercel** | Hosting + deploys + env vars | vercel.com |
| **Supabase** | Database (leads, agents, messages…) | supabase.com |
| **GitHub** | Code repo | github.com |
| **Razorpay** | Payments (₹999 subscriptions, wallet) | dashboard.razorpay.com |
| **Resend** | Outbound email | resend.com |
| **Meta / WhatsApp** | WhatsApp Business Platform | developers.facebook.com |
| **Sentry** | Error tracking | sentry.io |
| **BetterUptime** | Uptime monitoring | betteruptime.com |

### Deploying a Change
```bash
# from project root

# 1. Local typecheck (sanity)
npm run typecheck
npm run lint
npm test  # Playwright unit specs (~30s)

# 2. Deploy
vercel deploy --prod --yes

# 3. After deploy, verify
#    - Open https://convorian.in → page loads
#    - Try signup with bogus data 6x in a row → 6th should 429
#    - Try support chat 21x in a minute → 21st should soft-degrade
```

**Env var changes need a redeploy** to take effect.

**Setting env vars:**
```bash
vercel env rm NAME production --yes
vercel env add NAME production --value "the-value" --yes
vercel deploy --prod --yes
```

**Important:** Piped input stores EMPTY. Always use `--value`.

### Environment Variables
Critical vars in Vercel:
- `GROQ_API_KEY`, `GLM_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
- `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `CRON_SECRET` (for /api/cron protection)
- `MSG91_WEBHOOK_SECRET` (if still using MSG91 for status webhooks)
- `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`

**Supabase DB URL:** `DATABASE_URL` is in Vercel env. Use direct connection string for DDL (PostgREST can't run DDL).

### Rollback
**Stable checkpoint:** `stable-2026-06-22` tag
```bash
git checkout stable-2026-06-22
vercel deploy --prod --yes
```

If Codex commits require rollback:
```bash
git checkout -B hotfix-revert stable-2026-06-22
vercel deploy --prod --yes
```

### Database Backups
- **Nightly via GitHub Actions** (`.github/workflows/db-backup.yml`)
- Runs at 02:00 IST
- Stores as GitHub artifact (90-day retention)
- One founder step to activate: add GitHub repo secret `SUPABASE_DB_URL`

### Agent Controls
**Pause a misbehaving agent's bot:** set `bot_active = false` on their `agents` row
**Reset/clear test data:** delete in FK-safe order — `wa_transactions` → `appointments` → `messages` → `activity_log` → `leads`

---

## TESTING STRATEGY

### Test Framework
- **Playwright** - `tests/` directory
- Commands:
  - `npm run typecheck` - TypeScript check
  - `npm run lint` - ESLint
  - `npm test` - All tests
  - `npm run test:critical` - Critical path tests (10s timeout)
  - `npm run test:e2e` - Full E2E tests (60s timeout)
  - `npm run ci` - Lint + typecheck + tests
  - `npm run eval` - Live eval with AI judge
  - `npm run eval:record` - Regenerate fixtures

### Test Directories
- `tests/critical/` - Critical path tests
- `tests/e2e/` - End-to-end tests
- `tests/unit/` - Unit tests for pure functions (`*.spec.ts`)
- `tests/api/` - API route tests
- `tests/evals/` - Evaluation tests

### Staging
- **No separate staging environment** - it's prod (`convorian.in`) + founder test agent
- Test WhatsApp number: **755** (Convorian test number)
- `TEST_AGENT_ID` env var exists for tests
- Founder can seed test data via in-app "sample lead" flow

### Playwright Config
- Port: 3003 (default)
- Test timeout: 90s for dev, 15s for assertions
- CI workflow with 1 worker for rate limits
- Auto-start dev server option

### Critical Test Coverage
- **Core loop:** qualify → match → book → email
- **Booking flow:** time parsing, office hours, confirmation
- **Language switching:** EN/HI/MR/Hinglish
- **Property matching:** intent filtering, budget tolerance, nearby areas
- **State machine:** all transitions
- **Time parsing:** IST date/time, "kal subah", "day after tomorrow", "22-06", "next Monday"
- **No-match loop:** when zero properties match, offer nearby areas/call back
- **Security:** webhook auth, rate limiting, 2FA

### Eval Framework
Two ways evals run:

**1. Live (real API calls, manual, never in CI):**
```bash
npm run eval
```
Needs `GROQ_API_KEY` (+ `GLM_API_KEY`/`CEREBRAS_API_KEY`) in `.env`. Runs the **real** engine prompt (`buildEnginePrompt` in `lib/promptEngine.ts`) against scenarios in `tests/evals/scenarios.ts` and uses Groq as an AI judge to grade each reply (PASS/FAIL).

**2. Fixture replay (zero API calls, runs in every `npm test` / CI):**
`tests/evals/engine-eval-replay.spec.ts` replays committed fixtures. Re-runs `parseEngineResponse()` against frozen raw output (catches parser regressions) and asserts the recorded judge verdict was PASS. Does not call any LLM.

**Workflow for prompt change:**
1. Edit prompt in `lib/promptEngine.ts`
2. `npm run eval` → confirm target scenario passes, nothing regressed
3. `npm run eval:record` → regenerates fixtures
4. Review fixture diff in PR
5. Commit updated fixtures
6. CI will replay them on every future PR

---

## TEAM & DEVELOPMENT

### Lead Directives
**Do not invent, experiment, or think beyond what is asked:**
- Understand the task → Build exactly that → Show result
- No unnecessary abstractions, flags, or fallbacks
- Reliability > sophistication
- Code for what exists today, not what might exist tomorrow

### Working Rules
1. **No uncommitted WIP.** Commit to branch immediately. **NEVER leave bot/UI changes loose on working tree.**
2. **`lib/ai-bot.ts` + `lib/promptEngine.ts`: behaviour-preserving fixes only.** No refactor before launch.
3. Every PR: `npm run typecheck && npm run lint && npm run test:critical` green before requesting review.
4. All bot/prompt PRs need Claude review and must land by deadline.
5. A lead reply MUST reset nurture counters, or the timeline silently breaks.

### Team Roles
| Role | Model | Lead Until | Days Left | Focus Area |
|------|-------|-----------|-----------|------------|
| **Lead** | Claude (original) | **July 6** | ~7 days | Architecture, critical path, knowledge transfer, final sign-off |
| **Junior** | Codex Plus | ~July 24 | ~25 days | Tutorials, UI, well-scoped isolated tasks, unit tests |
| **Junior** | Cline (GLM) | ~July 29 | ~30 days | Bot hardening, testing, launch prep, new features |

**Chain of command:**
- Claude is the **lead** until July 6 — all architectural decisions go through him
- After July 6, Codex and Cline split remaining work
- Founder (Shantanu) has final approval on all merges

### Git Workflow
- `main` — production (deployed manually)
- `stable-YYYY-MM-DD` — rollback snapshots
- `fallback/bot-working-YYYY-MM-DD` — known-good bot state
- Feature branches per model:
  - `claude/` prefix for Claude's work
  - `codex/` prefix for Codex's work
  - `cline/` prefix for Cline's work

### Review Process
- All PRs reviewed by Claude (until July 6)
- After July 6: cross-review between Codex and Cline
- Founder (Shantanu) has final approval

### Communication
- This document is the **single source of truth** for team coordination
- All architectural decisions go through Claude until July 6
- Bug reports should include: exact message, bot response, expected response, frequency
- Use GitHub issues for task tracking

---

## LAUNCH & GO-LIVE

### Pre-Launch Checklist
- [ ] Self-serve WABA test passes on a friend's real number (different Meta acct)
- [ ] Razorpay policy URLs in dashboard if not done
- [ ] Meta templates (hi/mr for all templates) submitted
- [ ] 2FA + account-lockdown implemented
- [ ] Backup restore tested
- [ ] CSP Report-Only week clean (then promote to enforce)

### Meta App Review + Tech Provider
**APPROVED (2026-06-22)** — launch unblocked

**Setup gotchas discovered:**
1. Number needs `/register` (6-digit PIN) before it can send
2. WABA must be subscribed to our app (`POST /{WABA}/subscribed_apps`)
3. App must be **Published/Live** for real inbound delivery
4. Can't cold-message a test number from WhatsApp (business must message first)
5. **For migrating a number off another BSP:**
   - Add+verify in Meta API Setup (OTP)
   - `/register` requires data localization: `POST /{phone_number_id}/settings` with `{storage_configuration:{status:"IN_COUNTRY_STORAGE_ENABLED",data_localization_region:"IN"}}` FIRST
   - Then `/register` with 6-digit PIN
   - Subscribe WABA
   - Set `wa_phone_number_id` on agent

### Embedded Signup (Self-Serve Onboarding)
**BUILT** — popup flow verified working

**Backend:** `lib/metaOnboard.ts` + `/api/meta/onboard`
**Frontend:** `components/ConnectWhatsAppButton.tsx` = Facebook JS SDK v4 popup
**Configuration ID:** `27137467672622588`

**Env:** `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`

**Gotcha:** in Facebook-Login-for-Business → Settings, "Login with the JavaScript SDK" must be ON and `https://convorian.in` added to Allowed Domains.

**Verification:** Exchange code → subscribe WABA → set IN storage → register number → save creds to agent.

**Live WABA:** `1016312184125965`, EN templates approved.

**Hindi/Marathi for all templates:** SUBMITTED to Meta 2026-06-24, status PENDING.

### Razorpay Subscription Setup
**GO-LIVE steps:**
1. Enable Subscriptions on Razorpay account
2. Create ₹999/month Plan ("Convorian Monthly")
3. Create webhook at `https://convorian.in/api/razorpay-webhook` with subscription events
4. Add to Vercel: `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`
5. Run subscription_migration.sql in Supabase

**How it works:**
1. Agent clicks "Activate plan — ₹999/mo"
2. Razorpay Checkout opens; they authorise UPI Autopay mandate
3. Razorpay auto-charges ₹999 every month
4. Webhook extends their access automatically
5. If charge fails repeatedly → subscription "halts" → bot pauses
6. Agent can Cancel anytime; they keep access until end of paid period

---

## ENGINE ROADMAP

### The honest moat
We don't train foundation models. The moat = **sales-tuned playbook (prompt) + per-lead personalisation + data flywheel learning from real deal outcomes.** That compounds and is uncopyable without our data. A frontier model can be swapped in for hard turns later; the system around it is the IP.

### Architecture (6 layers)
1. **Sales Brain** — system prompt as a real playbook: SPIN/consultative, BANT qualification, objection handling, rapport, urgency-without-pushiness, advance-vs-pull-back, emotional mirroring. (Foundation exists: stage instructions in system prompts.)
2. **Lead Understanding** — per-lead inferred profile: intent, budget, temperature (`ai_score`), comm style, sentiment/emotion, objections. Privacy-safe: conversation-only, consent captured, anonymise for cross-client learning.
3. **Memory & Context** — per-lead rolling memory + long-thread summarisation; per-agent context (properties/areas/tone).
4. **Timing & Cadence** — when to send (lead's active hours), follow-up spacing, multi-month long-game nurture, when to do nothing. Respect WhatsApp 24h window + templates.
5. **Content Intelligence** — when to send pics / which property; A/B-tested copy.
6. **Learning Flywheel** — capture deal outcomes → mine winning plays → few-shot best plays → A/B test → propagate winners across clients → periodic fine-tune.

### Phases (by ROI)
- **Phase 1 — Sales-grade prompt overhaul** *(in progress)*: human persona, emotional intelligence, read-the-lead, advance/pull-back logic, restraint. Fixes language-switching & too-casual tone. No new infra.
- **Phase 2 — Lead profiling & dynamic strategy**: richer profile each turn; bot selects a strategy per lead state.
- **Phase 3 — Timing & long-game cadence**: optimal send-time, follow-up spacing, multi-month re-engagement.
- **Phase 4 — Content & A/B experimentation**: pic timing, message-variant testing + logging.
- **Phase 5 — Outcome capture & flywheel**: dashboard signal for deal closed/rented/lost → outcome-labelled dataset → few-shot winning plays → cross-client propagation. (Conversation logging foundation exists.)
- **Phase 6 — Self-improvement loop**: eval set of outcome-labelled conversations; every prompt change measured (no regressions). Human-in-the-loop iteration first; automated suggestion later.

### Guardrails (non-negotiable)
- **Privacy:** conversation-only data; consent captured; anonymise for cross-client learning.
- **Anti-ban:** strict WhatsApp 24h-window + template compliance.
- **No fabrication of property details.** Trust = conversion.

### Metrics
Reply rate · qualification rate · visit-booking rate · **deal-close rate / client** · trial→paid renewal. The engine's job is moving these.

---

## EVALUATION FRAMEWORK

### Eval Suite
The bot's conversation quality is graded by **scenario evals** before any prompt change ships.

### Scenarios live in
`tests/evals/scenarios.ts` — each is `{ name, lead (mock), messages, rule }`, shared by both live spec and replay spec.

### Known gaps (as of 2026-06-16)
18 of 38 scenarios currently **fail** their real judge verdict against the live engine — genuine prompt-quality bugs, not infra bugs. These were deliberately NOT committed as fixtures so CI replay gate doesn't go permanently red. Tracked as backlog item.

### Why this matters
This is the standard way serious AI teams ship prompts: a measurable eval set + AI judge, so "is the bot better?" is answered with data, not vibes. The fixture-replay layer turns each *fixed* bug into a permanent, free CI check.

---

## COMMON OPERATIONS

### Setting an environment variable
Piped input stores EMPTY. Always use `--value`:
```bash
vercel env rm NAME production --yes
vercel env add NAME production --value "the-value" --yes
vercel deploy --prod --yes
```

Sensitive vars can't be read back via `vercel env pull` (return blank) — add `--no-sensitive` if you need to verify.

### Database
- **Console:** Supabase → SQL Editor
- **Connection string:** `DATABASE_URL` in Vercel
- **Backups:** Nightly via GitHub Actions (db-backup.yml)
- **Migrations:** SQL files in `db/migrations/`. Apply DDL via Supabase SQL Editor, or pg client using `DATABASE_URL`

### Permission denied errors
**ALWAYS the same fix:** service_role missing GRANT.
Run in Supabase SQL editor:
```sql
GRANT ALL ON TABLE public."<table_name>" TO service_role;
```

Or apply catch-all:
```sql
\i service_role_grants.sql
```

This should be a one-shot fix. If error persists, a new table was created without ALTER DEFAULT PRIVILEGES inherit working — re-run service_role_grants.sql.

### Key rotation
Order of operations (do all in one ~15 min window):
1. Generate new key in source provider
2. Update Vercel env
3. Redeploy
4. Verify
5. Revoke old key in provider dashboard
6. Update local .env

### Migration rollback
Don't have a real migration tool yet, so rollbacks are by hand.

1. Identify most recent migration file applied (check applied migrations list)
2. Each migration file should have paired DOWN.sql inline as bottom comment
3. Test rollback on dev Supabase project FIRST, never on prod blind

---

## EMERGENCY PROCEDURES

### 1. "Bot went silent"
**Symptom:** Leads message in, no reply.

**Debug steps:**
1. Check if inbound even reached us:
   - Vercel → Logs → filter "/api/webhook"
   - Look for: 200 ok / 403 (auth header missing) / 500

2. If 403:
   - MSG91 dashboard → Webhook settings → confirm header
   - x-webhook-secret == process.env.MSG91_WEBHOOK_SECRET in Vercel

3. If 500:
   - Sentry → recent issues
   - Most likely culprits:
     - Supabase down (status.supabase.com)
     - GLM down → should auto-failover to Cerebras
     - Both down → bot sends polite canned fallback

4. If 200 but no outbound:
   - MSG91 dashboard → message log
   - Check delivery webhook status on /api/webhook/status (Vercel logs filter for [delivery-status])

### 2. "Razorpay charge failed / subscription stuck"
**Debug steps:**
1. Razorpay dashboard → Subscriptions → search by customer email
2. Status meanings:
   - active → all good
   - halted → 3 failed UPI debits in a row. Bot is auto-gated off (lib/webhook checks plan_status). Email customer.
   - cancelled → keep access until plan_expires_at, then auto-gate
   - pending → mandate not yet authorised. Resend Checkout link.

3. If charge succeeded in Razorpay but plan_expires_at didn't extend:
   - The razorpay-webhook didn't fire / signature failed
   - Check Vercel logs for "/api/razorpay-webhook" + Sentry
   - Verify webhook URL in Razorpay dashboard = https://convorian.in/api/razorpay-webhook and RAZORPAY_WEBHOOK_SECRET matches

### 3. "Photos not delivering"
**Debug steps:**
1. Check property has media in RIGHT column:
   - Supabase → properties → find row → look at property_media (NOT features). If media is in features, engine prompt won't see it. Fix: POST /api/admin/convert-media (CRON_SECRET header).

2. Check format. WhatsApp/Meta SILENTLY DROP avif/heic/webp/tiff. Only JPEG/PNG deliver. Edit property → re-upload as JPEG.

3. Check env flag actually has a value:
   - vercel env ls | grep MSG91_MEDIA_LIVE
   - Must be "true" (literal string). Empty = block won't run. Bug to remember: piped-stdin sets empty silently — always use --value "true".

4. Check delivery status:
   - Vercel logs filter [delivery-status]. If you see "failed" with Meta error code → look up the code, usually format / size / template issue.

### 4. "Migration rollback"
Don't have a real migration tool yet, so rollbacks are by hand.

1. Identify most recent migration file applied (check your applied migrations list)
2. Each migration file should have paired DOWN.sql inline as bottom comment. If it doesn't:
   - DROP TABLE / ALTER TABLE ... DROP COLUMN by hand based on UP
   - Or restore from nightly pg_dump artifact

3. Test rollback on dev Supabase project FIRST, never on prod blind.

### 5. Suspect breach / compromise
**Actions:**
1. **Rotate keys immediately** (Supabase service-role + anon, Razorpay, Resend, MSG91, GROQ/GLM, CRON_SECRET)
2. **Lock affected accounts** — set `bot_active=false`, disable users in Supabase Auth, force password reset
3. **Pull access logs** from Supabase + Vercel; check Sentry for anomalies
4. **Notify** affected agents (DPDP breach-notification duty). Grievance officer: **Shantanu** (support@convorian.in / +91 7559197426)
5. **Restore from latest clean backup** if data was tampered

### 6. Key rotation
Order of operations (do all in one ~15 min window):
1. Generate new key in source provider:
   - Supabase: Dashboard → API → roll SECRET key (sb_secret_...). Publishable (sb_publishable_) almost never needs rotation.
   - Razorpay: Settings → Keys → Generate new live key. Old keeps working for 24h grace.
   - Resend: API Keys → Create new → revoke old after step 3.
   - MSG91: Auth Keys → revoke + regenerate.
   - GLM/Cerebras: provider dashboard → regenerate.
2. Update Vercel env:
   ```bash
   vercel env rm NAME production --yes
   vercel env add NAME production --value "<new>" --yes
   ```
3. Redeploy
4. Verify
5. Revoke old key in provider dashboard
6. Update local .env

---

## CHANGE LOG

### 2026-07-11 (Current)
- **Consolidated single source of truth:** Merged all documentation into one comprehensive file
- **Committed and pushed:** All uncommitted changes committed and pushed to GitHub (commit `d94c063`)
- **Cleanup:** Removed obsolete documentation files, consolidated migration files into `db/migrations/` directory

### 2026-06-29 (Session 21)
- Cline (GLM) onboarded as junior developer
- Team roles defined: Claude (lead until July 6), Codex Plus (UI/tests), Cline (bot hardening)
- Created `DEVOPS.md` with team coordination, sprint plan, task board, git workflow, risk register
- Deep code review of bot architecture (12+ files)
- Confirmed `lib/ai-bot.ts` is only live engine
- Identified loose WIP on `main` → committing to branch

### 2026-06-27 (Fallback checkpoint)
- Branch `fallback/bot-working-2026-06-27` created pointing to commit `3c25bab00a9995f1971c2ae43013e7048c50d3c4`
- Known-good bot state preserved for rollback

### 2026-06-22 (Stable checkpoint)
- **Tag `stable-2026-06-22` pushed to GitHub**
- PRs #134–#137 merged + deployed:
  - Security Batch A (RLS policies, middleware gate + 2FA, delivery-status closed)
  - Free-forever tier (100-msg / 10-lead / 5-property, no time expiry)
  - Launch copy + admin analytics spec
  - P0 workspace takeover fix (server-side workspace creation)
- Meta App Review + Tech Provider APPROVED
- Embedded Signup (self-serve onboarding) BUILT
- Nurture Engine V1 data layer built

### 2026-06-24 (Session 17)
- Embedded Signup live (backend + frontend)
- Nurture Engine V1 — data foundation (migration 11, applied live):
  - Per-lead `personality` (silent profile)
  - `engagement` signals
  - `consent_tier`
  - `nurture_events` learning log
- **Fixed:** Reply-reset of nurture counters (dropped in ai-bot rewrite)
- **FIXED:** Named-date booking bug (prompt now injects today's date)
- **FIXED:** Template sending - named vars instead of positional
- 6 Meta templates approved + wired (EN only, hi/mr pending)
- 3 Meta templates approved for Plan A + D

### 2026-06-23 (Session 16)
- Stripped MSG91 from live bot path → Meta Cloud API only
- Webhook auth now verifies Meta `X-Hub-Signature-256`
- **PROVEN END-TO-END on Meta test number**
- Real number LIVE (`+91 7559197426`)
- Setup gotchas documented

### 2026-06-21 (Session 14)
- Migrated to Groq (llama-3.3-70b-versatile) + GLM fallback
- Hedged request system built
- Removed DeepSeek, Cerebras from live path

### 2026-06-15 (Session 11)
- Phase 1 completed: Property Matching (46/46 tests passing)
- Phase 2 completed: Lead Criteria Extraction (46/46 tests passing)

### 2026-06-04 (Original Request)
- Initial request to fix critical bugs, security gaps, and UI issues in LeadNest
- Requirements: Backend security, frontend fixes, comprehensive QA

---

## CONTACTS

**Founder / Grievance Officer:**
- Shantanu
- Email: support@convorian.in
- WhatsApp: +91 7559197426
- Superadmin alerts go to: support@convorian.in (+ WhatsApp 917559197426)

**Sentry:** org `covorian`, EU region
**BetterUptime:** monitoring at https://convorian.in

---

**END OF DOCUMENT**
