# Domus App Review notes and TestFlight test info (draft)

Draft by Claude, 2026-10-16. Nothing is entered in App Store Connect yet.
App: "Domus: Rent & Repairs", bundle `com.domusbase.app`. Free, US only. Business, then Productivity.
Sources: `docs/phone-readiness-plan-2026-10-16.md` (decisions table, sections 1 and 3, items 2, 5 and 8),
`apps/ios/PRIVACY-AUDIT.md`, `apps/ios/README.md`, `docs/sprint238b-codex-prompt.md`, and the code cited in section 6.
Sibling file: `docs/app-store/listing.md` (same `OWNER:` convention).

Counts are exact `len()` of the text inside each code block (Python, Unicode characters, newlines included).
Re-count after any edit. Search for `OWNER:` to find every item that waits on the owner.
Never write a real password in this file. Passwords go straight from `apps/web/.env.local` into App Store Connect.

**Paste only after** Sprints 238a, 238b and 238c are live and the demo accounts are seeded (section 5).

## 0. Owner items (one place)

| Item | Placeholder | Where it is used | Decision |
|---|---|---|---|
| Legal entity / seller name | `OWNER: legal entity name` | Copyright line, seller name on the store | Q3, Q9 |
| Copyright | 2026 `OWNER: legal entity name` | App Information (see `listing.md` section 9) | Q9 |
| Age rating answers | `OWNER: confirm age rating answers (draft 18+)` | Age Rating questionnaire (`listing.md` section 12) | Q8 |
| Demo owner email | `OWNER: APPREVIEW owner email` | Sign-in user name; review notes | Q10, after seeding |
| Demo owner password | `OWNER: APPREVIEW owner password` | Sign-in password; review notes | Q10, paste only in App Store Connect |
| Demo tenant email | `OWNER: APPREVIEW tenant email` | Review notes; Beta review notes | Q10, after seeding |
| Demo tenant password | `OWNER: APPREVIEW tenant password` | Review notes; Beta review notes | Q10, paste only in App Store Connect |
| Contact first name | `OWNER: first name` | Contact block | owner |
| Contact last name | `OWNER: last name` | Contact block | owner |
| Contact phone | `OWNER: phone number` | Contact block | owner types it (plan section 4, step 9) |
| Contact email | support@domusbase.com (`OWNER:` confirm you read this inbox) | Contact block | owner |

Demo credentials live in `apps/web/.env.local` as `APPREVIEW_*` once the seed runs (plan section 3, item 8).
Suggested names: `APPREVIEW_OWNER_EMAIL`, `APPREVIEW_OWNER_PASSWORD`, `APPREVIEW_TENANT_EMAIL`,
`APPREVIEW_TENANT_PASSWORD`. The seed sprint decides the final names.

## 1. App Review Information (App Store Connect → the app → version → App Review Information)

### 1a. Sign-in information

| Field | Value |
|---|---|
| Sign-in required | Yes |
| User name | `OWNER: APPREVIEW owner email` |
| Password | `OWNER: APPREVIEW owner password` |

App Store Connect holds one login. The tenant login goes inside the notes (1c).

### 1b. Contact information

| Field | Value |
|---|---|
| First name | `OWNER: first name` |
| Last name | `OWNER: last name` |
| Phone number | `OWNER: phone number` |
| Email | support@domusbase.com |

### 1c. Notes (paste as is after replacing each OWNER item; 3,194 / 4,000 with placeholders)

The order follows plan section 3, item 2: native features first; camera and offline last (weak 4.2 evidence).

```text
Thank you for reviewing Domus: Rent & Repairs.
Domus helps landlords and tenants run a rental home.
Owners track rent, repairs, leases and money.
Tenants pay rent, ask for repairs and message their landlord.

DEMO ACCOUNTS (fake homes and fake people)
Owner: [OWNER: APPREVIEW owner email] / [OWNER: APPREVIEW owner password]
Tenant: [OWNER: APPREVIEW tenant email] / [OWNER: APPREVIEW tenant password]
These accounts send no emails or alerts.

WHAT THE IPHONE APP ADDS
1. Face ID lock
After you sign in, Domus asks to use Face ID. Tap Use Face ID.
You can also turn it on in Settings → Security.
Leave the app, then come back. Domus stays locked until Face ID passes.
"Sign in with password" is always there as a backup.
Domus never sees Face ID data.

2. Native Plaid bank sheet
Sign in as the owner. On Home, tap "bank items to check".
On the Bank page, tap Connect a bank.
Plaid's own iPhone sheet opens (the Plaid LinkKit SDK).
You can close it at any time.

3. Universal link return
Some banks sign you in on their own site or app.
A universal link on domusbase.com brings you back into Domus.
The Plaid sheet then finishes linking the bank.

4. Share sheet for PDF and CSV files
Tenant: Rent tab → View Receipt → Download PDF.
Owner: More → Reports → open a report → scroll down → Export CSV.
The iPhone share sheet opens. Save the file or share it.

5. Camera and photos
Take a photo for a repair or a receipt.
Open a repair photo full size.
Press and hold it to save it to Photos.

6. Offline page
Open Domus with no internet.
Domus shows a page with a Try again button.

RENT IS A REAL-WORLD SERVICE (guideline 3.1.3(e))
Rent pays for a real home that people live in.
Tenants pay rent with Stripe inside the app.
Domus sells no digital goods and has no in-app purchases.
The app is free.
The demo rent is under $5 on purpose.
Online pay starts at $5, so no real money can move.

BANK CONNECT NEEDS A REAL BANK
Plaid is live, so it needs a real US bank.
Please do not connect a bank.
The demo owner already has sample bank items.
They wait under "Money to check" on the Bank page.
Tap "Yes, that's right" or "Not rental" on each one.

OWNER PAYOUT SETUP OPENS SAFARI
Go to Settings → Bank Account.
Tap Set up rent payments. Stripe opens in Safari.
Stripe asks for real ID details there. Please do not finish it.
Switch back to Domus to keep going.

MESSAGES
Messages are private between people on the same lease.
Owner: Inbox tab. Tenant: Messages tab.
To report abuse, email support@domusbase.com.
Or tap the ? button, then Send feedback.

ASK DOMUS (AI HELPER)
Owner: on Home, tap the ? button, then Ask Domus.
The first time, Domus asks before it sends anything.
It names Anthropic, the AI company that writes the answers.
Tap Allow or Not now. Not now sends nothing.
You can turn it off any time in Settings.

DELETE AN ACCOUNT
Owner: Settings → Account & Data → Delete my account.
Tenant: Settings → Your data → Delete my account.
Type DELETE, then tap Delete my account.
Domus signs you out right away.
We delete the account within 30 days.

NO PUSH ALERTS
Domus sends no push alerts in this version.

Help: support@domusbase.com or https://domusbase.com/support
Privacy: https://domusbase.com/privacy
```

### 1d. Attachment (optional)

A short Simulator screen recording helps the reviewer. Show:
1. the Face ID lock after leaving the app;
2. the Plaid sheet opening and closing;
3. the share sheet for a receipt PDF.

Claude records it with `xcrun simctl io booted recordVideo` while signed in as the demo owner.

## 2. TestFlight Test Information (App Store Connect → TestFlight → Test Information)

Internal testing (the owner's own iPhone) skips Beta App Review. External testing needs every field below.

| Field | Value |
|---|---|
| Beta App Description | 2b |
| Feedback Email | support@domusbase.com |
| Marketing URL | https://domusbase.com |
| Privacy Policy URL | https://domusbase.com/privacy (page is live; updated legal text waits on Q9) |
| Beta App Review contact | Same as 1b |
| Beta App Review sign-in | Same as 1a (demo owner) |
| Beta App Review notes | 2c |
| What to Test (per build) | 2d |

### 2b. Beta App Description (292 / 4,000)

```text
Domus helps you run a rental home.
Owners track rent, repairs, leases and money in one place.
Tenants pay rent, ask for repairs and message their landlord.
This test build is the new Domus iPhone app.
It adds a Face ID lock, a bank sheet and file sharing.
Tell us what works and what breaks.
```

### 2c. Beta App Review notes (paste after replacing each OWNER item; 606 / 4,000 with placeholders)

```text
Domus is a rental-home app for landlords and tenants.
Sign in with the demo owner account above.
Demo tenant: [OWNER: APPREVIEW tenant email] / [OWNER: APPREVIEW tenant password]
Both accounts use fake homes and fake people.

iPhone features to try:
Face ID lock: Settings → Security.
Native Plaid bank sheet: Home → "bank items to check" → Connect a bank.
Share sheet: More → Reports → open a report → scroll down → Export CSV.

Plaid is live, so please do not connect a real bank.
The demo rent is under $5, so no real money can move.
Messages are private between people on the same lease.
Help: support@domusbase.com
```

### 2d. What to Test, build 2 (871 / 4,000)

Update this block for each new build. Build 2 is the first upload (`apps/ios/build-number.txt` is at 1).

```text
Thanks for testing Domus on iPhone!
Sign in with your Domus email and password.

Please try these:
1. Face ID: after you sign in, tap Use Face ID.
   Leave the app, then come back. It should ask for Face ID.
2. Save a photo: open a repair photo full size.
   Press and hold it, then save it to Photos.
3. Camera: take a photo for a repair or a receipt.
4. Files: open a rent receipt and tap Download PDF.
   The share sheet should open. Save the file or share it.
5. Offline: fully close Domus. Turn on Airplane Mode.
   Open Domus. It should say "Can't reach Domus right now."
   Turn Airplane Mode off and tap Try again.
   You should land back in Domus.
6. Owners only: on the Bank page, tap Connect a bank.
   Only connect a bank that is yours.

To send us a note, take a screenshot.
TestFlight lets you add a comment to it.
You can also email support@domusbase.com.
```

## 3. Copy check

- Every sentence in the code blocks has at most 12 words (arrows not counted). Labels and URLs are exact.
- Only these links and emails appear: https://domusbase.com, https://domusbase.com/support,
  https://domusbase.com/privacy, support@domusbase.com.
- "Plaid LinkKit SDK", "universal link" and "guideline 3.1.3(e)" are for Apple's reviewer, not app users.
- Labels in quotes or after an arrow are copied from the app. Re-check them after Sprint 238d, which renames
  the tenant "Problems" tab to "Repairs" (P7) and the owner "Inbox" tab to "Messages" (P4)
  (`docs/sprint238d-codex-prompt.md:46-50`). If 238d ships first, change "Owner: Inbox tab" in 1c.

## 4. What must be true before pasting

1. **Sprint 238a in the uploaded build:** UserDefaults in the privacy manifest; Photos-add string (no crash on Save to
   Photos); camera text "Take photos of repairs, receipts, and your profile."; offline Try again goes to `/login`.
2. **Sprint 238b live:** "Delete my account" in Settings → Your data (tenant, manager) and at the top of Settings →
   Account & Data (owner). Type DELETE; sign-out; 30-day notice (`docs/sprint238b-codex-prompt.md:51-72`).
3. **Sprint 238c live:** Ask Domus consent sheet naming Anthropic; Settings on/off switch; `/support` returns 200.
   Until `/support` is live, change the Help line to https://domusbase.com.
4. **Universal links live:** verified 2026-10-16 — `APPLE_APP_ID` is set on Vercel and the AASA route returns 200 JSON. ✅
   The route returns 404 when the variable is missing
   (`apps/web/app/.well-known/apple-app-site-association/route.ts`). If it is not live, delete item 3 from 1c.
5. **Demo seed done (Q10 yes):** see section 5.
6. **Simulator walk as each demo account:** tap every path in 1c and 2c. Fix any label that changed.
7. **Re-count** each block after any edit and update the counts in the headings.

## 5. Demo account data the seed must create (plan section 3, item 8)

The notes promise these things, so the seed (`scripts/seed-smoke-accounts.mjs`, `appreview` graph) must create them:

| Promise in the notes | Seed needs | Why (code) |
|---|---|---|
| Fake homes and fake people; no emails | Non-personal addresses, `email_confirm` set, fake names | plan section 3, item 8 |
| Rent under $5; no real money moves | Monthly rent below 500 cents | `apps/web/lib/payment-fees.ts:13`, `apps/web/lib/tenant-pay-state.ts:24` |
| Tenant → View Receipt → Download PDF | At least one past paid (recorded) rent for the tenant | `apps/web/app/tenant/page.tsx:398-400` |
| Home → "bank items to check"; items under "Money to check" | Rows in `bank_review_items` for the demo owner's bank account. A file upload does not queue items (`apps/web/lib/bank-feed/process-upload.ts` returns them to the page only), so the seed must insert these rows | `apps/web/components/dashboard/owner-home/needs-you-list.tsx:30-31`, `apps/web/lib/owner-wallet-home.ts:36-46`, `apps/web/components/bank-feed/queued-review-list.tsx:27-28` |
| Owner → Reports → Export CSV | Rent and payment rows so reports are not empty | `apps/web/components/reports/report-layout.tsx:97` |
| Settings → Bank Account → Set up rent payments | Demo owner not connected to Stripe | `apps/web/components/settings/bank-settings.tsx:70-73` |
| Messages tab / Inbox tab | One message thread between the demo owner and tenant | `apps/web/app/tenant/page.tsx:279` |
| Repair photo to press and hold | One open repair with a photo | `apps/web/components/dashboard/maintenance/photo-upload.tsx` |

## 6. Evidence for each claim in the notes

Paths are repo-relative.

| Claim | Evidence |
|---|---|
| Face ID offer "Use Face ID" / "Not now" | `apps/ios/ios/App/App/AppLockController.swift:131-140` |
| Face ID switch in Settings → Security | `apps/web/components/settings/settings-layout.tsx:33`, `apps/web/components/settings/face-id-settings.tsx:64` |
| Lock screen "Sign in with password" | `apps/ios/ios/App/App/LockViewController.swift:54` |
| Face ID stays on the phone | `apps/ios/README.md` (Face ID section); LocalAuthentication only |
| Native Plaid LinkKit sheet | `apps/ios/ios/App/App/PlaidLinkBridge.swift`; `apps/web/components/bank-feed/bank-connections-card.tsx:126-127` |
| Universal link return | `apps/ios/ios/App/App/App.entitlements:6`; AASA route above; `apps/ios/README.md` (Universal Links) |
| PDF/CSV share sheet | `apps/ios/ios/App/App/DownloadHandler.swift`; `apps/web/app/payments/receipt/[chargeId]/page.tsx:216-222` |
| Reports in the owner More menu | `apps/web/components/dashboard/sidebar/nav-items.ts:229-236` |
| Sample bank items under "Money to check" | `apps/web/components/bank-feed/queued-review-list.tsx:27-28`; buttons in `apps/web/components/bank-feed/review-card.tsx:121-125`; seeded `bank_review_items` (section 5) |
| Offline page text "Can't reach Domus right now." | `apps/ios/www/offline.html:26-28`; shown when a page fails to load (`apps/ios/README.md:115-121`) |
| Stripe payout setup opens Safari | `apps/ios/README.md` (Native navigation: Connect opens Safari); `bank-settings.tsx:72` |
| Messages tab for tenants | `apps/web/components/dashboard/tenant-bottom-bar.tsx:8-13` |
| ? button → Ask Domus / Send feedback | `apps/web/components/help-menu.tsx:97-109`; `apps/web/components/feedback/feedback-button.tsx:66` |
| Ask Domus names Anthropic, asks first | Sprint 238c (plan section 2, Sprint B) |
| Delete my account, 30 days | Sprint 238b (`docs/sprint238b-codex-prompt.md:51-72`) |
| No push alerts | Decision Q5; `apps/ios/README.md:6` "Notifications remain off" |
| Messages private to the lease; report via support@ | Plan section 3, item 2 (ASR verdict) |
