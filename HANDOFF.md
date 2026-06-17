# Convorian — Master Project Doc (LIVING — read first, update every chat)

*Last updated: 2026-06-17 16:07 IST (10:37 UTC) — session 8*
> ⏱️ This timestamp is set by hand at each update. If it looks stale vs. recent
> git history (`git log -1`), assume parts of this doc are out of date and verify
> against the code before trusting them.

> **This is the single source of truth.** Every new chat: read this first, then update it (Done / Pending / Plan) at the end of the session. Deep business plan lives in `files/CONVORIAN_LAUNCH_BLUEPRINT.md`; user memory at `C:\Users\rahul\.claude\projects\C--LN\memory\`.
>
> **What Convorian is:** AI WhatsApp assistant for Indian real-estate agents. Agents connect their WhatsApp; the bot answers, qualifies, nurtures leads & books visits 24/7. SaaS at ₹999/mo. We are a **Tech Provider** (clients connect their own numbers). Category like Wati/Interakt, but niche (real estate) + AI-led.
> **Stack:** Next.js 14 · Supabase (Postgres) · **LLM: GLM-4.5-Flash primary → Cerebras fallback** (`lib/llm.ts`; NOT Groq/Gemini/Claude) · **Vercel** (hosting) · Razorpay (payments, LIVE) · Resend (email) · WhatsApp via MSG91 BSP (Meta Cloud API per-agent). Repo: `C:\LN\claude-leadnest` → GitHub `shantanunitinkulkaarni-ts/claude-leadnest`. Live: **https://convorian.in**.

---

## 1. DONE ✅

- **June 17 SESSION 8 — PHOTOS ACTUALLY DELIVER + Phase 0F column-mismatch sweep:**
  - **🔴 Phase 0F regression (the real reason photos still failed).** The Phase 0
    migration moved property photos from the `features` array into a new
    `property_media` column and STRIPPED `media:` entries from `features`. The
    engine prompt was updated to read `property_media`, so the bot *promised*
    photos — but multiple consumers still read/wrote the emptied `features`:
    - **`app/api/webhook/route.ts`** photo-send SELECTs fetched only
      `id,title,features` → `extractPropertyMedia` (reads `property_media` first)
      returned [] → bot sent ZERO photos. FIXED (PR #104): both SELECTs now include
      `property_media`. Regression guard added in `tests/unit/media.spec.ts`.
    - **`app/api/admin/convert-media`** scanned only `features` (emptied) → its
      "0 to convert" was a false negative. FIXED (#104): scans `property_media` too.
    - **`components/screens/PropertiesScreen.tsx`** read images from `features`
      (card thumbnail + edit form) AND wrote media back into `features` on save,
      never `property_media`. So a migrated property showed "No photos yet" and any
      edit diverged further. FIXED (PR #105): reads via `extractPropertyMedia`,
      saves media to `property_media`, preserves amenities in a new `amenityFeatures`.
  - **One-time prod data fix (founder-approved):** because the founder re-uploaded
    new photos using the OLD save code, the new images landed in `features` while
    old ones stayed in `property_media` (what the bot reads). Promoted the newer
    `features` media → `property_media` and cleared stale entries for the 2 live
    properties (Lodha, Lodha Towers). New photos now deliver. ✅ confirmed.
  - **🔴 Webhook total outage fixed.** `MSG91_WEBHOOK_SECRET` auth gate shipped
    (Phase 0, commit 9527c7e) without the env var ever being set → every inbound
    message 500'd (bot fully dark). Generated secret, set in Vercel, redeployed;
    founder added matching `x-webhook-secret` header in MSG91 dashboard. Now 200
    with header / 403 without.
  - **`superadmins` GRANT fix (`superadmin_grant_fix.sql`, founder ran in Supabase):**
    `grant_privs.sql` granted the table to `authenticated` but NOT `service_role`,
    so server-side `getAuthContext` got "permission denied" → `isSuperadmin` always
    false on the server (broke admin-only endpoints + impersonation via APIs).
    `GRANT ALL ON public.superadmins TO service_role;` — verified fixed.
    NOTE: the founder's gmail user has NO row in `superadmins` (not actually a
    superadmin); add a row if `/admin` powers are wanted.
  - MSG91 delivery-report URL (`/api/webhook/status`) already configured in MSG91.
  - **🔴 SECURITY: committed secrets removed + repo hygiene.** `env.yaml` (a leftover
    gcloud deploy file) was tracked in git with LIVE values: Supabase `service_role`
    + `anon` keys, Twilio token, Resend key, Gemini key, CRON_SECRET. Root cause it
    persisted: `.gitignore` had a CORRUPTED line (`e n v . y a m l`, spaces between
    letters — a bad write) so it never matched. Also `test_appointments.js` hardcoded
    the `service_role` key and `app/auth/callback/route.ts` hardcoded the `anon` key
    as fallbacks. FIXED: deleted `env.yaml`/`render.yaml`/`test_appointments.js`,
    stripped the hardcoded fallbacks from the callback route, repaired `.gitignore`
    (proper `env.yaml`/`*.env.yaml`/`scratch/`/`gist-export/` patterns). ⚠️ Deleting
    does NOT scrub git history — the founder must ROTATE the keys ONCE (Supabase
    service_role+anon, Twilio token, Resend key, Gemini key, CRON_SECRET) to fully
    close it. Also removed dead `lib/claude.ts` (fallback is Cerebras, not Claude)
    and junk root one-off scripts (`check_db.js`, `clear_limits*.js`,
    `create_demo_table.js`, `create_waitlist_table.js`, `integration_test.js`,
    `test_onboarding.js`, `scratch/`, stray root images).

- **June 15 SESSION 7 — PHOTO SENDING FIXED (root cause: AVIF) + prompt training:**
  - **🔴 ROOT CAUSE of photos never arriving = AVIF format.** WhatsApp/Meta only
    DELIVER JPEG/PNG; they silently DROP AVIF/HEIC/WebP/TIFF. MSG91 returns
    `"success"` (accepted) but Meta never sends the file. We were blind because
    delivery reports weren't being matched (see message_uuid fix). Founder
    confirmed the property images were AVIF.
  - **`MSG91_MEDIA_LIVE` was EMPTY in Vercel** (`""`, not `"true"`) — so the whole
    photo block (`if MSG91_MEDIA_LIVE === 'true'`) never ran (zero logs, zero
    attempts). FIXED → set to `true`. ⚠️ GOTCHA: `vercel env add` via piped stdin
    SILENTLY stores empty in this sandbox; must use `--value "true"` flag (saved
    to user memory `vercel-env-stdin-broken.md`). Env change needs a redeploy.
  - **Image conversion shipped (PR #93, deployed to prod, NOT yet merged to main):**
    `lib/imageConvert.ts` `toWhatsAppJpeg()` re-encodes any image → resized
    (≤1600px) <5MB JPEG via **sharp** (now pinned in package.json; was transitive).
    Upload route (`app/api/properties/upload/route.ts`) now ACCEPTS avif/heic/etc
    and ALWAYS converts to JPEG before storing. New one-time backfill endpoint
    `POST /api/admin/convert-media` (CRON_SECRET/superadmin-gated; `{dry:true}` to
    preview, `{}` to run, `{property_id}`/`{agent_id}` to scope) converts EXISTING
    non-JPEG property photos in place.
  - **Delivery-tracking fix (PR #92, MERGED to main + deployed):** `sendViaMsg91`
    + `sendViaMsg91Media` now return the real `data.message_uuid` (was returning
    literal `'sent'` → delivery reports never matched → we couldn't see failures).
    `lib/deliveryStatus.ts` ID_KEYS now includes `message_uuid`.
  - **`[photo] Lodha` text leak fix (PR #91, MERGED + deployed):** bot was echoing
    the `[photo] <title>` DB markers into its reply (it learned them from history).
    `isMediaPlaceholder()` filters them out of LLM history (generateBotReply +
    generateNudge); hard prompt rule never to write bracketed image tags;
    `parseEngineResponse` strips any leaked placeholders/markdown images.
  - **Prompt training (PR #87, MERGED + deployed):** greeting asks name+language
    first (no property dump); never substitute a different locality (share agent
    contact instead); show properties BEFORE pushing a visit ("sure tell me" →
    show, don't book); when lead asks for photos/details, GIVE them, don't redirect
    to visit; never repeat visit-booking when lead re-asks for info; never say
    "system". `matched_property_id` now ALWAYS included when a property is in play
    (was only on first recommendation) + saved to lead (migration
    `matched_property_migration.sql` RUN in prod). Photo lookup in webhook now
    falls back to matching property titles in recent bot messages. `wantsPhotos`
    + `botPromisedPhotos` widened (EN+Hindi+Marathi).
  - **`.gitignore` hardened:** now ignores all `.env.*` (prod secrets like
    `.env.production` were untracked, not ignored — one `git add .` from leaking).
  - **Tests:** 377 unit tests green; `next build` verified with sharp. New eval
    scenarios for the founder-reported bugs (sure-tell-me, no-I-need-details,
    area-not-in-inventory, photos-in-commitment, greeting flow).
  - **⏳ PENDING (founder, see section 2):** merge PR #93; run convert-media on
    existing AVIFs (or founder re-uploads as JPEG — founder said they re-uploaded
    JPEGs but may need to DELETE old AVIF entries since the edit screen APPENDS);
    create MSG91 delivery webhook → `/api/webhook/status` (events: failed,
    api-failed, delivered, sent); then test "photos pls" and read delivery logs.
  - **How competitors (Wati/Interakt) do media:** they're DIRECT Meta Cloud API
    BSPs and upload media bytes to Meta first → get a media-ID → send by ID (no
    fetch-at-send-time failure). We go through MSG91 (extra hop) + send by public
    URL. Robust long-term path = direct Meta media-ID upload once App Review lands
    (`sendMetaImageById`, deferred). Plan file:
    `C:\Users\rahul\.claude\plans\vivid-dreaming-quiche.md`.

- **Live** at https://convorian.in (Vercel, SSL). Convorian brand, indigo/violet theme, glassmorphism landing + live AI chat demo.
- **Pages:** home, /login, /onboarding, /privacy-policy, /terms-of-service, /forgot-password, /reset-password. Legal docs render from `files/*.md`.
- **Auth:** Supabase email/password. **Password reset** built (needs Supabase URL config — see Founder tasks).
- **AI bot:** Groq engine (`lib/gemini.ts`). Stages incl. post-visit conversion. **Live on WhatsApp** via Meta Cloud API test number + permanent token. Deliveries confirmed.
- **Payments:** Razorpay **LIVE** + working (real Checkout + server-side signature verification). Keys in Vercel Production (founder-set).
- **Meta:** Business verified (Udyam). App created. Display name "Convorian" approved. Limits raised (2000 biz-initiated/24h). **App Review SUBMITTED** (messaging + management; 2 videos, test calls done). **Tech Provider verification submitted** (~5 day review).
- **Opt-in/consent tracking:** inbound lead = auto opt-in; manual add requires consent checkbox.
- **Logo:** `public/icon.png` (mark) + `public/logo.png` (wordmark). Compressed: 5MB → 316KB PNG + 18KB WebP. Sidebar uses WebP.
- **Security audit done:** upload route auth fixed, agent API never leaks wa_access_token, register endpoint validates inputs.
- **Bot reliability:** Groq failures send polite fallback (never blank message), message dedup by wa_message_id, lead insert null-checked.
- **TS errors:** all fixed. `ignoreBuildErrors` removed from next.config.
- **Error boundaries:** each dashboard screen wrapped — crash in one widget can't blank whole page.
- **Sentry: LIVE.** Code wired + DSN set in Vercel production + deployed. Error tracking active (test/sample error confirmed received). Org `covorian`, EU region.
- **Email (Resend):** `lib/email.ts` — full branded email system (indigo/violet theme, gradient header, CTA buttons, responsive). Welcome email on signup. **convorian.in domain verified in Resend (GoDaddy auto-added DNS records ✅).** Emails now deliver. Supabase Custom SMTP still needs founder action (see Pending).
- **Nurture email sequence:** 6-step lifecycle flow in `lib/nurture.ts` — Day 1 (add first lead), Day 3 (tips), Day 7 (value recap with real counts), Day 14 (upgrade nudge ₹999), Day 21 (follow-up gap), Day 30 (final upgrade). Runs daily via cron. Tracks progress in `agents.nurture_emails_sent`. DB migration applied to production.
- **Dependabot:** weekly npm vulnerability PRs configured (`.github/dependabot.yml`).
- **Mobile:** Sidebar is now a collapsible drawer with hamburger. Dashboard usable on phones.
- **Demo account** (Razorpay + Meta reviewers): demo@convorian.in / ConvorianDemo@2026 (has the WhatsApp test number + sample data).
- **Invoices/receipts (June 11):** Balance screen now has a "Billing history" list (`/api/subscription/invoices`) with per-payment branded printable receipts (`/api/subscription/receipt`, Print→Save-as-PDF, no PDF lib). Backed by existing `subscription_events`; no migration. Labelled payment receipt, not tax invoice (no GST). LIVE.
- **June 14 SESSION 5 — Alert detail boost, outreach bug fixes, nudge intelligence (PR #84, all CI green):**
  - **Knowledge-gap alerts now tell the agent WHAT the bot couldn't answer**: `buildAlertContent` accepts `botReply?: string`; for `knowledge_gap` signal, the alert email + WhatsApp now show "Bot replied: '...' " so the agent knows EXACTLY what detail to fill (possession date? RERA? floor plan?) — not just "bot couldn't answer". Webhook passes `reply` as `botReply` for this signal. 3 new tests.
  - **Fixed `isLastTouch` bug in outreach (`lib/outreach.ts`)**: `pickTemplate` hardcoded farewell template (`lead_final_touch`) after 2 touches regardless of agent intensity. For `balanced` (5 max) or `persistent` (8 max), this burned the farewell on touch 3 repeatedly. Fix: `isLastTouch = touches >= maxTouches - 1`, derived from the agent's actual intensity. 5 new tests covering all 3 intensity boundaries.
  - **Post-visit nudges now use deal-conversion copy**: `generateNudge` for `post_visit` stage leads now asks "how did you feel about the visit?" rather than the generic "picking up where we left off" re-engagement — post-visit is our best conversion window. Nurture stage also gets a market-update framing.
  - **Matched property referenced in nudge**: If `lead.metadata?.matched_property_id` is set, the nudge LLM context names that specific property ("Last recommended: Skyline 3BHK Baner ₹95L") instead of a generic area/type list.
  - **Post-visit leads excluded from template outreach**: `pickTemplate` returns `null` for leads with `status='visit_done'` or `post_visit_result` set. Sending "new property match" templates to post-visit leads is counterproductive — agent should call them. 2 new tests.
  - **Commitment stage honesty fix**: Bot no longer says "I'll send you the Google Maps link" (it can't). Changed to "Our team will share the exact address and location link" which is honest.
  - **Expanded KNOWLEDGE_GAP detection**: 7 new patterns including "get back to you", "check about this and update", "have our team confirm", "main confirm kar ke batata hun" etc. — catches more of the bot's actual deferral phrases.
  - **Property details format upgraded** (`PROPERTY DETAILS FORMAT` in prompt): possession status, ALL amenities, sqft, and HIGHLIGHTS are now in the format — not just "1-2 key highlights". Plus "aur batao" / "tell me more" instruction added to presentation stage.
  - **6 new eval scenarios** (25 → 31 total): template button "Yes, share details" → shows actual inventory property; template "Haan batao" → matches right BHK/area; "aur batao sab kuch" → full property brief; post-visit hot lead → deal-conversion mode; Marathi "amenities kay aahet?" → comprehensive Latin Marathi reply.
  - **20 new unit tests** (316 → 336 total) incl. 11 new `detectReplyKnowledgeGap` tests covering all 7 new deferral patterns + team reach-out. All passing. CI green.
  - **PR #84 MERGED & DEPLOYED ✅** — live at https://convorian.in (June 15 session 6).
  - **NOTE**: `window_nudge_count: 0` reset on inbound already existed in the early lead update (line 211 of webhook) — the cron comment was accurate. Added redundant reset in `leadUpdates` (harmless/idempotent).
- **June 14 SESSION 4 — Indian RE prompt training, eval expansion, bug fixes (ALL SHIPPED):**
  - **PR #79 MERGED & DEPLOYED ✅ — Property photo sending (gated):** Bot can send up to 4 property images per request when lead asks for photos. Gated by `MSG91_MEDIA_LIVE=false` (flip after founder tests endpoint). New: `lib/media.ts` (`extractPropertyMedia`, `wantsPhotos`), `sendViaMsg91Media` in `lib/whatsapp.ts`, `/api/admin/test-media` verification endpoint, 16 unit tests. Prompt updated: honest about photo capability based on env var.
  - **PR #81 MERGED & DEPLOYED ✅ — Indian RE prompt training:** (1) `intentSignals.ts` — added Indian RE-specific `very_interested` patterns (`token dena hai`, `bayana`, `advance dena`, `agreement sign`, `registry kab`, `loan sanction ho gaya`) + `call_request` patterns (`call lagao/lagwao`, `phone pe baat`); (2) `gemini.ts` — rewrote few-shot examples to be India-specific (crore/lakh budgets, vastu, family-approval objections, price negotiation, Hinglish/Marathi), expanded objection stage with 5 India-specific objection handlers (family approval, loan/EMI, builder trust/RERA, price negotiation etiquette, possession delay); (3) 112 new unit tests (`tests/unit/conversation-scenarios.spec.ts`) covering signal detection, stage routing, and trilingual language detection. Total tests: 312.
  - **PR #82 MERGED ✅ — Eval lab expansion:** `tests/evals/engine-eval.spec.ts` grew from 9 → 25 AI-judged scenarios. Added richer `sampleProperties` (under-construction 2BHK, ready 2BHK with media). 16 new scenarios: vastu, crore budget, family approval, possession date unknown, loan/EMI, Marathi Latin reply, template "not right now", price negotiation, competitor probing, IST visit booking, returning quiet lead, missing inventory, out-of-hours, Devanagari Marathi, price from memory vs inventory, voice note, agent number request. Run: `npm run eval` (needs `GROQ_API_KEY`).
  - **PR #83 MERGED & DEPLOYED ✅ — Button-tap dedup fix:** When MSG91 button taps arrive with empty uuid, `wa_message_id = NULL`. Postgres doesn't enforce uniqueness on NULL → webhook retries fire a second reply. Fix: content-dedup check before INSERT when uuid absent (same content from same lead <60s → skip). 4 new unit tests. Diagnostic log (`uuid=EMPTY`) is still there to confirm whether this actually happens in prod.
- **June 14 SESSION 3 — top-down bot audit + fixes (ALL SHIPPED & DEPLOYED):**
  - **PR #72 MERGED ✅** (bot stage/lang/nudge + few-shot trim — details below).
  - **PR #73 MERGED ✅ — three audit fixes:**
    - 🔴 **Delivery blindness fixed:** MSG91's `2xx + requestId` only means ACCEPTED, not delivered — Meta can reject afterward (bad params, paused template, quality/limit, closed window) and the message silently vanishes (this was the "template sent but no msg" mystery). New `/api/webhook/status` handler receives MSG91 delivery reports, logs full payload, `console.error`s every FAILED, stamps `delivery_status`/`delivery_error` on the message row. **Migration `delivery_status_migration.sql` APPLIED to prod ✅ (founder ran it June 14 s3).** ⏳ **FOUNDER:** set the delivery-report webhook URL in MSG91 dashboard → `https://convorian.in/api/webhook/status` (without it MSG91 never reports failures).
    - 🔴 **Silent credit loss fixed:** `deductWABalance` + `sendWindowKeepalive` used the ANON Supabase client → blocked by RLS server-side (no logged-in user) → balance never deducted, no `wa_transactions` logged. Switched to `supabaseAdmin`. (Explains why some top-ups/charges never showed.)
    - 🟠 **Template source-of-truth:** `outreach.ts` `TEMPLATE_BODIES` is now canonical; `templateVars()` derives names+order from the body. `lead_new_match` = **4 NAMED vars** `customer_name, agency_name, area, property_type` (NOT the 3 numbered in the stale `TEMPLATE_SUITE.md`, now marked superseded). `/api/admin/test-template` auto-builds correct sample values when `values` omitted. **A manual test send with the WRONG (numbered-3) format is what failed to deliver earlier; the named-4 send delivered ✅.**
  - **PR #74 MERGED ✅ — foolproof GLM retry scheduler:** Live incident — a lead's 3rd rapid message hit `timeout of 20000ms exceeded` → canned "Thank you for reaching out" fallback. Root cause: old hedge waited 20s × 2 attempts, gave up at ~23s, wasting ~37s of the 60s webhook budget. New `runWithHedging` (pure, testable, in `lib/llm.ts`): per-attempt timeout 20s→**12s** (stalls rarely recover → kill & retry fresh), up to **6 attempts / max 2 concurrent** until an overall **deadline** (engine 40s; web chats demo+support pass **18s** so spinners don't hang). Foolproof: settle-once, all timers cleared, per-attempt timeout enforced in-scheduler, late results ignored, bounded by attempts AND deadline. **9 unit tests** in `tests/unit/llm-hedging.spec.ts` (88 total green).
  - **Diagnostic added (webhook):** every MSG91 inbound now logs `contentType=… uuid=present|EMPTY textLen=…` — to confirm whether button taps carry a stable `uuid`. ✅ **FIXED in PR #83:** content-dedup fallback added (60s window on same content when uuid absent). Diagnostic log still in place to monitor in Vercel logs.
  - **⏳ DEFERRED (founder decision):** LLM paid fallback (Bedrock + Claude API) — wait for AWS credits, then add as fallback when GLM stalls. Until then PR #74's retry makes GLM-only far more resilient.
- **June 14 bot improvements — PR #72 MERGED ✅ (was branch `feat/bot-stage-fewshot`):**
  - **Marathi/Hindi language detection OVERHAULED (PR #70 already merged ✅):** server-side `detectMessageLanguage()` runs BEFORE the LLM — detects Devanagari script, Latin-script Marathi (pahije/aahe/nako/mala/tumhi etc.), Latin-script Hindi (chahiye/mujhe/theek hai etc.). Critical bug fixed: `\b` word boundaries do NOT work with Devanagari in JS (Devanagari chars aren't `\w`), so Devanagari patterns no longer use `\b`. Root cause also fixed: `lead.language` was stored to DB but NEVER read back into the next turn's system prompt, so LLM re-detected from scratch every message. Now: hard `MANDATORY LANGUAGE DIRECTIVE` injected at top of system prompt + `lang` shown in LEAD PROFILE. 30-unit tests in `tests/unit/language-detection.spec.ts`.
  - **Stage detection FIXED:** bot was stuck in discovery loop for 15+ messages. Fix: `visit_booked` checked first (prevents re-asking discovery when visit is set); forced jump to `presentation` after 5 messages if ANY lead criteria exists (`intent || preferred_areas || budget_min`); `cold + messageCount > 6` → `nurture`. No longer interrogates indefinitely.
  - **History depth 8→12** for `generateBotReply` and `generateNudge` (DB fetch 10→14). More context without bloating much.
  - **Dedicated nudge prompt** for `generateNudge()` — focused on "re-engage a quiet lead" with intensity guides (soft/value/window_save) + examples. Previously used the same engine prompt as real replies.
  - **Few-shot examples TRIMMED (perf fix for the Shantanu-lead delay):** old examples included multi-line property cards = ~800 extra tokens for Marathi presentation stage, pushing prompt to 2800+ tokens and triggering GLM's 3s hedge on every consecutive message (double API call). Replaced with 1 compact one-liner per stage + 1 language example ≈ 150 tokens total. Also added `[engine] stage=X lang=Y prompt≈Ntok` log to every `generateBotReply` call — visible in Vercel logs for future diagnosis.
  - **PR #72 link:** https://github.com/shantanunitinkulkaarni-ts/claude-leadnest/pull/72 — needs CI green + founder merge.
- **June 14 batch 2 — SHIPPED (PR #68, merged + deployed):**
  - "Join 50+ agents" (false, pre-launch) → removed; replaced with honest copy
  - "Real numbers from real agents" → "Projected outcomes at scale"
  - "✓ Free for 14 days" → "✓ Free for 30 days"
  - WhatsApp CTA button now uses `NEXT_PUBLIC_SUPPORT_WHATSAPP` env var — hides if unset (no dead placeholder link). **`NEXT_PUBLIC_SUPPORT_WHATSAPP=917559197426` set in Vercel ✅** — button is live.
  - SEO foundation: full metadata in `layout.tsx` (Twitter card, canonical, icons, JSON-LD structured data, expanded keywords) + `app/opengraph-image.tsx`
  - `force-dynamic` added to agent + upload routes; register route hardcodes trial plan
  - Webhook: parses stringified button JSON; sends friendly "text only" nudge for non-text media
  - GitHub Actions updated to Node.js 24 (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`) across ci/db-backup/deploy workflows — ahead of June 16 forced migration
- **June 14 batch 1 — SHIPPED (button replies, honest onboarding, inbox template text):**
  - **MSG91 button-reply parsing — FIXED & CONFIRMED LIVE:** Quick-reply button taps (e.g. "Yes, share details") arrive with `contentType:"button"` and `text:""`. Parser now reads every plausible subfield (`button` as string, `.text`, `.payload`, `.title`, `.value`, `buttonText`, `button_text`, `interactive.button_reply.title`, etc.). Confirmed by founder — bot now replies to button taps. Code: `app/api/webhook/route.ts`.
  - **Onboarding screen rewritten (honest):** Step 3 ("Connect WhatsApp") no longer fakes a "Connected" flash. Copy now says "Our team activates it for you — usually within 24 hours." Agent sees "Submitted ✓" and a tip warning them not to use the same number in the WhatsApp app. Step 4 (done screen) says "We'll email you when your WhatsApp is live" and suggests adding properties in the meantime.
  - **New-signup alert to founder:** `/api/notify-signup` — called on every onboarding completion. Sends email to `support@convorian.in` with agency name, agent name, WhatsApp number, and a direct prompt to activate that number in MSG91 + set it in `/admin`. No signup slips past you. Code: `app/api/notify-signup/route.ts`.
  - **Inbox now shows real template text:** Template sends (re-engagement, appointment reminders, test tool) were logging a placeholder `[template: lead_new_match/en]`. Now `renderTemplate()` (`lib/outreach.ts`) fills the real approved body with lead/agent values and logs the actual message to the inbox. All three paths updated: cron re-engagement, reminder, and `/api/admin/test-template`.
- **Help/FAQ + support chat (June 11):** `/help` page (FAQ accordion via `lib/faq.ts`, shared chrome) LIVE. Support chat (floating bubble on dashboard + /help) is now real — Groq-grounded on the FAQ KB (`/api/support-chat`), degrades gracefully, and escalates to a human. Escalation surfaces WhatsApp + email (`lib/support.ts`). **WhatsApp number is a PLACEHOLDER** — until `NEXT_PUBLIC_SUPPORT_WHATSAPP` is set in Vercel it shows "WhatsApp support — launching soon" + email (no dead links). One-line swap when the business SIM arrives. LIVE.

## 2. PENDING ⏳

**🔴 IMMEDIATE — finish the photo fix (session 7, resume here):**
1. **Merge PR #93** (image→JPEG conversion). #87/#91/#92 already merged to main;
   #93 deployed to prod but not yet merged to main. `gh pr merge 93 --squash`.
2. **Fix existing photos** — founder re-uploaded JPEGs but the property edit screen
   APPENDS (doesn't replace), so old AVIF entries may still be on the property and
   would still fail. EITHER delete the old AVIF photos in the edit UI, OR run the
   backfill: `POST https://convorian.in/api/admin/convert-media` with header
   `Authorization: Bearer leadnest_cron_secret_dev_2026`, body `{"dry":true}` to
   preview then `{}` to convert.
3. **Create MSG91 delivery webhook** in dashboard → URL
   `https://convorian.in/api/webhook/status`, events: on failed, on api failed,
   on delivered, on sent. (Inbound stays on `/api/webhook`.) Without it we can't
   see delivery failures.
4. **Test:** send "photos pls" to the bot → confirm JPEGs arrive; read Vercel logs
   for `PHOTO:` + `[delivery-status]` lines to confirm `delivered` per image.
5. (Deferred) When Meta App Review lands, add `sendMetaImageById` (upload bytes →
   media-ID → send by ID) — the robust path competitors use. See plan file.

**Gates to first paying client:**
- App Review approval (then can message REAL leads — currently only 5 test recipients)
- Tech Provider approval (for clients to self-connect numbers; concierge onboarding works before this)
- A real WhatsApp number (founder) — **card DONE (Jupiter added to Meta account ✅)** so proactive/template messaging is unblocked once App Review lands
- **₹999 subscription billing** — ✅ **LIVE & TESTED (June 10)**. Founder completed a real UPI Autopay subscription end-to-end in production: Activate button → Checkout → mandate → webhook → status Active. Code: `lib/razorpay.ts`, `app/api/subscription/{create,cancel}`, `app/api/razorpay-webhook`, bot enforcement in `app/api/webhook`, UI in `BalanceScreen`. DB migration applied; webhook + RAZORPAY_PLAN_ID + RAZORPAY_WEBHOOK_SECRET configured in Razorpay/Vercel.
- First clients (outreach — see GTM/consent below)

**Quality/launch-readiness:**
- [x] Opt-in tracking · [x] Password reset · [x] Security audit · [x] Bot reliability · [x] Mobile · [x] Logo compression · [x] Error boundaries · [x] Sentry code · [x] TS errors fixed · [x] Dependabot
- [x] **Deployed** to production (convorian.in). Repo now `vercel link`-ed to project, so future deploys just need `vercel deploy --prod --yes` (logged in as shantanunitinkulkaarni-ts).
- [x] **Sentry DSN** live in Vercel + deployed.
- [x] **Branded email** — `lib/email.ts` built + deployed. Resend domain verified ✅. Nurture sequence live.
- [x] **Supabase Custom SMTP** — DONE (June 10). Auth/reset emails now send from "Convorian" via Resend. Verified by live password-reset test.
- [x] **Uptime monitor** — DONE (June 10). Better Uptime watching https://convorian.in, alerts → support@convorian.in.
- [x] **Daily DB backup (free)** — DONE (June 10). `.github/workflows/db-backup.yml` runs nightly 02:00 IST, pg_dump → GitHub artifact (90-day retention), SUPABASE_DB_URL secret set, test run verified (real 64KB dump). Supabase free plan has no native backups; upgrade to Pro for PITR when revenue allows.
- [x] **Tests + CI** — DONE (June 10). Playwright tests (`npm test`) + GitHub Actions CI (lint/typecheck/tests) on every PR. Process now: branch → PR → CI green → merge.
- [x] **CLAUDE.md briefing rewritten** (June 10) — every session now told to read HANDOFF.md first.
- [x] **Sentry MCP** — ACTIVE. OAuth done, tools live. Org `covorian` (EU region `de.sentry.io`). Checked: only 1 sample test error, no real production errors. Say "check my Sentry errors" anytime.
- [x] **CTO queue (1) Invoice/receipt screen** — DONE & LIVE (June 11).
- [x] **CTO queue (2) Help/FAQ page + support chat** — DONE & LIVE (June 11). Full ticketing/support team is a later phase (founder's call).
- [x] **June 14 batch committed + merged (PR #68) ✅** — SEO foundation (JSON-LD, Twitter card, canonical, opengraph image), honest landing copy, trial defaults, force-dynamic fixes, webhook button-reply + media nudge, GitHub Actions Node.js 24 opt-in.
- [x] **`NEXT_PUBLIC_SUPPORT_WHATSAPP=917559197426` set in Vercel ✅** — WhatsApp button live on landing page CTA + support chat widget.
- [ ] **IMMEDIATE: merge PR #72** (https://github.com/shantanunitinkulkaarni-ts/claude-leadnest/pull/72) — bot stage + language + nudge + delay fix. CI should be green. After merge, deploy (`vercel deploy --prod --yes`) and confirm Vercel logs show `[engine] stage=... lang=... prompt≈...tok` — token count should be ~500-700 for presentation stage (was 2500-2800 before).
- [ ] **NEXT UP (CTO queue): (3) deeper SEO** — per-page metadata for /login /onboarding etc; dynamic sitemap.

**Founder tasks:**
- Supabase → Auth → URL config: Site URL `https://convorian.in`; Redirect URLs add `/reset-password`, `/**`, `localhost:3003/**`
- Resend domain ✅ · Supabase Custom SMTP ✅ (June 10).
- Jupiter card ✅ added to Meta account. Clean WhatsApp number still needed.
- **Security cleanup — ✅ DONE (June 10).** Rotated ALL exposed secrets with zero downtime: GitHub token (removed from git remote, deleted on GitHub, now in Windows Credential Manager vault — git push/pull works via vault; for GitHub REST API calls retrieve token transiently via `git credential fill`), Groq key, Resend key, Supabase DB password (backup secret + Vercel updated), Supabase service-role key (migrated to NEW API key system: publishable `sb_publishable_...` + secret `sb_secret_...`; legacy JWT-based keys DISABLED in Supabase → old leaked key is dead). JWT signing key left untouched (no forced logouts). Local `.env` refreshed via `vercel env pull` — in sync with prod. Twilio skipped (unused). Verified: site 200, bot + DB working on new keys.
- Outreach to warm network (target 10 clients / ₹10k July; ₹999 monthly, skip annual for now)
- **Verify Supabase → Auth → URL config** (founder-only, can't check from code): Site URL `https://convorian.in`, redirects incl `/reset-password`, `/**`.

## SECURITY & COMPLIANCE (June 11 audit)
- **RLS now ON for ALL data tables** + tenant-scoped policies via `team_members`: agents, leads, messages, appointments, properties, wa_transactions, support_chat_logs, subscription_events, demo_rate_limits. (leads/messages/appointments/properties were RLS-OFF — fixed; were not publicly readable as anon/authenticated lacked SELECT, but now defense-in-depth.) App reads via service_role (bypasses RLS) so behaviour unchanged. Migrations: `rls_lockdown_migration.sql`, `rls_tenant_policies_migration.sql`.
- **Security headers** live (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). CSP still PENDING (needs testing vs Razorpay/Sentry).
- **Debug endpoint** `/api/test-integration` now CRON_SECRET-gated (was public).
- **SEO**: robots.txt + sitemap.xml live.
- **Consent**: onboarding now has a required Terms+Privacy+marketing consent checkbox; stored on agents (`consent_terms/consent_marketing/consent_at`). Privacy/Terms have the AI data-use clause. Migration: `consent_trial_migration.sql`.
- **30-day FREE TRIAL live (promo):** onboarding sets `plan_status='trial'`, `messages_limit=500`, `wa_balance=10` (₹10 starter), `plan_expires_at=+30d`. Webhook pauses the bot when a trial lapses (no paid sub). Nurture emails run across the 30 days → upgrade. Paying flips plan_status to 'active' via Razorpay webhook.
- ⏳ **Security PENDING:** CSP header; rate limiting on public routes (register/support-chat); add `middleware.ts` for page-level auth (defense-in-depth); periodic RLS cross-tenant test.

## 3. ENGINEERING MATURITY PLAN (do this properly — phased, not skipped)

> Context: we shipped fast to unblock launch (live, payments, WhatsApp). That was the right call to validate. Now we layer in proper SDLC hygiene **in parallel**. Prioritized for a solo non-technical founder on a budget — high-value/low-cost first; skip true-enterprise overkill.

**Phase A — Stability & Security ✅ COMPLETE:**
- [x] Security audit: upload auth fixed, agent API field-scoped, register validated
- [x] Bot reliability: Groq fallback, message dedup, lead insert null-check
- [x] Error boundaries across all dashboard screens
- [x] TypeScript: all errors fixed, `ignoreBuildErrors` removed

**Phase B — Observability & Safety net:**
- [x] **Sentry** code wired — needs DSN env var (founder action above)
- [x] **Dependabot** configured
- [x] **Uptime monitor** — Better Uptime live (June 10)
- [x] **Daily DB backups** — free GitHub Actions nightly pg_dump live + verified (June 10)
- [ ] **Staging environment** — use Vercel Preview deploys (branch → preview → verify → promote)

**Phase C — Testing & Process:**
- [x] **E2E tests (Playwright)** for the 3 critical flows — `tests/` dir. Smoke tests (landing/login/onboarding/legal render), payment-verify + signup validation guards, demo-bot graceful-degradation + live-reply (auto-skips without GROQ_API_KEY). Run `npm test`. 12 pass locally.
- [x] **CI on PRs** — `.github/workflows/ci.yml`: lint + typecheck + Playwright tests on every PR and push to main. Uploads Playwright report artifact. (Optional repo secrets: NEXT_PUBLIC_SUPABASE_*, GROQ_API_KEY — bot live-test skips if absent.)
- [x] **`npm run typecheck`** script added (`tsc --noEmit`).
- [ ] Deeper unit tests for billing signature HMAC + auth helpers (validation guards covered; happy-path signature still manual/staging)
- [ ] Branching + PR review discipline (stop committing straight to main once stable)
- [ ] CHANGELOG + keep this doc updated

> **Founder setup tasks (10 min total)** now itemized in `SETUP_TASKS.md`: Supabase Custom SMTP + Better Uptime monitor + backup check.

**Phase D — Scale/Maturity (later, when revenue justifies):**
- [ ] Rate limiting on all API routes; security headers (CSP etc.)
- [ ] PostHog product analytics
- [ ] Load testing; structured logging; incident runbook
- [ ] Data retention automation (DPDP); pen test
- [ ] Pvt Ltd + GST when crossing ₹20L / a client demands GST invoice

## 4. BOT ROADMAP (core moat — "gets smarter over time")

Vision (founder): an engine that **learns from conversations and customizes per client** — more relevant, better at closing, over time.
- **Now:** Groq + sophisticated prompt engineering (the IP is the prompting + stage logic).
- **Phase 1:** per-agent context (their properties, tone, areas) already feeds the prompt — deepen this so each client's bot feels tailored.
- **Phase 2:** capture which messages/conversations convert → feed back as few-shot examples per vertical/agent (lightweight "learning" without training).
  - **June 11 progress (support bot):** support-chat prompt overhauled to be empathetic + context-aware (WhatsApp launching-soon, refund handling). **Conversation logging LIVE** — every turn logged to `support_chat_logs` (table created in prod; `support_chat_logs_migration.sql`). This is the data foundation. **NEXT learning step:** retrieve best past answers (or thumbs-up rated ones — `helpful` column exists) as few-shot examples in the prompt. Same pattern can extend to the main WhatsApp lead bot.
- **Phase 3:** fine-tune an open model (Llama/Mistral) on anonymised winning conversations (with consent) → the "Convorian engine".
- ⏳ **PENDING (do at higher volume): few-shot + fine-tuning.** Foundations now in place — conversation logging LIVE + 👍/👎 feedback wired (`support_chat_logs.helpful`) + consent clause in Privacy/Terms (anonymised conversation data to improve AI, opt-out via privacy@convorian.in). Blocked on DATA VOLUME, not engineering: needs real client conversations first. When volume justifies, (1) few-shot the best 👍-rated answers into the prompt, then (2) fine-tune.
- **Data flywheel:** more agents → more conversations → better engine → more conversions → more agents. Protect it.
- Engine name TBD (Converge / Cortex — deferred).

## 5. GTM & CONSENT (critical — don't get banned)

- ⛔ **NEVER** scrape numbers and cold-WhatsApp them with templates → instant ban + kills the WABA. (Ironic for a compliance tool.)
- ✅ Get clients via **other channels** (calls, email, IG/LinkedIn DMs, agent FB/WhatsApp groups, click-to-WhatsApp ads) → they **message you first / sign up** = opt-in → then nurture.
- ✅ Add a **free trial** (e.g., 14 days) — solves "nurture then charge."
- Pricing: **₹999/mo** intro for first 20-30 clients. Annual deferred.
- Positioning: at ₹999, simple + reliable wins — agents don't expect enterprise; it just must work without bugs.

## 6. KEY FACTS / GOTCHAS

- **Deploy:** Vercel git auto-deploy is BROKEN (disconnected since May). Repo is `vercel link`-ed and CLI is logged in as `shantanunitinkulkaarni-ts`. Just run `vercel deploy --prod --yes` from `C:\LN\claude-leadnest` — no token needed while logged in. Token-based fallback: `vercel deploy --prod --yes --token <TOKEN>` with `VERCEL_ORG_ID=team_fzgmEXAaGXYbDzbWWLQAumJl`, `VERCEL_PROJECT_ID=prj_XeAX3KOfjGzNYS1lofHyRUpYhF08`.
- Vercel env changes need a redeploy to take effect.
- WhatsApp creds (phone_number_id, access_token) live **per-agent in the DB** (`agents` table), NOT env. `WHATSAPP_PROVIDER=meta` env (defaults to meta if missing).
- **MSG91 (BSP) — primary route for first 10-20 clients (June 11):** inbound detected per-request by payload shape (provider-agnostic). **Multi-agent routing LIVE:** inbound `integratedNumber` → agent via `agents.msg91_integrated_number` (digits-only; set per agency in the **/admin** panel "WhatsApp #" column). Fallback to `MSG91_TEST_AGENT_ID` env for single-number/founder-SIM setups. Outbound session replies (24h window) go via `sendViaMsg91` using the same integrated number. Env: `MSG91_AUTHKEY`. ⏳ **DEFERRED:** MSG91 proactive/**template** messaging (nurture, appointment reminders, re-engagement, keepalive) still routes via Meta/Twilio only — needs MSG91-approved templates + their template API (test once live number is in MSG91). Core live AI auto-reply does NOT depend on this.
- Don't SELECT `wa_access_token` in queries — safety classifier blocks secret reads.
- "permission denied for table X" = missing Postgres **GRANT**, not RLS.
- **June 13 batch 2 (founder's 16-issue list) — SHIPPED (needs `june13_batch2_migration.sql` applied to prod):** Property add panel: **possession status (ready/under-construction/new-launch/resale) + possession date**, **rental deposit**, optional **project website + AI-consent checkbox** (engine references the site only when consented — see `PROJECT_SITE_AI_PLAN.md` for the fetch phase), free-text **"other highlights"** (hospital/locality) — all fed into the engine prompt for every stage. Engine: **perfect Hindi + Marathi** rules (script + Latin, never mix), and **shares the agent's name+phone+hours when a lead asks for a human** (verified live). Billing: **GPT-style plan cards** (₹999/mo active, ₹799/yr "coming soon" disabled), **downloadable receipts for top-ups** (generalised `/api/subscription/receipt?txn_id=`), **emailed receipt copies** on top-up (payments/verify) and monthly charge (razorpay-webhook). Inbox: **conversations sorted hottest-first**. Global **search wired** (Topbar → leads+properties dropdown → opens lead in inbox via `convorian:open-lead`). **Add-lead consent disclaimer** strengthened (explicit Meta-ban warning, stores `consent_confirmed`). **Support ticketing** (`/api/support-ticket` + `support_tickets` table + form on /help, emails support@convorian.in + acks user). Support bot: anti-repetition + warm closing on "thanks" + **2-step feedback** (rating → optional reason on No / what-you-liked on Yes, stored in `support_chat_logs.feedback_note`); escalation card already fixed earlier. Help/legal **back button → dashboard** for logged-in users (`SmartBackLink`). Tutorial: **off-screen card + step 2-3-4 glitch fixed** (clamped placement, action steps pinned bottom-centre, spotlight no longer flashes to centre between nav). Visit feedback modal + appointment card **alignment fixed**. ⚠️ Marathi-in-Latin-letters is the one soft spot (sometimes replies English) — core Hindi/Marathi script is solid.
- **June 13 mega-batch (founder's 20-issue list) — SHIPPED:** engine: budget figures now exact-rupee rule (was writing ₹2L for "20k rent") + Indian formatting in UI; HARD office-hours guard in webhook (bot can no longer accept 8pm against 9-7 — refuses + offers in-window slot); Inbox auto-scrolls to latest on tab return; per-chat highlight chips (visit booked w/ date, urgent, hot, qualified); ROI dash fixed ("add a lead" no longer shows with leads present; emojis removed; responsive grid); profile menu redesigned (SVG icons, name+email header, deduped Settings/Billing, Help→/help); "WA Balance"→**Billing & Credits**; transaction history now REAL (new `/api/transactions` — was hardcoded `[]`, why ₹5 top-ups never showed); plan card polished; Settings no longer shows "awaiting Meta" to users; Properties no-photo emoji → professional SVG placeholder; feedback saves now check res.ok (silent failures were why "pending" stuck); tutorial rebuilt as persistent animated spotlight (no flash-bang) + replay doesn't re-lock action steps; **new logo/favicon extracted from `One page brochure.png`** (public/icon.png|webp, logo.png|webp, favicon.ico). Support chat: escalation card clears on resume, email button shows address + copies it, end-of-chat feedback replaces per-message thumbs, "launching soon" placeholder removed.
- **⏳ FOUNDER ACTIONS NEEDED (June 13 batch):** (1) **Support WhatsApp number**: set `NEXT_PUBLIC_SUPPORT_WHATSAPP` in Vercel = the 755… number (digits only, e.g. 9175xxxxxxx) + redeploy → WhatsApp button goes live in support chat. (2) **Master-number template alerts**: create+approve a WhatsApp template in MSG91 dashboard (suggested body: `🔴 Convorian — action needed: {{1}} ({{2}}) {{3}}`), then set `CONVORIAN_WA_NUMBER` (the 755 number) + `MSG91_ALERT_TEMPLATE` (template name) in Vercel → alert trio sends from Convorian master number outside 24h window (code path live in lib/alerts.ts + sendViaMsg91Template). (3) Test lead stuck in manual mode from old handover bug — Inbox → toggle "Resume bot".
- **High-priority alert trio (June 13):** `lib/alerts.ts` → `sendHighPriorityAlert(agent, …)` = **email + WhatsApp to the agent** (voice call slot reserved — MSG91 supports calls; only build if we stay with MSG91 post-Meta-approval). Founder rule: ROI-critical events always use the trio. WhatsApp routes per-agent (MSG91 integrated number → else Meta creds) so it survives the MSG91→Meta migration. Caveat: business-initiated WhatsApp outside a 24h session needs an approved template — until templates exist the WhatsApp leg may not deliver (email always paired). Used by the reschedule-handover alert in the webhook.
- **Handover fix (June 13): bot no longer goes silent after 3+ reschedules.** Old behaviour set `lead.bot_paused=true` (troll detection) → lead got NO replies ever again and the agent never noticed (silent activity-log row only). New: bot stays ON, refuses to move the appointment ("team will call to lock the final time"), answers everything else, agent gets ONE email alert (`type='human_handover'` activity row guards against repeats). Engine prompt gets a RESCHEDULING IS LOCKED section (via `reschedulingLocked` ctx, computed from activity_log count). Manual mode (Inbox toggle) still works for agent-initiated takeover. Hedge timer 4s→3s.
- **LLM engine (June 13 v2): GLM ONLY.** Founder decision: Gemini REMOVED (dead key, needs ₹1000 prepaid) and Groq REMOVED from all customer-facing paths (100k tokens/day free cap → mid-day canned replies to real leads; "not reliable"). Single provider: **GLM-4.5-Flash via `lib/llm.ts` (`glmChat`)** — used by the lead bot (`lib/gemini.ts`), support chat, and landing demo chat. Reliability = **hedged requests**: if the first GLM call hasn't answered in 4s, a parallel duplicate fires and the faster one wins (free-tier latency is spiky: median ~2s, ~1 in 8 calls stalls 12s+). Benchmarked: median 1.9s, max 3.0s over 10 calls. If BOTH attempts fail the webhook sends the polite canned fallback (rare). Groq now exists ONLY as the offline eval judge (`npm run eval` — dev tool, never customer-facing). `GROQ_API_KEY`/`GEMINI_API_KEY` can stay in Vercel (unused by runtime).
- **LLM engine (June 13): GLM PRIMARY.** Chain is now **GLM-4.5-Flash (Z.ai, free, `GLM_API_KEY`, thinking disabled) → Gemini (if key) → Groq**. Gemini key is DEAD (401 ACCOUNT_STATE_INVALID — founder declined ₹1000 prepaid; key kept as middle fallback in case it's ever fixed). Only `glm-4.5-flash` is free on the Z.ai key (other models 429 "recharge"). **CRITICAL PROMPT FIX (June 13): property inventory now in the prompt for ALL stages** — it was only in the `presentation` stage, so in every other stage the bot literally couldn't see prices and FABRICATED them (e.g. quoted ₹75L for a ₹95L flat). Verified 5/5 exact-price accuracy after fix. Also added "prices are sacred / inventory is complete" rules. **Vercel functions pinned to Tokyo `hnd1`** (vercel.json) — Supabase is ap-northeast-1; was running in US East = 2-3s of DB round-trips per reply. Webhook logs `Webhook Timing: engine took Xms / total Xms`.
- **LLM engine (June 12): MULTI-PROVIDER.** `lib/gemini.ts` → `callEngineLLM()` tries **Gemini Flash (`gemini-flash-latest`, free tier, thinking disabled) PRIMARY**, auto-falls back to **Groq (Llama 3.3 70B)** on any error/ratelimit/empty — so the bot never goes silent. Env: `GEMINI_API_KEY` (set in Vercel prod + .env as `Gemini_API_KEY`; code reads both). Plan: enable Gemini PAID billing (₹1000) at 5 paying clients (removes free-tier privacy caveat); later swap to Haiku/Sonnet (1-line provider add) if funds permit. `lib/whatsapp.ts` supports Meta + Twilio + **MSG91 (primary BSP)**.
- **EMAIL WAS FULLY BROKEN — FIXED (June 13):** `RESEND_FROM_EMAIL` still pointed at the dead **`leadnest.in`** domain (pre-rebrand), so EVERY transactional email 403'd silently — welcome, password reset, payment receipts, support tickets, nurture. Discovered via the nurture cron. Fixed: Vercel `RESEND_FROM_EMAIL` → **`Convorian <noreply@convorian.in>`** (convorian.in is the verified Resend domain) + redeploy. Confirmed emails now SEND. Also fixed a `failCount` regex bug in `lib/nurture.ts` (a `\d` collapsed to literal `d` in a template literal → fail markers stuck at `#fail1`, retried a bad send forever) — now string-parsed + bounded to 3 attempts, and the throw path is caught. Note: Resend free tier can 429 under burst; fine at normal cadence.
- **🟢 TEMPLATE RE-ENGAGEMENT IS LIVE (June 13): `MSG91_TEMPLATES_LIVE=true`.** All 6 templates approved (lead_new_match en/hi/mr, lead_visit_invite en, lead_final_touch en, visit_reminder en). Verified end-to-end with a real send to 916393260332. The bot now auto-re-engages quiet/window-closed leads with paid templates (context cadence, intensity-capped, credits-gated, daytime/IST) + appointment reminders via visit_reminder. **MSG91 NAMED-VARIABLE SEND FORMAT (learned the hard way — keep this):** components keyed by `body_1, body_2, …` (positional, in template order) AND each MUST include `parameter_name` matching the template's `{{var}}` name. Named-as-key (`{customer_name:…}`) → Meta "localizable_params (0)". Positional without name → "Parameter name is missing". Both together → delivers. Code: `sendViaMsg91Template` takes `{name,value}[]`. The agent alert template path (`lib/alerts.ts`) is now fixed — `sendViaMsg91Template` auto-assigns `parameter_name: String(i+1)` when given a plain `string[]`, so numbered templates (`{{1}}, {{2}}…`) work without changing the callers. Test tool: POST `/api/admin/test-template` (superadmin or CRON_SECRET).
- **TEMPLATE SUITE WIRED (June 13):** 6 templates designed (`TEMPLATE_SUITE.md`), named variables, white-label (agency_name var, NO Convorian footer — leads must never see "Convorian"), quick-reply buttons incl. "Talk to agent" + "Stop updates". **Approved so far: `lead_new_match` (en+hi), `lead_visit_invite` (en), `lead_final_touch` (en).** Pending: `visit_reminder` (utility), `lead_new_match` (mr). Engine wired: `pickTemplate()` (lib/outreach.ts) chooses template by lead state (qualified→visit_invite, late-touch→final_touch, else→new_match) + language (Devanagari→hi, else en) + fills named vars from lead/agent. `sendViaMsg91Template` now accepts a named map. Webhook: "Stop updates"/"अपडेट बंद करें"/"अपडेट बंद करा" → opt-out; "Talk to agent" reopens window→engine shares agent contact. **GATED OFF: `MSG91_TEMPLATES_LIVE=false`** in Vercel (+ `MSG91_TEMPLATE_COST=1`). ⚠️ Before flipping live: VERIFY MSG91's named-variable send format with a real send via **POST `/api/admin/test-template`** (superadmin-gated: `{integrated_number, to, template, language, values}`) — I'm not 100% sure MSG91 keys components by name vs body_N. If it fails, switch `sendViaMsg91Template` to positional. Then set `MSG91_TEMPLATES_LIVE=true`.
- **TEMPLATE RE-ENGAGEMENT ENGINE — BUILT (June 13), inert until template env set:** The post-24h paid-template nurture (the thing the credits wallet funds). `lib/outreach.ts` `decideOutreach()` scores each quiet, window-closed lead: decaying cadence (gaps grow), lead-value scaling (hot pursued harder), IST daytime + weekend fit, capped by agent `outreach_intensity` (gentle 3 / balanced 5 / persistent 8; **default persistent**), credits-gated. `/api/cron` section 1b sends the approved Marketing template via `sendViaMsg91Template`, `deductWABalance`, logs, bumps `template_touches`. A lead reply resets the whole lifecycle (`nurture_state='active'`). **Agent control:** Settings → "Lead follow-up intensity" (PIN-gated + spend disclaimer). **GO-LIVE = set env `MSG91_NURTURE_TEMPLATE` (name) + `MSG91_NURTURE_TEMPLATE_LANG` (e.g. `en`) + `MSG91_TEMPLATE_COST` (₹/send).** Until then it's inert (no sends). Migration: `template_nurture_migration.sql` (agents.outreach_intensity, leads.template_touches/last_template_at). Full design: `TEMPLATE_NURTURE_PLAN.md`. ⏳ Need from founder: the live template's name + variable count/order (MSG91 template-read API returns 401, can't introspect).
- **NURTURE / FOLLOW-UPS — PHASE 1 LIVE (June 13):** The bot now CHASES quiet leads. `generateNudge()` (lib/gemini.ts) writes ONE contextual, non-repeating re-engagement message; `/api/cron` sends them at **3h (soft) / 10h (value) / 23h (window-save)** after the lead's last message, only while the **24h window is open** (free-text, no template needed), only in **IST quiet hours 9 AM–8 PM**, max 3/window, never if it's the lead's turn. Counter resets on any inbound (webhook). **Provider-aware** via `sendToLead()` (MSG91 if `msg91_integrated_number` else Meta) — so it works for MSG91 clients (the old keepalive only worked for Meta). Appointment reminders + post-visit prompts also made provider-aware. **Opt-out**: webhook detects STOP/unsubscribe (tightened regex, EN+Hindi+Marathi) → `opted_in=false`, `nurture_state='opted_out'`, bot silenced + farewell sent. **Cadence driver = `.github/workflows/nurture-cron.yml` (every 15 min, free)** — Vercel Hobby's 1/day cron can't do this. ⚠️ FOUNDER: add **`CRON_SECRET`** repo secret (GitHub → Settings → Secrets → Actions, same value as Vercel's CRON_SECRET) or the Action fails. Migration: `nurture_migration.sql` (leads: `last_nudge_at`, `window_nudge_count`, `nurture_state`). ⏳ Phase 2 (outside-window Day3/7/14 re-engagement) needs approved templates — see below.
- **Webhook double-reply bug FIXED (June 12, PR pending):** root cause = Meta/MSG91 webhook retries + non-atomic message dedup + webhook had no `maxDuration` (Gemini's 25s timeout exceeded Vercel's default → killed mid-run → provider retried → two replies, one being the canned "Thank you for reaching out" fallback). Fix: `maxDuration=60` on webhook, Gemini timeout 25s→12s, atomic dedup via partial unique index on inbound `wa_message_id` (`messages_dedup_migration.sql` — MUST be applied to prod), robust engine reply/JSON parser (`parseEngineResponse`, handles code fences/multi-line JSON, unit-tested), outbound wa_message_id stamped by row id (old `.update().order().limit()` was a no-op ordering), office-hours check now IST not UTC. ⚠️ ALSO FOUND: **Groq free tier 100k tokens/day was EXHAUSTED on June 12** — when Gemini fails AND Groq is rate-limited the canned fallback fires; eval lab runs eat this budget fast. Consider Groq Dev Tier or running evals sparingly.
- **Prompt-training lab:** `npm run eval` (EVALS.md) runs the real engine prompt vs ~9 scenarios with an AI judge — run after any prompt change. Engine roadmap in `ENGINE_ROADMAP.md`; issue backlog (6 batches) in user memory.
- Vercel Hobby: cron max once/day (set `0 9 * * *`); deployment protection was disabled.
- Entity: individual/sole-proprietor, no GST. Razorpay onboarded as individual.
- Razorpay: real UPI QR only works in LIVE mode; test mode uses `success@razorpay`.
- AWS App Runner was set up then abandoned (account stuck activating; Vercel chosen). Workflow is manual-only.
