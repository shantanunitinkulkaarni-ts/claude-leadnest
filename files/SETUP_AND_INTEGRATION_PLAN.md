# Setup / Onboarding / Number-Integration / Billing — PLAN (review before building)

> Status: **PLAN ONLY. Nothing here is built.** Founder asked to plan this and review
> together before building. Written 2026-06-19.

This covers four linked questions:
1. The client setup/onboarding flow (what we collect + the steps we run).
2. **How do we connect TING's AI to each client's WhatsApp number?** (the critical one)
3. How the client's WhatsApp (MSG91) charges get paid + where our profit comes from.
4. The standard "is it working?" test checklist.

---

## 1. Setup / onboarding flow (concierge, pre-self-serve)

**Client side (exists today):** signs up on the website → onboarding → enters details →
sees "our team will connect your WhatsApp" → can explore the app.

**Our side (the setup form we collect — proposed fields):**
Name · WhatsApp number (prefer a NEW number) · Facebook login (for WABA) · already-active
WhatsApp on Meta? · business verified? (if not, collect docs) · website · full office address ·
official email · calling number (if different) · office hours · weekly off / holidays · team &
team members.

→ Most of these now have a home in the data model except **team members** (no table yet) and
the **setup form itself** (no internal tool yet — today it'd be a Google Form). The agent
card fields (office address, weekly off, holidays) were added this session.

**Build needed (later, after review):** an internal "client setup" form/table + a setup
checklist tracker on `/admin`.

---

## 2. ⭐ How we connect each client's number (the critical question)

**The problem you raised, restated:** connecting a new client's number on MSG91 is a manual,
credentialed process. Claude can't do it each time (needs an active subscription / live
session), and a free helper account is fragile if something breaks. So how do we make this
reliable and repeatable?

**Clarity on what's actually involved per client (MSG91 BSP model):**
- **Auth key:** MSG91 issues ONE account-level `authkey` for *your* MSG91 account. Every
  client number you add under your account uses the **same `MSG91_AUTHKEY`**. So adding a
  client does **not** mean a new auth key. ✅ (Already how the code works — one env key.)
- **Webhook:** the inbound + delivery webhooks are configured **per integrated number** in the
  MSG91 dashboard, but they all point to the **same URLs** (`/api/webhook`, `/api/webhook/status`).
  The code routes the right agent by the `integratedNumber` in the payload. So a new number =
  just set the same webhook URLs on it. ✅ (No new code per client.)
- **Templates:** template approval is **account-level on your MSG91/WABA**, reused across
  numbers — you don't re-approve per client. ✅ (One-time per template.)
- **So the ONLY genuinely manual step per client** is: in the MSG91 dashboard, add the client's
  WABA + number (signing in via their Facebook/Meta business), and then set the number in our
  `/admin` panel (`msg91_integrated_number`) so we route to that agent. The bot then works.

**Recommendation (phased):**
- **Now (v1, first ~10 clients):** keep it **concierge/manual** — you add the number on MSG91
  once, paste it into `/admin`, done. This is a 5-minute one-time step per client and does NOT
  need Claude or a subscription. The app already routes by number. Add a **setup-status tracker**
  on `/admin` (per client: number added? webhook set? test passed? balance? plan?) so the manual
  process is checklist-driven and nothing is missed. **This is the right v1 — don't over-build.**
- **Later (when volume justifies):** build a **self-serve connect panel** using MSG91's
  embedded-signup / partner API (if available on your plan) so a client connects their own
  number. This is the "proper panel to connect numbers automatically + check statuses" you
  mentioned. It depends on MSG91 partner/API access — **needs confirmation from MSG91** on what
  their API exposes for programmatic number onboarding. **Open question for you to ask MSG91.**
- **Eventually:** a **Meta Tech Provider** account (direct, no MSG91) gives full programmatic
  control. That's the long-term moat-friendly path but is a separate, heavier track.

**Bottom line:** you do NOT need Claude or a subscription to add numbers. One MSG91 account
(one auth key, shared webhooks, shared templates) serves all clients; per-client work is a
one-time manual "add number + paste into /admin." Automating that is a *later* panel, gated on
MSG91 partner-API availability.

---

## 3. Billing — who pays MSG91, and our profit (markup)

**Today:** client pays us (plan ₹999/mo) and tops up a WhatsApp wallet (`wa_balance`); we
deduct from it per paid template. But the actual MSG91 spend settlement isn't connected — we'd
manually ensure MSG91 has funds. That's fine at tiny scale, fragile beyond.

**The question:** how do we make sure the right amount reaches MSG91, and can we profit?

**Recommendation:**
- **Charge a markup on each message.** Set the client-facing per-message price (what we deduct
  from `wa_balance`) ABOVE the MSG91 cost. The difference is profit — especially valuable since
  the ₹999 plan is deliberately cheap. (The code already deducts a configurable
  `MSG91_TEMPLATE_COST` per send — make this the *client* price; track the *MSG91* cost
  separately for margin reporting.)
- **Prefer client-funded MSG91 wallet via auto top-up.** Cleanest: set up **UPI/card auto-pay
  with MSG91 for each client's wallet**, so MSG91 is funded directly and we're not the cash
  mediator for the raw WhatsApp cost — we only take our plan fee + message markup. This avoids
  us floating money and reconciliation headaches.
- **Interim (until MSG91 auto-settle is wired):** keep the wallet model, deduct the marked-up
  price, and **manually keep your single MSG91 account funded** from the pooled wallet income.
  Add a simple **margin report** (client price vs MSG91 cost) on `/admin`.
- **Long-term:** as a Meta Tech Provider you control billing fully and the markup model becomes
  first-class.

**Open questions for you:** (a) does MSG91 support per-client auto top-up via their API/dash?
(b) what's the exact MSG91 per-message cost (to set the markup)? (c) what markup % do you want?

---

## 4. Standard "is it working?" test checklist (to formalise on /admin later)
Send from our own number as a "customer" and verify, per new client:
- Bot replies; qualifies (area/budget/BHK); suggests matching property; sends photos; books a
  visit within office hours; confirmation fires; 24h window behaviour; template re-approach
  after silence; feedback → bot context; all alerts (visit/call/reschedule/urgency/unavailable)
  on WhatsApp + email; razorpay ₹1–2 test; plan/trial state correct; starter wallet balance.
→ Build this as a repeatable checklist + a one-click "run standard test questions" tool later.

---

## What I need from you to move from plan → build
1. Confirm the **concierge-now / self-serve-later** approach for number connection.
2. Ask MSG91: (a) programmatic number-onboarding API? (b) per-client wallet auto top-up? (c) exact per-message cost.
3. Decide the **message markup** (client price vs MSG91 cost).
4. Confirm we add a **team_members** table + internal **setup form/tracker** on `/admin`.
