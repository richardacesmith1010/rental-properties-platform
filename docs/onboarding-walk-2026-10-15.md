# Onboarding live walk — plan (Sprint 234, 2026-10-15)

**Goal:** a brand-new owner and a brand-new tenant go from sign-up to the first rent marked paid on
https://domusbase.com, with no help. Scorecard: Onboarding 68 → 80 needs exactly this walk plus fixes
for whatever it finds.

**Accounts (owner creates them by signing up; Claude never enters passwords):**
- Owner: `richard.ace.smith+walkowner@gmail.com` (pattern of the existing `+smoke*` accounts; owner confirms)
- Tenant: `richard.ace.smith+walktenant@gmail.com` (invited by the new owner from inside the app)
- Both land in Ace's Gmail. Use the **same Chrome** for each confirm/invite link (a different browser
  breaks the sign-in check and dumps the user on `/login?confirmed=true`).

**Money:** no real payments. The new owner does not connect Stripe, so the tenant sees "Online pay isn't on
yet" and uses "I paid this"; the owner marks it paid. Rent $1,200, lease starting today.

**Browser:** owner's Chrome (Claude in Chrome). Every screen: screenshot light + dark; phone width 375 px
for the main screens; note every moment where the next step is unclear (zero-friction rule).

## Walk (✅ = pass, ❌ = finding, ✋ = owner's one action)

### A. Owner sign-up
1. `/login` → Create account → Owner → email + ✋ password → "Check your email".
2. ✋ Owner clicks the confirm link in Gmail (same Chrome) → lands where? (expect `/onboarding`).
3. `/onboarding`: first + last name → continue.
4. `/owner/setup`: choose "Individual".
5. Add-home wizard: name, address, 1 unit ($1,200), tenant section on → tenant email `+walktenant`,
   start today, end +12 months. Save.
6. Owner Home: is the next step obvious? Is there any word about when the first rent shows up?

### B. Tenant join
7. Invite email arrives? (Resend; fallback Supabase). Check sender, subject, tenant name (guessed from email).
8. Owner signs out. ✋ Owner clicks the invite link in Gmail (same Chrome).
9. `/complete-profile`: ✋ password → `/onboarding` name → `/tenant`.
10. Tenant Home: lease shown? rent amount? "Online pay isn't on yet" copy clear?

### C. First rent
11. Owner signs back in (✋ password if needed). Find how to create this month's rent without waiting for
    the 08:00 UTC cron. Is it discoverable?
12. Tenant: rent due shows → "I paid this".
13. Owner: Rent row shows "Tenant says paid" → Mark paid → do → undo (if offered) → do again (L-016).
14. Tenant: shows paid; receipt opens (page + PDF).

### D. Close
15. Sentry clean for the walk window; Supabase rows for the two accounts look right (1 property, 1 unit,
    1 lease, 1 charge, 1 payment).
16. Keep both accounts as the designated onboarding test accounts (add to `docs/claude/reference.md`),
    or wipe them with the in-app account deletion — owner decides at the end.

## Known risks to watch (from the code map, 2026-10-15)
- K1 Setup wizard can fail after the invite is sent, leaving a half-made home (`unified-setup.ts:172-198`).
- K2 Join page always says "We emailed a sign-in link" even when no email went out.
- K3 A tenant who signs up alone at `/login` gets an account with no lease and no way to join.
- K4 No "first rent appears tomorrow" message after setup; manual generate link is hard to find.
- K5 Tenant name in the invite is guessed from the email address.
- K6 Due day is forced from the start date (≤ 28); "pays outside Domus" isn't in the wizard.

## Output
A findings table (step, what happened, screenshot, severity) → Sprint 235 fix packet for Codex →
re-walk the failed steps → re-score Onboarding.
