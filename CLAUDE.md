# LeadNest — Claude Code Briefing

## What is this
AI-powered WhatsApp lead nurturing SaaS for Indian real estate agents.
Agents pay ₹999/month, connect their WhatsApp, and the bot qualifies leads, books site visits, tracks ROI — automatically.

## Owner
Shantanu (non-developer founder). You are the sole developer. No other devs.
Be autonomous. Fix issues without asking permission for small things.
Always test build before pushing: `npm run build`

## Live URLs
- Production: https://leadnest-629032564012.us-central1.run.app
- GitHub: https://github.com/shantanunitinkulkaarni-ts/claude-leadnest
- Supabase: https://hinqahjhtgsmljrrozql.supabase.co

## Tech Stack
- Framework: Next.js 14 App Router, TypeScript
- Database: Supabase (PostgreSQL)
- Bot Brain: Gemini 1.5 Flash via Google Vertex AI
- Auth: Supabase Auth (Google + email + phone)
- Hosting: Google Cloud Run
- CI/CD: GitHub Actions (.github/workflows/deploy.yml)

## GCP Details
- Project ID: gen-lang-client-0794202345
- Cloud Run service: leadnest
- Region: us-central1
- Vertex AI region: us-east5
- Service account: leadnest-vercel@gen-lang-client-0794202345.iam.gserviceaccount.com

## Deploy command (run after pushing to GitHub)
```bash
gcloud builds submit --tag gcr.io/gen-lang-client-0794202345/leadnest \
  --service-account=projects/gen-lang-client-0794202345/serviceAccounts/leadnest-vercel@gen-lang-client-0794202345.iam.gserviceaccount.com \
  --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET .

gcloud run deploy leadnest \
  --image gcr.io/gen-lang-client-0794202345/leadnest \
  --platform managed --region us-central1 --allow-unauthenticated --port 8080
```

## App Theme (NEVER deviate from this)
- Background: #FAFAF7 (warm off-white)
- Cards: #FFFFFF with border #E8E5DF
- Primary: #2E8B5F (green) / #1A6B4A (dark green)
- Green light: #EBF5EE
- Text: #1A1916 (near black) / #6B6860 (muted)
- Gold accent: #B8955A
- Sidebar ONLY is dark: #1A1916
- Font: DM Sans

## Key Files
- `lib/gemini.ts` — Bot brain / Conversion Engine (main AI logic)
- `lib/supabase.ts` — Database client (lazy init pattern, don't change)
- `lib/claude.ts` — Claude API client (via aicredits.in proxy)
- `lib/whatsapp.ts` — WhatsApp/Twilio sender
- `app/api/webhook/route.ts` — Incoming WhatsApp messages
- `app/api/roi/route.ts` — ROI analytics engine
- `app/waitlist/page.tsx` + `waitlist.css` — Public waitlist/landing page
- `app/dashboard/page.tsx` — Main dashboard
- `components/screens/` — All dashboard screens

## Database Tables
agents, leads, messages, properties, appointments, wa_transactions, activity_log, waitlist

## Test Agent
ID: `test-agent-001` (seeded in Supabase)
Email: demo@leadnest.in

## Pending Tasks (do these in order)
1. Fix build error: `@google/generative-ai` missing — already replaced by `@google-cloud/vertexai`, check for stale imports
2. Wire ROI screen into sidebar — replace Analytics tab with ROI & Analytics, import ROIScreen from `components/screens/ROIScreen.tsx`
3. Root route fix — `app/page.tsx` should redirect logged-in users to `/dashboard`, logged-out to `/waitlist`
4. Add waitlist table to Supabase — run: `CREATE TABLE IF NOT EXISTS waitlist (id uuid default gen_random_uuid() primary key, name text, email text unique, phone text, agency_name text, current_crm text, pain_points text, created_at timestamptz default now());`
5. Demo chat API — `app/api/demo-chat/route.ts` exists, verify it works end-to-end with Gemini
6. Test full flow on localhost before deploying

## Important Rules
- ALWAYS run `npm run build` before pushing — build must pass clean
- NEVER expose API keys or secrets in client-side code
- NEVER use localStorage (not supported in artifacts)
- All API routes must have `export const dynamic = "force-dynamic"` at top
- Supabase client uses lazy init — never call createClient() at module level
- Keep all pages on light theme (#FAFAF7) — only sidebar is dark
- Bot model is Gemini via Vertex AI — do not switch to anything else without asking
- Push to GitHub only — GitHub Actions handles deployment automatically

## Business Context (important for feature decisions)
- Competitors: Wise Parrot (₹5K/month), Wati, Interakt
- Our edge: AI conversion engine with sales psychology, ROI dashboard, ₹999/month
- Target: Indian real estate agents, Pune/Mumbai/Bangalore first
- Revenue model: ₹999/month base + message add-ons
- Currently pre-revenue, building toward first 10 paying clients

## Common Issues & Fixes
- Build fails with "supabaseUrl required": add `export const dynamic = "force-dynamic"` to the route
- Vertex AI auth fails: check GOOGLE_CREDENTIALS_JSON env var in Cloud Run
- WhatsApp webhook not receiving: check WHATSAPP_PROVIDER env var (twilio or meta)
- Port issues on Cloud Run: always use PORT 8080, ENV PORT=8080
