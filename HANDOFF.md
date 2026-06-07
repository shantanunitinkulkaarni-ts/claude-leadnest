# Convorian Project Handoff

*Last Updated: June 8, 2026 (late night)*

> **Brand:** LeadNest → **Convorian**. Domain **convorian.in** (GoDaddy). Single source of truth for the launch plan = `files/CONVORIAN_LAUNCH_BLUEPRINT.md`. Read memory files at `C:\Users\rahul\.claude\projects\C--LN\memory\` first.

---

## 🟢 Current State (what works)

- **App** runs locally on **port 3003** (`npm run dev`). Fully built: Overview, Inbox, Leads (Kanban), Properties, Appointments, ROI, Balance, Settings, Admin.
- **AI engine:** Groq (Llama 3.3 70B), free tier. File `lib/gemini.ts` (name kept). Has a `post_visit` stage that nurtures toward close using agent feedback.
- **Auth:** Supabase email/password. (Google OAuth broken — ignore.) The 403 "permission denied for table" bug was fixed via Postgres GRANTs.
- **Brand + theme:** fully rebranded to Convorian; indigo/violet theme (`#4F46E5`/`#7C3AED`) applied everywhere; glassmorphism landing page.
- **Landing page (Meta-ready):** polished, live AI chat demo (`components/LiveChatDemo.tsx`), `/privacy-policy` + `/terms-of-service` pages (render `files/*.md`), footer contact support@convorian.in. Waitlist disabled (redirects to /onboarding).
- **Razorpay:** real Checkout + server-side signature verification built (`app/api/payments/create-order`, `/verify`; `BalanceScreen.tsx`). TEST keys in `.env`. **Tested & working** (note: UPI QR shows "invalid" in test mode — that's expected; use `success@razorpay` UPI or test card).
- **Git:** all committed & pushed to `main`. Remote uses a workflow-scoped token.
- **AWS:** CLI configured (user `convorian-deploy`, acct 261955339877, us-east-1). ECR repo `convorian` created, image built & pushed, `AppRunnerECRAccessRole` created, 3 GitHub Actions secrets set, `deploy.yml` fixed to use `convorian`.

## 🔴 Blocked on 24-hour timers (should clear ~June 8–9)

1. **AWS account activation** (new-account banner). App Runner returns `SubscriptionRequiredException` until active. Once active → re-run the deploy workflow (or `gh workflow run`) → App Runner service comes up → get live URL.
2. **Meta business account cooldown** (user deleted one of two business profiles → 24h lock). After it clears → create FB Business Manager, submit **business verification using Udyam/MSME cert** (no Pvt Ltd/GST needed), set business name = Udyam name.

## ⏳ Pending — TOMORROW's plan (priority order)

1. **Deploy** to AWS App Runner once account active → confirm live URL works.
2. **DNS:** point `convorian.in` at App Runner via **GoDaddy** (keep DNS at GoDaddy so email stays intact; add CNAME for site, apex via forwarding). Do NOT move to Cloudflare (would break GoDaddy email).
3. **Meta:** create Business Manager → submit verification (Udyam + live convorian.in + privacy URL) → then wire `lib/whatsapp.ts` to **Meta Cloud API direct** (decided: NOT a BSP like MSG91). Per-client number onboarding will be hands-on.
4. **Razorpay:** switch to live keys when ready; add **webhook** (order.paid) for reliability; build **subscription billing** for ₹999/₹799 plans.
5. **SEO foundation:** sitemap.xml, robots.txt, JSON-LD (Organization/SoftwareApplication/FAQ), Search Console + GA4, 2-3 city landing pages (Pune/Mumbai/Bangalore), first 2 blog posts.
6. **Bot engine:** fine-tune the conversation engine AND **give the AI a good product name** (currently generic "Convorian Conversion Engine").
7. **Launch-readiness backlog:** password reset + email verification, real email notifications (Resend key in `.env`), error tracking (Sentry), data export, mobile responsiveness, support-chat RAG, WhatsApp consent tracking, pagination on leads list.

## 👤 User action items (Shantanu)

- Set up **support@convorian.in** mailbox in GoDaddy Email (+ aliases privacy@/legal@ → support@).
- **Free the WhatsApp number** from consumer WhatsApp (it's on a separate phone) before Meta onboarding.
- **Security cleanup after deploy confirmed:** delete/rotate the `convorian-deploy` AWS key and the old GitHub PAT (both appeared in chat).
- Start **pre-selling the warm network now** (target: 10 clients / ₹10k in July; gate is Meta timing, not sales).

## 📌 Key decisions / facts

- Entity: **individual / sole proprietor** (no GST until ~₹20L). Razorpay onboarded as individual.
- Pricing: **₹999/mo, ₹799/mo annual** — intro for first 20–30 clients, raise after.
- WhatsApp: **Meta Cloud API direct** (MSG91/BSP rejected — still needs Meta verification + adds markup).
- Stack: Next.js 14 · Supabase · Groq · AWS App Runner · Razorpay · Resend.
- **Launch readiness ≈ 65%.** Product is the done part; remaining 35% is plumbing + Meta approval (the long pole). Realistic: soft-launch ~2–4 days post-Meta; 30 paying clients ~6–10 weeks of founder-led sales.

## ⚠️ Gotchas

- `.env` changes need a **dev server restart** (Next loads env at startup).
- "permission denied for table X" = missing Postgres **GRANT**, not RLS (see memory `project_leadnest_grants.md`).
- `lib/gemini.ts` is Groq now, not Gemini (filename kept).
- App modals use z-index 100–200; tutorial action-steps sit below them intentionally.
- Pushing workflow files needs a token with `workflow` scope.
