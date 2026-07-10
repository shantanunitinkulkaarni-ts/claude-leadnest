# GPT Second Review - June 2026

Scope: strict pre-launch security and readiness review of the current Convorian app in `C:\LN\claude-leadnest`.

Goal: help Claude/Opus rectify concrete launch blockers before real customer data lands. This is a code review, not a penetration test. Findings below are evidence-based; anything inferred from a schema dump is marked as such.

## Launch Verdict

Not launch-ready yet.

The core architecture is promising: API routes generally use owner checks, the WhatsApp webhook verifies signatures, Razorpay subscription webhooks verify raw-body HMAC, and the bot keeps property facts in code/database rather than letting the LLM invent them.

However, I found several concrete launch blockers or high-priority hardening issues that should be fixed before onboarding real customers.

## Findings

### P0 - Wallet top-ups are replay-creditable

File: `app/api/payments/verify/route.ts`

Evidence:

- Lines around `13`: accepts `agent_id`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
- Lines around `27`: verifies the Razorpay signature.
- Lines around `47-51`: calculates the current wallet balance and adds the paid rupee amount.
- Lines around `56`: inserts a `wa_transactions` row, but only after balance has already been credited.

Problem:

The route credits `wa_balance` every time the same valid Razorpay order/payment/signature payload is submitted. There is no idempotency guard keyed on `razorpay_payment_id` or `razorpay_order_id`, and no unique transaction constraint checked before crediting.

Impact:

A logged-in agent can replay a previously successful payment verification request and receive the same wallet credit multiple times.

Recommended fix:

- Store `razorpay_payment_id` and/or `razorpay_order_id` in `wa_transactions`.
- Add a unique DB constraint on the payment id.
- Perform idempotency check and balance credit in one DB transaction/RPC.
- If the payment id already exists, return the existing balance without adding again.

### P0 - Verify live RLS: team member self-add appears to allow workspace takeover

File: `db/schema.sql`

Evidence:

- Around line `420`: policy `team_members.Users can insert their own team_member record`.
- Around line `421`: `WITH CHECK (auth.uid() = auth_user_id)`.
- `lib/apiAuth.ts` around line `69` trusts `team_members` membership for `requireAgentAccess`.

Problem:

The checked-in schema dump suggests an authenticated user can insert a `team_members` row for themselves with any `agent_id`, as long as `auth_user_id` equals their own user id. If the live database has this same policy, any authenticated user who obtains or guesses an `agent_id` can add themselves to another workspace.

Impact:

This would bypass the service-role API access checks, because those checks trust `team_members`. It may also grant direct Supabase access wherever client-side RLS relies on the same membership table.

Important note:

This finding is based on `db/schema.sql`, not a direct live DB query. Verify the live Supabase policies before concluding exploitability.

Recommended fix:

- Remove public/self-service insert policies that allow arbitrary `agent_id`.
- Move workspace/team creation into a server route using service-role logic.
- For team joins, require an invite token or ownership/admin check.
- Keep onboarding safe by creating the `agents` row and owner `team_members` row atomically server-side.

### P1 - Admin browser receives secret agent columns

File: `app/admin/page.tsx`

Evidence:

- Around line `23`: client component executes `supabase.from('agents').select('*')`.
- `db/schema.sql` around line `54` includes `wa_access_token`.
- `db/migrations/10_agent_wa_onboarding.sql` adds `wa_pin`.
- `RUNBOOK.md` says: `Never SELECT wa_access_token`.

Problem:

The admin dashboard is a browser component and selects every column from `agents`. If live RLS allows the superadmin to read all agent rows, then WhatsApp access tokens, PINs, and other sensitive fields are delivered into browser memory.

Impact:

This increases secret exposure and violates the project runbook. A browser extension, XSS, copied logs, or shoulder-surfed devtools session could expose WhatsApp credentials.

Recommended fix:

- Replace direct browser `select('*')` with a server route.
- Return only an explicit allowlist: agency name, owner email, status, balance, connected number/display name, plan fields, created date.
- Never return `wa_access_token`, `wa_pin`, provider secrets, or payment customer ids to the browser.

### P1 - 2FA is bypassable through Google OAuth

Files:

- `app/login/page.tsx`
- `app/auth/callback/route.ts`
- `middleware.ts`

Evidence:

- `app/login/page.tsx` around line `29` defines `finishLogin()` and checks Supabase MFA AAL.
- Email/password login calls `finishLogin()` around line `98`.
- Phone OTP login calls `finishLogin()` around line `137`.
- Google login starts OAuth around line `71`.
- `app/auth/callback/route.ts` around line `19` redirects directly to `next` or `/dashboard`.
- `middleware.ts` around line `41` only checks that a user exists for `/dashboard` and `/admin`.

Problem:

Users enrolled in TOTP appear to be challenged only in the email/password and phone OTP flows. Google OAuth completes in the server callback and redirects directly to the protected app. Middleware does not enforce AAL2.

Impact:

An enrolled account may be able to bypass the TOTP prompt by using Google OAuth.

Recommended fix:

- Enforce MFA/AAL2 at the protected boundary, not only inside login form handlers.
- Add a server/client MFA gate for `/dashboard` and `/admin`.
- After OAuth callback, redirect to an MFA challenge page if `nextLevel === 'aal2'` and `currentLevel !== 'aal2'`.

### P1 - Manual WhatsApp send trusts client-supplied recipient phone

File: `app/api/messages/route.ts`

Evidence:

- Around line `24`: route requires `agent_id`, `lead_id`, and `content`.
- Around lines `52-60`: sends WhatsApp message to `body.phone`.
- The route verifies the lead belongs to the agent, but does not fetch the lead phone server-side before sending.

Problem:

The recipient phone number comes from the client request rather than the verified lead row.

Impact:

A valid agent user can send from their business number to an arbitrary phone number while logging it under a different lead. This can cause consent, billing, and audit problems.

Recommended fix:

- After `requireLeadAccess(body.lead_id)`, fetch the lead row.
- Send only to `lead.phone`.
- Ignore any client-supplied phone field for this route.
- Optionally validate that the lead is opted in before manual sends.

### P2 - Delivery-status webhook fails open when secret is missing

File: `app/api/webhook/status/route.ts`

Evidence:

- Around line `58`: `statusAuthed()`.
- Around line `60`: `if (!secret) return true`.

Problem:

If `MSG91_STATUS_SECRET` is missing in production, the delivery-status endpoint accepts unauthenticated callbacks.

Impact:

Anyone could submit fake delivered/failed statuses for messages if they know or guess provider message ids. This is not as severe as data exfiltration, but it corrupts operational truth.

Recommended fix:

- Fail closed in production when `MSG91_STATUS_SECRET` is unset.
- Only allow fail-open in local development.
- For Meta-origin status webhooks, prefer Meta signature verification where possible.

### P2 - Authenticated storage upload is not scoped to an agent

File: `app/api/properties/upload/route.ts`

Evidence:

- Around line `19`: only calls `getAuthContext()`.
- Around line `24`: reads uploaded file.
- Around line `39`: enforces max 15MB.
- Around line `63`: uploads to public `property_assets` storage.

Problem:

Any authenticated user can upload JPEGs to the public property asset bucket. The route does not require `agent_id`, does not call `requireAgentAccess(agent_id)`, does not enforce per-agent quota, and does not store under a scoped path.

Impact:

Logged-in users can consume storage/bandwidth without having a valid agent workspace. Asset ownership is also harder to audit.

Recommended fix:

- Require `agent_id`.
- Call `requireAgentAccess(agent_id)`.
- Store objects under `agent_id/property_id/...` or similar.
- Add per-agent upload limits and/or cleanup for orphan uploads.

### P2 - Public support emails render unescaped user input into HTML

Files:

- `app/api/support-ticket/route.ts`
- `app/api/notify-signup/route.ts`

Evidence:

- `support-ticket/route.ts` around lines `51-58` interpolates `subject`, `name`, and `message` into HTML email bodies.
- `notify-signup/route.ts` around lines `25-30` interpolates signup fields into HTML email bodies.

Problem:

Public input is inserted into HTML emails without HTML escaping.

Impact:

Mostly team-inbox risk rather than app XSS, but it can still create misleading emails, HTML injection, tracking pixels, or malicious links rendered in the inbox.

Recommended fix:

- Add a small `escapeHtml()` helper.
- Escape all user-controlled values before inserting into email HTML.
- Keep `replyTo` separately validated as an email address.

## Additional Hardening Notes

### CSP is report-only and still allows unsafe eval/inline

File: `next.config.js`

Evidence:

- Around line `40`: `script-src` includes `'unsafe-inline'` and `'unsafe-eval'`.
- Around line `70`: header is `Content-Security-Policy-Report-Only`.

This may be acceptable for a staged rollout because Razorpay and Next.js can require careful CSP tuning. For launch, keep monitoring reports and move toward enforcement. Do not switch blindly without testing Razorpay checkout, Sentry, Supabase, and Meta onboarding.

### Playwright script/harness needs cleanup

Observed behavior:

- `npm run test:critical` could not run through the broken local npm shim.
- Direct Playwright command using `tests/critical` reported `No tests found` in one invocation.
- Running explicit `tests/critical/critical-flows.spec.ts` executed all 36 tests successfully, but the outer command timed out because the web server stayed alive.

Recommendation:

- Fix the local/CI test command so it exits reliably.
- Consider using forward-slash paths or Playwright project config that is Windows-safe.
- Ensure web server teardown works in local and CI.

### Sentry SDK setup warnings

Observed warnings during Playwright web server startup:

- `sentry.server.config.ts` and `sentry.edge.config.ts` should move into a Next.js instrumentation file.
- `sentry.client.config.ts` should move toward `instrumentation-client.ts`.
- `disableLogger` is deprecated.

Not a launch blocker, but worth fixing before depending on Sentry for production incident visibility.

### Encoding/mojibake across UI/docs

Many files display mojibake such as `â€”`, `â‚¹`, and `ðŸ...` in user-facing copy, comments, emails, and docs.

Impact:

This is not primarily a security issue, but it will make the product look broken and can corrupt outbound messages/emails. Fix before public launch.

## Verification Performed

Normal npm commands failed because the local global npm shim points to a missing file:

`C:\Users\rahul\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js`

I used local binaries directly instead.

Results:

- TypeScript: `node node_modules\typescript\bin\tsc --noEmit` passed.
- Lint: `node node_modules\next\dist\bin\next lint` passed with warnings only.
- Critical spec: `node node_modules\@playwright\test\cli.js test tests/critical/critical-flows.spec.ts --timeout=10000` ran 36 tests and all 36 passed, but the outer command timed out because the web server did not exit cleanly.

## What Looks Solid

- Main CRUD API routes generally use `requireAgentAccess`, `requireLeadAccess`, or related helpers before service-role database access.
- Primary WhatsApp webhook verifies Meta signature or shared secret before accepting inbound payloads.
- Razorpay subscription webhook verifies raw-body HMAC before trusting events.
- The bot architecture keeps property facts and booking actions in deterministic code/database paths instead of letting the LLM invent critical facts.
- Supabase client initialization is lazy and does not fall back to service-role for browser/middleware clients.

## Suggested Fix Order

1. Fix wallet top-up idempotency.
2. Verify and lock down live `team_members` RLS policies.
3. Remove browser-side `agents.select('*')` and replace with an admin allowlist API.
4. Enforce MFA/AAL2 after OAuth and at protected route boundaries.
5. Fix manual WhatsApp send to use the verified lead phone.
6. Fail-close delivery status auth in production.
7. Scope property uploads to agent/property ownership.
8. Escape public support/signup email HTML.
9. Fix test harness exit and Sentry instrumentation warnings.
10. Repair mojibake in user-facing copy and outbound messages.
