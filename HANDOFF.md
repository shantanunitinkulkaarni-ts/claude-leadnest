# Convorian Project Handoff

*Last Updated: June 8, 2026 (evening)*

> **Brand:** Convorian (was LeadNest). **Live at https://convorian.in** (Vercel). Domain on GoDaddy. Single source of truth for launch plan = `files/CONVORIAN_LAUNCH_BLUEPRINT.md`. Read memory at `C:\Users\rahul\.claude\projects\C--LN\memory\` first.

---

## 🟢 LIVE NOW

- **Site:** https://convorian.in — Convorian, indigo theme, glassmorphism. Pages: home, /login, /onboarding, /privacy-policy, /terms-of-service. SSL working.
- **Hosting:** **Vercel** (project `claude-leadnest`, team `team_fzgmEXAaGXYbDzbWWLQAumJl`, project id `prj_XeAX3KOfjGzNYS1lofHyRUpYhF08`). NOTE: Vercel git auto-deploy is broken (disconnected since May) → **deploy via CLI**: `vercel deploy --prod --yes --token <TOKEN>` from repo (env VERCEL_ORG_ID + VERCEL_PROJECT_ID set). All 17+ env vars set in Vercel (production).
- **DNS:** convorian.in → A `@` 76.76.21.21, CNAME `www` cname.vercel-dns.com (GoDaddy). Email MX untouched.
- **AI:** Groq (Llama 3.3 70B). **WhatsApp provider = meta** (env `WHATSAPP_PROVIDER=meta`).
- **Payments:** Razorpay **LIVE keys** in Vercel Production (set by founder directly; not in chat/repo). Local `.env` keeps TEST keys. Real Checkout + signature verification built (`app/api/payments/*`, BalanceScreen).
- **WhatsApp bot:** WORKING end-to-end on Meta Cloud API **test number**. Founder messages test number → webhook → Groq → bot replies on real WhatsApp. ✅

## ✅ Meta status (in progress)
- **Business verification: DONE** (Convorian, via Udyam/MSME — individual/sole-prop, no GST/Pvt Ltd).
- **Meta App created** (Business type), connected to verified Convorian business. Platform = Website (convorian.in).
- **WhatsApp test number wired:** Phone Number ID `1151131814750562`, WABA ID `2471962009909005`. Set on demo agent in DB (`wa_phone_number_id`, `wa_access_token`, `wa_verified=true`).
- **Webhook:** `https://convorian.in/api/webhook`, verify token `leadnest_webhook_verify_2026`, subscribed to `messages`.
- **App Review submitted/in-progress** for `whatsapp_business_messaging` + `whatsapp_business_management`:
  - Video 1 (bot send/receive) ✅ recorded
  - Video 2 (template create via API, returned PENDING) ✅ recorded
  - Test calls: messaging registered (1/1); management pending (≤24h to show)
  - Data-handling answers, testing instructions, platform = Website all filled.
- **Tech Provider verification:** submitted, ~5 day review (needed for clients to self-connect their own numbers via embedded signup; deadline shown 8/7/2026).

## 🔑 Demo / test account (also given to Razorpay reviewers)
- https://convorian.in/login · `demo@convorian.in` / `ConvorianDemo@2026`
- This agent holds the WhatsApp test-number config + sample leads/properties.

## ⏳ PENDING / NEXT
1. **PERMANENT WhatsApp token** — temp token expires ~24h → bot stops. Create System User token (Business Settings → System Users → generate token with whatsapp_business_messaging + whatsapp_business_management) → update demo agent `wa_access_token` via Supabase SQL.
2. **App Review result** — wait for management test call to register (≤24h) → submit if not already → Meta reviews few days.
3. **Tech Provider review** (~5 days).
4. **Razorpay** — confirm live activation approved; do one real ₹100 top-up test; add webhook + subscription billing later.
5. **Per-client WhatsApp onboarding** (embedded signup) — after Tech Provider approved.
6. **Logo** — founder creating via Gemini (prompt given); needed for app icon (1024x1024) + website.
7. **Permanent token + then** restore frequent cron (currently daily for Vercel Hobby), or move cron to external scheduler / Vercel Pro.
8. Launch hardening backlog (password reset, email notifications, error tracking, consent tracking, mobile responsive, support RAG).

## 👤 Founder action items
- Recharge/sort a clean **WhatsApp number** for production (current personal SIM was flaky; test number used for now).
- Set up **support@convorian.in** mailbox fully (GoDaddy).
- **Security cleanup:** rotate/delete the AWS key, GitHub tokens, and Vercel token that appeared in chat once stable.
- Pre-sell warm network (target 10 clients / ₹10k in July).

## 📌 Key facts / decisions
- Entity: individual/sole-proprietor (no GST). Pricing ₹999/mo, ₹799/yr (intro, first 20-30 clients).
- WhatsApp: **Meta Cloud API direct** as a **Tech Provider** (clients connect own numbers; not a reseller/BSP). We're in the Wati/Interakt category but niche (real estate) + AI-led.
- Stack: Next.js 14 · Supabase · Groq · **Vercel** · Razorpay · Resend · Meta WhatsApp Cloud API.
- AWS App Runner was set up but **abandoned for Vercel** (AWS account stuck in 24h activation; Vercel simpler). AWS deploy workflow is manual-only now.

## ⚠️ Gotchas
- `.env` changes need redeploy. Vercel env changes need redeploy (CLI).
- "permission denied for table" = missing Postgres GRANT, not RLS.
- `lib/gemini.ts` = Groq now (filename kept). `lib/whatsapp.ts` already supports Meta + Twilio.
- Vercel Hobby plan: cron max once/day (set to `0 9 * * *`); deployment protection was on (`all_except_custom_domains`) — disabled.
- Pushing workflow files needs a `workflow`-scope GitHub token.
- Don't SELECT `wa_access_token` in queries (safety classifier blocks secret reads).
