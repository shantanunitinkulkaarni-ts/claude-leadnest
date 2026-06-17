# ₹999/month Subscription — Go-Live Checklist (Founder)

The code is built and deployed. To switch it on, do these **one-time** steps in your
Razorpay Dashboard + Vercel. ~15 minutes. Until these are done, the "Activate plan"
button shows a friendly "not configured yet" message (it won't break anything).

---

## 1. Enable Subscriptions on your Razorpay account
- Razorpay Dashboard → **Subscriptions** (left menu).
- If it asks you to **request activation / accept terms**, do it. (Subscriptions + UPI
  Autopay must be enabled on a LIVE account — may take Razorpay a short review.)

## 2. Create the ₹999/month Plan
- Razorpay Dashboard → **Subscriptions → Plans → Create Plan**.
- Settings:
  - **Billing frequency:** Monthly, interval 1
  - **Amount:** ₹999
  - **Plan name:** Convorian Monthly
- Save. Copy the **Plan ID** — it looks like `plan_XXXXXXXXXXXX`.

## 3. Create a Webhook
- Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**.
- **Webhook URL:** `https://convorian.in/api/razorpay-webhook`
- **Secret:** make up a strong random string (e.g. a long password). **Save a copy** —
  you'll paste it into Vercel in step 4.
- **Active events** — tick these:
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.cancelled`
  - `subscription.completed`
- Save.

## 4. Add 2 values to Vercel
- Vercel → your Convorian project → **Settings → Environment Variables** (Production).
- Add:
  | Name | Value |
  |------|-------|
  | `RAZORPAY_PLAN_ID` | the `plan_XXXX` from step 2 |
  | `RAZORPAY_WEBHOOK_SECRET` | the secret string from step 3 |
- (You already have `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` set.)
- **Redeploy** so the new vars take effect: `vercel deploy --prod --yes` from `C:\LN\claude-leadnest`.

## 5. Run the database migration
- Supabase → **SQL Editor** → paste the contents of `subscription_migration.sql` → **Run**.
  (Adds the subscription columns. Safe to re-run.)

---

## How it works once live
1. Agent goes to **dashboard → Balance/Plan**, clicks **Activate plan — ₹999/mo**.
2. Razorpay Checkout opens; they authorise a **UPI Autopay mandate** (₹999 now + monthly).
3. Razorpay auto-charges ₹999 every month. Our webhook extends their access automatically.
4. If a charge fails repeatedly, Razorpay "halts" the subscription → our bot **pauses** for
   that agent until they re-activate.
5. Agent can **Cancel** anytime — they keep access until the end of the paid period.

## Test it (test mode first, recommended)
- Use Razorpay **Test mode** keys + a test Plan to dry-run the flow without real money,
  then repeat the Plan/Webhook setup in **Live mode**.
- UPI Autopay test: Razorpay provides test VPAs in their docs for mandate authorisation.

## Note on the free-trial / enforcement choice (CTO flag)
Right now the bot pauses only when a subscription is **halted** or **cancelled-and-expired**.
New signups currently get `plan_status = 'active'` for 30 days, so they are NOT force-paused
before subscribing (acts as a soft trial, and protects the Meta-review demo account).
**When you want to *require* payment after a trial**, tell me and I'll add an explicit
`trial` status + enforcement — kept separate so it can never accidentally pause the demo.
