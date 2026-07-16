# Stripe Live Mode Switchover Checklist

No code changes needed — the app reads all Stripe config from environment variables.

## Prerequisites

- [ ] Stripe account fully activated (not just sandbox/test)
- [ ] Bank account connected in Stripe Dashboard for payouts
- [ ] Business details verified in Stripe

## Steps

### 1. Get Live API Keys
1. Go to https://dashboard.stripe.com/apikeys
2. Toggle from "Test mode" to "Live mode" (top-right toggle)
3. Copy the **Secret key** (starts with `sk_live_`)
4. Copy the **Publishable key** (starts with `pk_live_`)

### 2. Create Live Webhook Endpoint
1. Go to https://dashboard.stripe.com/webhooks
2. Make sure you're in **Live mode**
3. Click "Add endpoint"
4. URL: `https://domusbase.com/api/webhooks/stripe`
5. Select these events:
   - `checkout.session.completed`
   - `account.updated`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
6. Click "Add endpoint"
7. Copy the **Signing secret** (starts with `whsec_`)

### 3. Update Vercel Environment Variables
1. Go to https://vercel.com → your project → Settings → Environment Variables
2. Update these three variables (for Production environment):
   - `STRIPE_SECRET_KEY` → paste the `sk_live_` key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → paste the `pk_live_` key
   - `STRIPE_WEBHOOK_SECRET` → paste the `whsec_` key from the live webhook
3. Click Save

### 4. Redeploy
Run: `npx vercel deploy --prod --yes`
Or push any commit — Vercel will pick up the new env vars on next deploy.

### 5. Verify
1. Visit https://domusbase.com/api/health — should show `stripe: true`
2. Try a test payment flow end-to-end with a real card

## Important Notes

- **Stripe Connect:** Your existing Express accounts were created in test mode. New owners will need to onboard fresh in live mode. Test accounts do not carry over.
- **Existing test data:** Test charges, payments, and autopay enrollments reference test-mode Stripe objects. They'll still display in the app but won't be actionable in live mode. Consider this when testing.
- **Rollback:** To switch back to test mode, just restore the `sk_test_` / `pk_test_` / `whsec_` values in Vercel and redeploy.
