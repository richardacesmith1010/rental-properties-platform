# Stage 1 side notes — backup claim (Gate 1 item 6) and tenant card fee code map (Gate 1 item 3) — 2026-10-30

By the linked Stage 1 session; read-only research. Nothing applied (L-041: the "Agreement" session drives the checkout
and edits the shared docs).

## 1. The "daily backups" claim is false today — ready-to-apply wording
- Claim: `docs/policies/information-security-policy.md` §12 says "**Backups:** Supabase takes daily database backups."
  `docs/policies/data-retention-policy.md` §3 (backups row) and §6 assume backups exist.
- Fact (Supabase docs, https://supabase.com/docs/guides/platform/backups, read 2026-10-30 through the Supabase MCP): "We
  automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis … We recommend that free tier
  plan projects regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups."
  The Supabase org plan (MCP `get_organization`) is **free**.
- Wording that makes the claim true with no money (Supabase Pro stays in Gate 3):
  - Security policy §12, replace the Backups line with:
    "**Backups:** none are automatic today. Our database plan (Supabase Free) takes no automatic backups; Supabase backs
    up only Pro, Team and Enterprise projects daily (https://supabase.com/docs/guides/platform/backups, checked
    2026-10-30). Moving to a plan with daily backups (Supabase Pro) is an owner step before paying customers (stage
    gate 3)."
  - Retention policy §3 backups row, middle cell: "None today: the Free plan takes no automatic backups. On a paid plan
    (planned before paying customers): Supabase's window, 7 days on Pro".
  - Retention policy §6 Backups bullet, start with: "None exist on the current plan. Once daily backups are on, they
    expire on their own schedule."
- Owner follow-up: if the Plaid production questionnaire repeated "daily backups", correct it there too.
- Optional interim protection (owner step, no money): a nightly `supabase db dump` from GitHub Actions needs the
  database connection string as a GitHub secret (the owner pastes it once).

## 2. Tenant card fee — where it lives (for the "landlord pays card cost" packet)
- `apps/web/lib/payment-fees.ts:5–49` — `calculateCardFee` grosses the tenant up: total =
  ceil((base + 30¢) / (1 − 2.9%)); `MIN_ONLINE_PAYMENT_CENTS` = 500.
- `apps/web/app/actions/charges.ts:43–110` — `payWithCard`: Checkout `amountCents: totalCents`; destination charge to
  the owner's connected account (`transferDataDestination`, no `on_behalf_of`, so Domus is the merchant of record);
  `applicationFeeAmountCents = cardFeeCents + effectiveManagerFee`; metadata `processing_fee_cents`,
  `base_amount_cents`. `payWithACH` (about lines 120–195) adds no fee.
- `apps/web/lib/stripe.ts:107–140` — builds the session; an application fee requires a destination.
- `apps/web/lib/stripe-webhook-handlers.ts:272–273` — records the payment at `base_amount_cents`, so rent is credited
  at base today.
- `apps/web/components/dashboard/pay-rent-card.tsx:182, 275, 315` — shows "Card fee: … Total today: …" for cards and
  "No processing fee" for bank.
- Sketch of "landlord pays": the tenant pays base; `application_fee_amount` = card cost on base (+ manager fee); the
  owner nets base − card cost − manager fee; the ledger still credits base; the owner sees a "Card cost" line; Terms and
  payout copy say who pays. That clears the tenant side of the C.R.S. 6-1-737, Visa 5.5.1 and C.R.S. 5-2-212 rows. Check
  that `application_fee_amount ≤ amount` still holds at the $5 minimum, and that international-card fees (+1.5%) now
  fall on the platform.
