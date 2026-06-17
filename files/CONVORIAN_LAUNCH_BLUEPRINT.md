# CONVORIAN — Complete Launch Blueprint
### CTO Master Document | Version 1.0
*Owner: Shantanu Kulkaarni | Prepared by: Claude (CTO)*
*Last Updated: June 2026*

---

> This document is the single source of truth for everything required to launch Convorian as a production-grade, enterprise-level SaaS platform. It covers legal, technical, financial, security, marketing, operations, and risk — nothing is skipped. Claude Code should read this document and execute tasks in order of priority.

---

## CURRENT STATE (as of June 2026) — READ FIRST

- **Brand:** renamed LeadNest → **Convorian**. Domain: **convorian.in** (registered). Code rebrand still pending.
- **AI:** **Groq — Llama 3.3 70B** (free tier). Not Gemini/Vertex anymore.
- **Hosting:** moving to **AWS App Runner** (region us-east-1, account 261955339877). The old GCP project was suspended.
- **Payments:** Razorpay **active** via individual (sole-proprietor) onboarding — can accept payments. Test + live keys exist. App integration pending (BalanceScreen still simulated; a PAN-data correction is being processed).
- **Entity:** operating as an **individual / sole proprietor** for now (no GST until ~₹20L turnover). Pvt Ltd is a later step.
- **Pricing:** **₹999/mo, ₹799/mo (annual)** — intro pricing for the first 20–30 clients to validate stability + business; raise afterwards.
- **WhatsApp:** Twilio Sandbox now; Meta Business API pending (needs business verification; domain now available).

> Where any later section conflicts with this block or a dated note, THIS block is correct. The rest is the longer-term plan.

---

## TABLE OF CONTENTS

1. Product & App Readiness
2. Legal & Compliance
3. Security & Data Protection
4. Privacy, Consent & WhatsApp Compliance
5. Business & Financial Infrastructure
6. Billing, Pricing & Profitability
7. Support, Disputes & Refunds
8. Testing & QA Framework
9. DNS, Infrastructure & Go-Live
10. Marketing & GTM Strategy
11. SEO & Organic Growth
12. Email Infrastructure
13. WhatsApp Marketing
14. Free Trial & Onboarding Strategy
15. AI Engine — Proprietary Development
16. Post-Launch Operations
17. Risk Register
18. Master Task Checklist

---

## 1. PRODUCT & APP READINESS

### Core App Status
- Platform: Next.js 14, Supabase (Postgres), **Groq — Llama 3.3 70B** (free tier), deploying to **AWS App Runner**
- AWS: account 261955339877, region us-east-1 (GitHub Actions → ECR → App Runner workflow ready; IAM role + GitHub secrets pending)
- URL: local dev on :3003; production at **convorian.in** post-DNS
- WhatsApp: Twilio Sandbox now → migrate to Meta Business API (blocked on business verification; domain convorian.in now available)

### Known Issues for Code to Fix
1. ~~Gemini model name~~ — **DONE:** migrated to Groq Llama 3.3 70B (lib/gemini.ts; filename kept)
2. ~~Demo-chat simulation broken~~ — **DONE:** works; moved to landing page as `<LiveChatDemo />`. Will be removed once Meta API is live so we can test the real thing.
3. Dashboard UI polish — **largely DONE** (Inbox, Leads, Properties, Appointments, ROI, Settings overhauled)
4. **Rebrand LeadNest → Convorian everywhere** — PENDING (brand name + new colour theme)

### Pages Required Before Launch
- [ ] Landing page live at convorian.in
- [ ] /privacy-policy
- [ ] /terms-of-service
- [ ] /refund-policy
- [ ] /cookie-policy
- [ ] /about
- [ ] /contact
- [ ] /pricing
- [ ] /blog (for SEO — can be empty at launch, add content weekly)

---

## 2. LEGAL & COMPLIANCE

### Business Entity (India)
**Current:** Operating as an **individual / sole proprietor** (founder's PAN). No company registration yet — deliberate choice to launch fast on minimal budget. Razorpay individual onboarding is done and live.

**Future (when revenue/scale justifies):** Register as a **Private Limited Company** (Pvt Ltd) for liability protection, fundraising, credibility, and easier Meta Business verification.
- Register via MCA (mca.gov.in); ~₹10,000–15,000 via a CA / Razorpay Rize; 7–15 working days; needs PAN, Aadhaar, address proof, DSC.
- Meta WhatsApp verification is generally smoother with a registered entity — revisit before Meta onboarding.

**Already have:** Udyam Registration (MSME) — useful for Meta verification.

### GST Registration
- **Not required yet** — mandatory only once service turnover crosses ₹20 lakh/year (₹10L in some states). We are below this at launch.
- Razorpay individual onboarding did NOT require GST.
- Once registered: SaaS is taxed at 18% GST; invoices need GSTIN; file GSTR-1 and GSTR-3B monthly.
- Revisit when nearing the threshold or when registering Pvt Ltd.

### CA (Chartered Accountant)
- Hire a CA before first rupee comes in
- They handle: GST filing, TDS, income tax, annual returns, payroll (when applicable)
- Cost: ₹3,000–8,000/month for a startup CA
- Platforms: Cleartax, LegalDesk, or local CA referral

### Taxation
- Income Tax: File ITR annually. Startup tax exemptions available under Section 80-IAC
- TDS: Deduct TDS on contractor/vendor payments above threshold
- Advance Tax: Pay quarterly if annual tax liability exceeds ₹10,000
- International clients: GST rules differ — consult CA

### Banking
- **Now:** Razorpay settlements go to the founder's bank account (individual). A dedicated **Current Account** is recommended but not required for individual onboarding — open one when convenient / on Pvt Ltd registration.
- Recommended banks for a current account later: HDFC, ICICI, or Kotak.
- Best practice even as an individual: keep a separate account for business inflows/outflows.

### Invoicing
- Use invoicing software: Zoho Books, Razorpay invoicing, or Vyapar
- Every payment must have a proper GST invoice
- Invoice must include: GSTIN, HSN/SAC code (SAC 998314 for SaaS), company address, payment terms

### Contracts & NDAs
Required documents:
1. **Terms of Service** — governs use of platform (see Section 3)
2. **Privacy Policy** — data handling (see Section 4)
3. **Data Processing Agreement (DPA)** — for enterprise clients who ask
4. **NDA Template** — for partnerships, enterprise deals, employees
5. **Employee/Contractor Agreement** — for anyone you hire
6. **Vendor Agreement** — for third-party service providers

### DPDP Act Compliance (India)
- Digital Personal Data Protection Act 2023 — India's equivalent of GDPR
- Convorian handles personal data (names, phone numbers, conversation history)
- Requirements:
  - Appoint a Data Protection Officer (can be you initially)
  - Collect only data necessary for the service
  - Provide users right to access, correct, and delete their data
  - Implement data breach notification process (notify within 72 hours)
  - Maintain data processing records
- Action: Add data deletion request form in agent dashboard settings

### IT Act 2000 (India)
- Convorian must comply with Section 43A — reasonable security practices
- Section 72A — punishment for disclosure of information in breach of lawful contract
- Intermediary Guidelines 2021 — as a platform carrying user messages

---

## 3. SECURITY & DATA PROTECTION

### Authentication & Access
- [ ] Supabase Auth with Row Level Security (RLS) — already implemented
- [ ] Enforce strong password policy
- [ ] Add 2FA (Two-Factor Authentication) for agent logins — use Supabase TOTP
- [ ] API key rotation schedule — rotate every 90 days
- [ ] Rate limiting on all API endpoints — prevent brute force
- [ ] Session timeout after inactivity (30 minutes recommended)

### Infrastructure Security
- [ ] All environment variables in AWS Secrets Manager / App Runner config — never in code
- [ ] HTTPS enforced everywhere — SSL via App Runner managed cert or Cloudflare
- [ ] WAF for DDoS protection — Cloudflare (free tier) or AWS WAF
- [ ] Enable VPC (Virtual Private Cloud) for database access — Supabase already does this
- [ ] Regular automated backups — Supabase daily backups, enable point-in-time recovery
- [ ] Separate environments: Development, Staging, Production — never test on production

### Application Security
- [ ] Input validation on all forms — prevent SQL injection, XSS
- [ ] CSRF protection — Next.js handles most, verify API routes
- [ ] Helmet.js headers — security headers on all responses
- [ ] Dependency scanning — use Dependabot or Snyk to catch vulnerable packages
- [ ] No sensitive data in logs — mask phone numbers, API keys in logs
- [ ] Webhook signature verification — verify Twilio/Meta webhook signatures

### Data Security
- [ ] Encrypt sensitive fields at rest — WhatsApp access tokens, API keys in DB
- [ ] Lead data is tenant-isolated — RLS ensures agents only see their own data
- [ ] Data retention policy — define how long conversation data is kept (recommend 2 years)
- [ ] Right to erasure — agent can request full data deletion
- [ ] Backup encryption — ensure backups are encrypted

### Penetration Testing
- Before launch: Run basic security scan using OWASP ZAP (free tool)
- Every 6 months: Professional pen test once revenue allows
- Bug bounty program: Consider after launch — invite security researchers

### Incident Response Plan
If a breach occurs:
1. Immediately isolate affected systems
2. Notify affected agents within 72 hours (DPDP requirement)
3. Document what happened, what data was accessed
4. Fix vulnerability
5. Post-mortem report
6. Notify CERT-In (Indian Computer Emergency Response Team) if significant

---

## 4. PRIVACY, CONSENT & WHATSAPP COMPLIANCE

### Privacy Policy Must Cover
- What data is collected (agent data, lead data, conversation data)
- Why it is collected (service delivery, analytics, improvement)
- How it is stored (Supabase, AWS — both with encryption)
- Who it is shared with (Twilio/Meta for WhatsApp, Google for AI)
- How long it is kept
- User rights (access, correction, deletion)
- Cookie usage
- Contact for privacy concerns

### WhatsApp Compliance (Critical)
Meta has strict policies. Violating them = account banned.

**Opt-in Requirements:**
- Leads must have opted in to receive WhatsApp messages from the agent's business
- Opt-in must be explicit — a checkbox on a form, not pre-ticked
- Keep records of opt-in (timestamp, source, method)
- Never message someone who has not opted in

**Message Content Rules:**
- No misleading content
- No spam — respect frequency limits
- Must identify the business name
- Must provide a way to opt out (reply STOP)
- Convorian must enforce these rules in its Terms of Service with agents

**Template Message Rules:**
- All outbound templates must be approved by Meta before use
- Templates cannot be promotional without explicit opt-in
- Keep template library: appointment reminders, follow-ups, re-engagement

**Agent Responsibility:**
- Convorian is the platform — agents are responsible for their own compliance
- This must be stated clearly in Terms of Service
- Add: "By using Convorian, you agree to obtain proper consent before messaging any lead"

### Cookie Consent
- Add cookie consent banner to landing page
- Use: Cookieyes (free tier available) or build simple banner
- Categories: Necessary, Analytics, Marketing
- Store consent records

### Email Marketing Consent
- Never send marketing emails without explicit opt-in
- Use double opt-in for newsletter/waitlist
- Every email must have unsubscribe link
- CAN-SPAM / GDPR basics — even for Indian companies with global users

---

## 5. BUSINESS & FINANCIAL INFRASTRUCTURE

### Banking Setup
- [x] Razorpay linked to founder's bank account (individual onboarding — live)
- [ ] Current account in Convorian Pvt Ltd name (later, once registered)
- [ ] Internet banking with NEFT/IMPS/RTGS enabled
- [ ] Separate buffer — keep ~3 months operating costs aside

### Razorpay Setup
- [x] Account **active** — individual onboarding complete; test + live keys available; can accept payments
- [ ] PAN data correction (old PAN was used; edit request submitted — verify before going live)
- [ ] Wire real Razorpay Checkout into app (BalanceScreen is still a simulated top-up)
- [ ] Server-side order creation + **payment signature verification** (security-critical)
- [ ] Enable Subscriptions for monthly/annual plans
- [ ] Enable webhook for payment success/failure → credit wa_balance / log wa_transactions
- [ ] Automatic invoice generation; International payments (future)

### Financial Controls
- Monthly bookkeeping — every expense logged
- Separate categories: Infrastructure, Marketing, Salaries, Legal, Misc
- Monthly P&L review — even if small
- Quarterly CA review

### Funding & Runway
- Calculate monthly burn rate: AWS + Supabase + domains + tools + CA + misc
- Estimate: ~₹15,000–25,000/month initially
- Target: Break even at 10–15 paying agents
- Bootstrap first — no funding needed at this stage

---

## 6. BILLING, PRICING & PROFITABILITY

### Current Cost Structure (Monthly Estimates)
| Service | Cost |
|---|---|
| AWS App Runner | ~₹1,500–4,000 (scales with usage) |
| Supabase | Free tier now; Pro ~₹1,700/mo ($20) when needed |
| Groq (Llama 3.3 70B) | Free tier now; paid is pay-per-token (cheap) when scaling |
| Twilio/Meta WhatsApp | ₹0.20–0.50 per conversation |
| Domain (convorian.in) + Email | ~₹300–500/month |
| Resend (email) | Free up to 3,000/month |
| **Total base** | **~₹2,000–6,000/month at start** |

### Pricing — CURRENT (Launch / Intro)
**Intro pricing for the first 20–30 clients** — to get early revenue, validate app stability, and prove the business. Raise after this cohort.

**Monthly — ₹999/month**
- 5,000 messages/month, unlimited leads, AI bot 24/7, site-visit booking, ROI dashboard, priority support

**Annual — ₹799/month** (billed yearly)
- Everything in monthly + early access to new features

Extra WhatsApp messages via `wa_balance` top-ups (see below). Both plans are already live in-app.

### Pricing — FUTURE (post-validation, indicative)
Once stable with paying clients, move to tiered plans (final numbers TBD), e.g.:
- Starter ~₹2,999 (500 leads / 2,000 msgs / 1 user)
- Growth ~₹5,999 (2,000 leads / 8,000 msgs / 3 users / priority)
- Pro ~₹9,999 (unlimited / 20,000 msgs / 5 users / white-label)
Raise prices only with clear value + retention data.

### Profitability
- Base costs at start are low (~₹2,000–6,000/mo). Even at ₹999, ~10–15 paying clients comfortably cover costs.
- Gross margin is high (SaaS). Intro pricing is about validation, not maximising margin yet.

### Recommendation
**Launch monthly + annual together now** (both live at ₹999 / ₹799). Increase pricing after the first 20–30 clients.

### WhatsApp Message Billing to Agents
- Charge agents per message via wa_balance (already in schema)
- Top-up model: agent buys ₹500, ₹1,000, ₹2,000 credits
- Your cost: ~₹0.25/message. Charge: ₹0.50/message = 100% margin on messages
- This is a recurring revenue stream beyond subscriptions

---

## 7. SUPPORT, DISPUTES & REFUNDS

### Support Infrastructure
**Tier 1 — Self Service**
- Help documentation / FAQ at help.convorian.in (use Notion or GitBook, free)
- In-app tutorial walkthrough (already built — TutorialWalkthrough.tsx)
- Video walkthroughs on YouTube (record 3-5 short videos at launch)

**Tier 2 — Chat Support**
- WhatsApp support number (use a separate number)
- Response SLA: within 4 hours on business days
- Use the SupportChat component already in the app

**Tier 3 — Email Support**
- support@convorian.in
- Ticketing: Use Freshdesk (free up to 2 agents) or Zoho Desk

### Refund Policy
**Standard Policy:**
- 7-day money back guarantee for first-time subscribers — no questions asked
- After 7 days: No refunds for monthly plans (service already rendered)
- Annual plans: Pro-rated refund for remaining months if requested within 30 days
- WhatsApp credits: Non-refundable once used, refundable if unused and account closed

**Dispute Handling Process:**
1. Agent raises dispute via email or in-app
2. Acknowledge within 24 hours
3. Investigate within 48 hours
4. Resolve within 7 business days
5. If unresolved — escalate to Razorpay dispute process
6. Document every dispute — learn from patterns

### Data Loss Policy
- Daily automated backups via Supabase
- Point-in-time recovery available on Supabase Pro
- If data loss occurs due to Convorian's fault:
  - Restore from backup within 24 hours
  - Compensate with free months of service
  - Written incident report to affected agent
- If loss due to agent error: Best effort recovery, no guarantee

### Data Theft Accusation Response
If an agent accuses Convorian of data theft:
1. Take it seriously — respond in writing within 24 hours
2. Provide full audit log of who accessed their data
3. Supabase RLS ensures data isolation — document this
4. Engage lawyer if formal accusation
5. Never access agent data without their consent except for:
   - Technical support when explicitly requested
   - Legal compliance
   - Security incident response
- Add this explicitly to Terms of Service

### Account Breaks on Annual Plan
Scenario: Agent paid annual, app breaks for them, cannot fix in time.
Policy:
1. Acknowledge within 4 hours
2. Daily status updates
3. If unresolved in 7 days: Pro-rated refund for remaining period
4. Or: Extend subscription by double the downtime period
5. Keep this in Terms of Service

---

## 8. TESTING & QA FRAMEWORK

### Pre-Launch Testing Checklist (for Claude Code)

**Functional Testing**
- [ ] New agent registration → email verification → onboarding flow
- [ ] Agent adds lead manually
- [ ] WhatsApp message received → bot responds correctly
- [ ] Lead score updates after conversation
- [ ] Appointment booked via bot → appears in dashboard
- [ ] Cron job fires reminders correctly
- [ ] Demo-chat simulation works end to end
- [ ] Analytics data populates correctly
- [ ] ROI calculator shows correct figures
- [ ] Agent settings save and persist
- [ ] Superadmin can view all agents

**Performance Testing**
- [ ] Page load time under 3 seconds on mobile
- [ ] API response time under 500ms for common endpoints
- [ ] Webhook processes incoming message in under 2 seconds
- [ ] Dashboard loads with 100+ leads without lag

**Security Testing**
- [ ] Agent A cannot see Agent B's leads (RLS test)
- [ ] Unauthenticated requests return 401
- [ ] SQL injection attempt on search fields
- [ ] XSS attempt in message content
- [ ] Rate limiting triggers correctly

**Mobile Testing**
- [ ] Dashboard usable on mobile (responsive)
- [ ] Landing page perfect on mobile
- [ ] Onboarding flow works on mobile

**Browser Testing**
- [ ] Chrome, Safari, Firefox, Edge
- [ ] iOS Safari, Android Chrome

**Load Testing**
- [ ] Simulate 50 concurrent users
- [ ] 100 simultaneous webhook calls
- Tool: k6 (free, open source)

### Staging Environment
- Create a staging URL: staging.convorian.in
- Deploy to staging first — test — then deploy to production
- Never test on production with real agent data

### Bug Tracking
- Use GitHub Issues (already have repo)
- Labels: critical, high, medium, low
- Critical bugs block launch — fix before go-live
- High bugs fix within 48 hours of launch

---

## 9. DNS, INFRASTRUCTURE & GO-LIVE

### DNS Configuration (domain: convorian.in)
- Point **convorian.in** to the AWS App Runner service. App Runner gives a default `*.awsapprunner.com` URL; add a custom domain in App Runner and it returns the exact DNS records (CNAME/validation) to add at the registrar/Cloudflare.
- Pick www vs non-www and redirect one to the other
- Add MX records for business email (Google Workspace / Zoho Mail)
- Add SPF, DKIM, DMARC for email deliverability
- SSL: App Runner provisions a managed cert for the custom domain (or terminate at Cloudflare)
- TTL: 300 during migration, raise to 3600 once stable

### Cloudflare (Recommended)
- Add convorian.in to Cloudflare (free tier): DDoS protection, CDN, SSL, analytics
- Enable: "Always use HTTPS", "Auto minify", "Brotli compression"

### AWS App Runner Configuration
- Account 261955339877, region us-east-1
- Min instances 1 (avoid cold starts); max per budget (start ~5)
- CPU 0.25 vCPU / 0.5 GB to start (matches the GitHub Actions workflow); scale up as needed
- Env vars in App Runner config / AWS Secrets Manager — never in code

### Monitoring & Alerts
- AWS CloudWatch — set up alerts for:
  - Error rate > 1%
  - Latency > 2 seconds
  - Instance CPU > 80%
- Uptime monitoring: UptimeRobot (free) — get SMS alert if site goes down
- Error tracking: Sentry (free tier) — captures frontend and backend errors

### Backup & Recovery
- Supabase: Enable Point-in-Time Recovery
- Code: GitHub is your code backup — always
- Environment variables: Store in AWS Secrets Manager AND a secure offline copy

---

## 10. MARKETING & GTM STRATEGY

### Target Customer (ICP — Ideal Customer Profile)
- **Primary:** Individual real estate agents, 5+ years experience, owns a smartphone, has 50+ leads to manage
- **Secondary:** Small real estate agencies (2–10 agents), education institutes, insurance agents, car dealers
- **Geography:** Tier 1 and Tier 2 Indian cities — Mumbai, Pune, Bangalore, Hyderabad, Delhi NCR, Ahmedabad
- **Pain point:** Losing deals because follow-up is inconsistent or manual

### Go-To-Market — Phase 1 (Launch, Month 1–3)

**Channel 1: Direct WhatsApp Outreach**
- Build a list of 500 real estate agents from MagicBricks, 99acres, Housing.com listings
- Send personalised WhatsApp message introducing Convorian
- Offer free demo / free trial
- Legal: Must have a legitimate reason to contact — use public listings

**Channel 2: Real Estate Facebook & WhatsApp Groups**
- India has thousands of active real estate agent groups
- Join, provide value, then introduce Convorian
- Do not spam — be genuinely helpful first

**Channel 3: YouTube / Instagram Reels**
- Create 60-second problem-solution videos
- "Are you losing leads because you can't follow up fast enough?"
- Show the bot in action — real demo
- Post 3x per week on Instagram, 1x per week on YouTube

**Channel 4: Cold Email to Agencies**
- Scrape agency emails from JustDial, Sulekha, Google Maps
- Send personalised cold emails with ROI calculator
- Tool: Apollo.io or Hunter.io for email finding

**Channel 5: Referral Program**
- Existing agents refer new agents → 1 month free for both
- Build into the app

### GTM — Phase 2 (Month 4–6)
- Expand to insurance, education, automotive verticals
- Partner with real estate training institutes
- LinkedIn outreach to agency owners
- Google Ads (search) for "WhatsApp CRM for real estate India"

### Marketing Legalities
- TRAI regulations: Commercial messages require DLT registration
- WhatsApp marketing: Only to opted-in users
- Email marketing: CAN-SPAM + India IT Rules compliance
- No false claims in ads — "guaranteed results" is not allowed

---

## 11. SEO & ORGANIC GROWTH

### Target Keywords
- "WhatsApp CRM for real estate agents India"
- "AI lead nurturing real estate India"
- "Automatic follow up WhatsApp real estate"
- "Real estate CRM India affordable"
- "Lead management software real estate agents"

### SEO Setup (for Claude Code)
- [ ] Add meta titles and descriptions to all pages
- [ ] Add Open Graph tags for social sharing
- [ ] Submit sitemap to Google Search Console
- [ ] Submit to Bing Webmaster Tools
- [ ] Add structured data (JSON-LD) for business
- [ ] Page speed optimisation — Core Web Vitals
- [ ] Mobile-first design confirmed

### Content Strategy
- Blog: 2 posts per week minimum
- Topic ideas:
  - "How to never lose a real estate lead again"
  - "WhatsApp follow up templates for real estate agents"
  - "How AI is changing real estate sales in India"
  - "5 reasons real estate agents lose deals after first contact"
- Each post targets one keyword
- Posts should be 800–1500 words

### Full Funnel
Search → Landing page → Free trial signup → Onboarding → First lead added → Bot responds → Value experienced → Paid conversion → Monthly billing → Upsell to higher plan → Referral

### Backlink Strategy
- Guest posts on real estate blogs
- Get listed on: G2, Capterra, SoftwareSuggest, ProductHunt
- Press release to YourStory, Inc42 at launch

---

## 12. EMAIL INFRASTRUCTURE

### Transactional Emails (using Resend — already configured)
- Welcome email on signup
- Email verification
- Onboarding sequence (Day 1, Day 3, Day 7)
- Appointment reminder notifications
- Payment confirmation
- Invoice delivery
- Password reset
- Account suspension warning

### Marketing Emails
- Tool: Mailchimp (free up to 500 contacts) or Brevo (free up to 300/day)
- Sequences:
  - Lead nurture for trial users → convert to paid
  - Monthly product updates newsletter
  - Tips and best practices emails

### Email Deliverability
- Set up SPF, DKIM, DMARC on convorian.in DNS — critical
- Use a subdomain for marketing: mail.convorian.in
- Warm up the domain gradually — start with 50 emails/day, increase weekly
- Monitor: Google Postmaster Tools

---

## 13. WHATSAPP MARKETING

### Meta Business API Setup
Requirements you have:
- [x] Domain: convorian.in
- [x] Business email
- [x] Udyam registration
- [ ] Facebook Business Manager account — create at business.facebook.com
- [ ] WhatsApp Business Account (WABA)
- [ ] Phone number (dedicated, not personal)
- [ ] Display name approved by Meta
- [ ] Privacy Policy URL live

Steps:
1. Create Facebook Business Manager
2. Verify business with Udyam + domain
3. Create WhatsApp Business Account
4. Submit phone number
5. Get Meta approval (3–7 days)
6. Update lib/whatsapp.ts to use Meta instead of Twilio
7. Create and submit message templates for approval

### WhatsApp Campaigns for Onboarding
- Target: New signups who haven't added their first lead
- Message: "Hi [Name]! Your Convorian account is ready. Add your first lead in 2 minutes and watch the AI take over 👉 [link]"
- Only send to opted-in users
- Frequency: Max 1 message per 3 days during trial

---

## 14. FREE TRIAL & ONBOARDING STRATEGY

### Recommendation: 14-Day Free Trial
- No credit card required at signup
- Full access to Growth plan features
- Limit: 10 leads, 50 WhatsApp messages during trial
- Why: Low friction = more signups. Limits = natural upgrade trigger

### Token/Cost Management During Trial
- 10 leads × ~5 messages each = 50 messages max
- Cost per trial user: ~₹25 (50 messages × ₹0.50)
- Expected conversion: 15–25% of trial users convert
- Break-even: 4 conversions pay for 100 trial users
- Conclusion: Free trial is profitable at scale

### Onboarding Flow
Day 0: Signup → Welcome email + WhatsApp message
Day 1: "Add your first lead" prompt
Day 3: "Your bot has sent X messages" — show value
Day 7: "You have Y leads being nurtured automatically"
Day 10: "Your trial ends in 4 days — upgrade to keep going"
Day 13: Final reminder with discount offer (10% off first month)
Day 14: Trial ends → soft paywall

---

## 15. AI ENGINE — PROPRIETARY DEVELOPMENT

### Current State
- Engine in lib/gemini.ts (filename kept; now powered by **Groq — Llama 3.3 70B**, NOT Gemini)
- Stages: greeting → discovery → qualification → presentation → objection → commitment → **post_visit** → nurture → closed
- `post_visit` stage: after a site visit, the bot opens by asking how it went and uses the agent's logged feedback notes to drive the close (core conversion edge)
- Techniques: AIDA, SPIN selling, urgency, social proof, loss aversion, progressive commitment

### What Makes It Proprietary
- The prompt engineering is the IP — not the model underneath
- The stage detection logic
- The sales psychology layering
- The metadata extraction (score, temperature, intent, budget)
- The conversation memory via Supabase

### Roadmap to True Proprietary Engine
**Phase 1 (Launch):** Groq / Llama 3.3 70B as base model + proprietary prompting — current state
**Phase 2 (Month 3–6):** Fine-tune on real estate conversation data
- Collect anonymised successful conversations (with agent consent)
- Fine-tune a smaller open model (Llama 3.x / Mistral)
- This becomes the Convorian Conversion Engine v2

**Phase 3 (Month 6–12):** Multi-vertical intelligence
- Separate prompt layers per industry (real estate, insurance, education, auto)
- A/B test conversation strategies automatically
- Engine learns which messages convert better per agent type

**Phase 4 (Year 2):** Full proprietary model
- Train Convorian's own fine-tuned model
- Hosted on own infrastructure
- This is the moat — impossible to replicate easily

### Data Flywheel
More agents → More conversations → More training data → Better engine → More conversions → More agents
This is the virtuous cycle. Protect it. It is your core competitive advantage.

---

## 16. POST-LAUNCH OPERATIONS

### Weekly Routine
- Monday: Review metrics (new signups, churn, revenue, support tickets)
- Wednesday: Review failed conversations / bot errors
- Friday: Deploy fixes and improvements

### Monthly Routine
- Review P&L with CA
- GST filing
- Engine performance review — are leads converting?
- Customer success calls with top 5 agents — gather feedback
- Competitor analysis — what are others building?

### Metrics to Track (KPIs)
- MRR (Monthly Recurring Revenue)
- Churn rate (target: < 5% monthly)
- Trial to paid conversion rate (target: > 20%)
- Average leads per agent
- Bot response rate (messages sent vs delivered)
- Site visit booking rate (key metric — this is the product's job)
- NPS (Net Promoter Score) — survey agents monthly

---

## 17. RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Meta bans WhatsApp account | Medium | Critical | Follow all policies strictly. Have Twilio as backup. |
| Agent accuses data theft | Low | High | Full audit logs, RLS isolation, legal T&C |
| AWS App Runner outage | Low | High | Multi-region option. Status page. SLA communication. |
| Supabase data loss | Very Low | Critical | Daily backups. Point-in-time recovery enabled. |
| Competitor copies product | High | Medium | Build the data flywheel moat. Move fast. |
| Agent churns after annual plan | Low | Medium | Strong onboarding. Monthly check-ins. |
| Razorpay payment failure | Low | High | Retry logic in app. Email agent immediately. |
| AI gives wrong property info | Medium | Medium | Engine rules say never fabricate. Add disclaimer. |
| Regulatory change (TRAI/DPDP) | Medium | High | CA + legal counsel monitoring. Flexible architecture. |
| Key person risk (you) | High | Critical | Document everything. This blueprint is step 1. |
| Negative viral moment | Low | High | Prepare PR response template. Be transparent. |
| Pricing too low / too high | Medium | Medium | Monitor conversion rate. Adjust in month 2. |
| WhatsApp template rejection | High | Medium | Have 3-4 templates ready. Submit early. |
| Scaling costs spike | Medium | Medium | Set AWS budget alerts. Monitor weekly. |

---

## 18. MASTER TASK CHECKLIST

### LEGAL
- [x] Operating as individual / sole proprietor (launch now)
- [x] Terms of Service drafted (files/TERMS_OF_SERVICE.md)
- [x] Privacy Policy drafted (files/PRIVACY_POLICY.md)
- [ ] Draft Refund Policy + Cookie Policy
- [ ] Register Pvt Ltd (LATER — when scaling / before Meta verification)
- [ ] Open business current account (with Pvt Ltd)
- [ ] GST registration (only at ~₹20L turnover)
- [ ] Hire CA (before meaningful revenue)
- [ ] Finalise legal-doc entity wording with a CA/lawyer (docs say "Private Limited" — adjust for sole-prop now or keep for upcoming Pvt Ltd)

### TECHNICAL (Claude Code)
- [x] Migrate AI to Groq (Llama 3.3 70B)
- [x] Demo-chat working (now on landing page; remove once Meta API live for real testing)
- [ ] **Rebrand LeadNest → Convorian everywhere** (brand name + new colour theme)
- [ ] Add Privacy Policy page at /privacy-policy (content ready in files/)
- [ ] Add Terms of Service page at /terms-of-service (content ready in files/)
- [ ] Add Refund Policy + Cookie Policy pages
- [ ] Deploy to AWS App Runner (IAM role + GitHub secrets), then configure DNS for convorian.in + SSL
- [ ] Configure Cloudflare
- [ ] Set up Sentry error tracking + UptimeRobot monitoring
- [ ] Set up staging environment
- [ ] Run full QA test suite
- [ ] Security audit (RLS GRANTs, rate limiting, input validation, webhook signature verification)
- [ ] Set up AWS budget alerts

### WHATSAPP / META
- [ ] Create Facebook Business Manager
- [ ] Verify business on Meta
- [ ] Create WhatsApp Business Account
- [ ] Register phone number
- [ ] Submit and get 3+ templates approved
- [ ] Update app to use Meta API instead of Twilio
- [ ] Test end-to-end on Meta

### BILLING
- [x] Razorpay account active (individual)
- [ ] Razorpay PAN correction — verify edit went through before live charges
- [ ] Wire real Razorpay Checkout + signature verification into app (replace simulated BalanceScreen)
- [ ] Set up subscription plans (₹999 / ₹799) in Razorpay
- [ ] Wire payment webhooks → wa_balance / wa_transactions
- [ ] Automatic invoice generation
- [ ] Test payment flow end to end (test keys first, then live)

### MARKETING
- [ ] Reserve @convorian on Instagram, LinkedIn, Twitter, YouTube
- [ ] Set up Google Business Profile
- [ ] Submit to Google Search Console
- [ ] Set up Google Analytics 4
- [ ] Write first 3 blog posts
- [ ] Create 3 Instagram Reels for launch
- [ ] Build list of 500 real estate agents to contact
- [ ] Set up email marketing tool (Brevo/Mailchimp)
- [ ] Create onboarding email sequence

### SUPPORT
- [ ] Set up support@convorian.in
- [ ] Set up Freshdesk or Zoho Desk
- [ ] Write FAQ document (top 10 questions)
- [ ] Record 3 tutorial videos
- [ ] Set up WhatsApp support number

### LAUNCH
- [ ] All critical bugs fixed
- [ ] All legal pages live
- [ ] Payment flow tested
- [ ] Meta WhatsApp API live
- [ ] Monitoring in place
- [ ] Support ready
- [ ] First 10 beta agents onboarded
- [ ] Announce on social media
- [ ] Submit to ProductHunt

---

*This document should be updated monthly. Claude Code reads this at the start of every session.*
*Next review: July 2026*
