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

## Results — walked 2026-10-15 04:22–04:50 UTC (owner's Chrome, desktop 1440 px)

**Outcome:** the full path works end to end. Owner sign-up → confirm → profile → Individual → home + unit +
lease + invite → tenant invite email → tenant join → rent posted → tenant "I paid this" → owner sees
"Tenant says paid" → Mark paid. DB matches exactly (1 account, 1 home, lease $1,200 due 15th, Oct paid with
tenant report + 1 cash payment, Nov pending, invite accepted). Sentry clean. Not walked: tenant receipt
after payment (C14), dark-mode screenshots (theme smoke covers these pages), 375 px.

### Findings
| # | Sev | Step | What happened |
|---|---|---|---|
| F17 | **Major** | C12 | Tenant Home after first rent: "Rent due **$2,400 · 2 months**, due Oct 15 · today" — November (due Nov 15) counted as due now. Day-one tenant is told they owe double. |
| F15 | **Major** | C11 | Owner Rent page: "No rent yet. Rent will appear here after you create a lease." although a lease exists. No way to post the first rent: the Generate link is hidden in the owner's simple view (`charge-section-controls.tsx:46` `!simpleRentView`). Owner waits for the 08:00 UTC cron with no explanation (K4). |
| F19 | **Major** | C13 | No undo for "Mark paid": paid row menu has only Message / Add to next bill; no void/undo action exists in `app/actions`. |
| K5 | **Major** | A5, B7, B9 | Tenant name guessed from email: owner card and invite email say "Richard Ace Smith+walktenant"; tenant's form prefilled "Richard" / "Ace Smith+walktenant". Wizard has no tenant name field. |
| F3 | **Major (config)** | A1 | Sign-up confirmation comes from `noreply@mail.app.supabase.io`, subject "Confirm Your Signup" (Supabase default SMTP, low hourly limit). Invite emails already use Resend `notifications@domusbase.com`. |
| F5 | Medium | A3 | Owner profile "First Name" prefilled with `richard.ace.smith+walkowner`. |
| K6 | Medium | A5 | Wizard has no "tenant pays outside Domus" choice and no due-day choice (due day = start date). |
| F8 | Medium | A5 | Success screen: "Your home is added." twice; pushes "Connect your bank" without saying why; doesn't say the tenant was invited. |
| F10 | Medium | A6 | Home card doesn't show the tenant hasn't joined yet ("Invite sent"). |
| F13 | Medium | B10 | Tenant: "You can pay once it's posted." — jargon, no date. |
| F9 | Low | A6 | "Go to Dashboard" lands on Homes, not Home. |
| F16 | Low | C11 | Generate made Oct + Nov; both under "Due soon (2)". |
| F12 | Low | B8 | Invite email promises "pay rent" though online pay is off for this owner. |
| F1/F2 | Low | A1 | Sign-up step 2 still asks "what brings you to Domus?" and doesn't show the chosen role; password rules not shown until broken. |
| F7/F11 | Low | A5, B7 | Dates shown `2026-10-15`; invite rent "$1200.00". |
| F18 | Low | C13 | "Manual payment recorded." (jargon). |
| F4 | Low | A2 | Confirm email logo purple vs app blue. |
| F14 | Check | C11 | Login page has two Email/Password forms in the accessibility tree. |

### Passed cleanly
Role picker; check-email screen with resend; confirm link → `/onboarding`; account-type screen; setup
checklist with one obvious "Add Your First Home"; 4-step wizard with progress + review; invite email
delivered in seconds; tenant welcome page with property/unit/rent context; tenant Home layout; "Online pay
isn't on yet … Pay them the way you usually do"; "I paid this" → "Sent. Your landlord will check and mark it
paid."; owner badge "Tenant says paid · Oct 15"; inline Mark paid form.
