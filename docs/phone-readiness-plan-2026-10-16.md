# iPhone readiness plan — 2026-10-16

Built from a 30-agent readiness audit (privacy, App Review guidelines, App Store Connect/TestFlight prep, build health;
every blocker/high finding adversarially verified, none refuted) plus Claude's Simulator walk
(`docs/phone-walk-2026-10-16.md`).

## Decisions taken under standing authority (owner may override any)
| Q | Decision | Why |
|---|---|---|
| 1 Store name | "Domus: Rent & Repairs" (home-screen name stays "Domus") | "Domus" is taken; owner types/approves it on the Create form anyway |
| 2 Deletion | In-app **request**, completed by hand within 30 days; confirm by typing DELETE (no password re-entry — zero-friction rule) | Apple 5.1.1(v) accepts in-app initiation with a stated timeline; avoids legal retention decisions |
| 4 Camera text | "Take photos of repairs, receipts, and your profile." | plain, accurate |
| 5 Push / 4.2 | No push (no-notifications rule); strong review notes | owner rule |
| 6 Analytics | Vercel Analytics off inside the iPhone app; drop Device ID / Browsing History label rows | simpler privacy label |
| 7 Credit info | keep declaring | screening notes are free text |
| 10 Demo accounts | create separate fake App Review owner + tenant on production (no emails sent) | needed for review; fake data only |
| 11 Store setup | Business → Productivity; Free; US only; Mac/Vision off | defaults |

**Left for the owner:** 3 (individual vs LLC developer account), 8 (age rating answers, drafted 18+), 9 (legal entity
name, retention years, response time, publish/lawyer).

## Sprint order (Codex runs one at a time)
1. **238a — iPhone shell privacy + upload safety + launch screen** (L3 iPhone): UserDefaults in PrivacyInfo (blocker B1),
   Photos-add string (crash), camera string, stale docs, offline retry → /login, archive URL guard, splash stays until
   the first page loads (walk P1).
2. **238b — in-app account deletion request** (L3): all roles; migration `account_deletion_requests`; runbook.
3. **238c — store requirements** (L3): Privacy/Terms links, Ask Domus consent (`profiles.ai_consent_at`), `/support`,
   `accept` attributes, analytics off in app.
4. **238d — phone UI polish** (L2): safe-area headers (P3), help button overlap (P2), tenant "Problem" → "Repair" (P7),
   tab/page naming (P4), pill clipping (P5), repeated "Next rent" (P8), "Back to Workspace" (P10).
5. **237c — manager follow-ups** (L2/L3): invite email allowlist-only, all-homes invite, Domus owners in Clients, menu
   (~6 + More) with a phone tab bar (P9), Wallet manager Home, reminder switch toggle style, Install card overlap.

# Domus iPhone readiness plan (2026-10-16)

Sources: four audits (privacy, App Review, listing/TestFlight, build health). Every blocker and high finding was checked by an adversarial reviewer, and none was refuted. Severities below use each verdict's `corrected_severity`. Overlapping findings are merged and their IDs listed together.

---

## 1) Verdict: can a TestFlight build go up now?

**No.** Two blockers stop the first upload.

| # | Blocker | Fix | Who |
|---|---|---|---|
| B1 | The privacy manifest does not declare UserDefaults. Face ID lock uses it (`AppLock.swift:10-28`), but `PrivacyInfo.xcprivacy:242` has an empty `NSPrivacyAccessedAPITypes`. That means ITMS-91053. (PRIV-1, ASR-02, IOS-1 = blocker; ASC-01 = high) | Sprint A | Codex |
| B2 | There is no App Store Connect app record for `com.domusbase.app`, so the export with `destination=upload` fails. (ASC-02) | One click | Owner |

Upload-day details:
- `testflight.sh:138-141` refuses to run while `apps/ios` has uncommitted changes. Sprint A must be committed first.
- The Mac has no Apple Distribution certificate, so the first upload may show a keychain prompt (ASC-18). The owner needs to be at the Mac.
- The build counter is at 1 (`apps/ios/build-number.txt`), so the first upload will be build 2.

**What each stage needs:**

| Stage | Still blocked by |
|---|---|
| Internal TestFlight (owner's own iPhone) | B1, B2, keychain click. Internal testing skips App Review. |
| External TestFlight (Alia, siblings) | Same, plus Beta App Review: test info, demo account (ASC-13, ASC-11). Fix PRIV-5 (crash) first. |
| App Store submission | Everything in sections 2–4, plus the owner's 5.1.1(ix) account decision. |

PRIV-5 is a crash, not an upload blocker. It ships in Sprint A so no tester hits it.

---

## 2) Blockers and high items fixed by code (3 Codex sprints, all L3 + `/chatgpt-review`)

Run them in order **A → C → B**. B and C cannot run in parallel because both edit `your-data-settings.tsx`.

### Sprint A: iPhone shell privacy and upload safety (unblocks TestFlight)

**Items**
- **B1, manifest UserDefaults** (PRIV-1/ASR-02/ASC-01/IOS-1, blocker). Add one entry:
  - `NSPrivacyAccessedAPIType = NSPrivacyAccessedAPICategoryUserDefaults`
  - `NSPrivacyAccessedAPITypeReasons = [CA92.1]`
  - Don't rely on the LinkKitSub bundle's manifest to cover this (ASC-01 verdict).
- **PRIV-5, Photos write string** (high). Add `NSPhotoLibraryAddUsageDescription` = "Save photos from Domus to your phone."
  - The crash path is a long-press on the lightbox `<img>`. It sits outside `a`/`button` at `photo-gallery.tsx:124-128`, and `globals.css:532-535` only covers `a` and `button`.
  - Drop the `DownloadHandler.swift:24` evidence. The share sheet hides "Save Image" when the key is missing; it does not crash.
- **PRIV-7/ASC-20, camera string** (medium, same file). New text: "Take photos of repairs, receipts, and your profile." This needs owner OK (Q4).
- **PRIV-9 + IOS-7, stale docs** (medium/low). `config.test.cjs:79-102` parses the audit table, so these docs must change in the same commit.
- **ASR-12, offline retry** (low, same pinned file). "Try again" should go to `/login`, not the marketing page.
- **IOS-6, archive URL check** (low). Stops a localhost `server.url` from reaching the first upload.

**Exact files**
- `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` (:242)
- `apps/ios/ios/App/App/Info.plist` (:62-65)
- `apps/ios/scripts/config.test.cjs`:
  - :97, the empty-array assert
  - :77, the camera string
  - :36-41, the offline link
- `apps/ios/PRIVACY-AUDIT.md`, lines :3, :14, :24, :28, :41, :73-76, :82, :103:
  - close U1, U3, U4, U5 and U6 with the evidence in PRIV-9; keep U2 open;
  - add a LinkKit 7.2.2 section;
  - Plaid is Transactions only (`apps/web/lib/plaid.ts:81`);
  - Face ID stays on the phone;
  - add the e-sign IP row (PRIV-13).
- `apps/ios/www/offline.html:28` and `apps/ios/ios/App/App/public/offline.html:28` (the second via `cap sync`)
- `apps/ios/scripts/testflight.sh`:
  - :148, use `env -u CAP_SERVER_URL npx cap sync ios`;
  - :151-157, read `App.app/capacitor.config.json` and fail unless `server.url` is `https://domusbase.com/login`.
- `apps/ios/README.md`, lines :69-70, :167-168, :193-201. These say biometrics and universal links are future work, but they shipped in sprints 227 and 229.

**Depends on Q6 (analytics):** if the owner says yes, also drop the DeviceID and BrowsingHistory rows from the manifest and the audit table. Sprint B then gates `<Analytics/>`.

**Acceptance**
1. `node --test scripts/config.test.cjs` passes. Move `Signing.local.xcconfig` aside first and restore it after (`docs/agent-handoff.md:818`). It asserts:
   - `NSPrivacyAccessedAPITypes` deep-equals exactly one entry, UserDefaults with [CA92.1];
   - both Info.plist strings match exactly;
   - the offline link is `https://domusbase.com/login`;
   - a new fake-tool case: with `CAP_SERVER_URL=http://localhost:3000` set, `testflight.sh` still archives the production URL, or fails.
2. `plutil -lint` passes on `PrivacyInfo.xcprivacy` and `Info.plist`.
3. The XCTest suite (~90 tests) is green. Run it once the Simulator is free.
4. In the Release `App.app`, `plutil -p PrivacyInfo.xcprivacy` shows the UserDefaults entry.
5. Simulator walk:
   - Repair photo → full size → long-press → Save to Photos shows the add-only prompt and does not crash.
   - Denying the prompt does not crash.
   - Airplane mode → offline page → Try again lands on `/login`.
6. The change is committed before `testflight.sh --dry-run`, then the real run.

### Sprint C: in-app account deletion request (App Store 5.1.1(v), blocker)

Covers PRIV-2, ASR-01, ASC-07 and IOS-3 (IOS-3 was raised to blocker).

**Approach.** Build the smallest compliant version: a request made inside the app, finished by hand within a stated time.
- Do **not** reuse `fullAccountWipe` (`account-wipe.ts:679`). It hard-deletes shared payments and leases, which breaks the owner's 2026-10-07 decision (`agent-handoff.md:494`). It also refuses tenants and managers (`account-wipe.ts:53-56`).
- The full design stays parked (`docs/account-deletion-design.md:3-8`) until rev 4 and the lawyer's answer.
- Apple accepts deletion that starts in the app with a stated timeline. It does not accept "email us".

**Exact files**
- `supabase/migrations/<date>_sprintNNN_account_deletion_requests.sql`. Claude writes and applies it.
  - Table: `account_deletion_requests` (`id`, `profile_id`, `requested_at`, `status`, `handled_at`), with one open request per profile.
  - RLS: users can insert and select their own rows only, with no updates.
  - Grants per L-025.
- `apps/web/app/actions/account-deletion-request.ts` (new):
  - `requireAuth` plus a rate limit; any role can use it;
  - checks every mutation error (L-002);
  - also files a typed feedback row, so the owner sees it where feedback already lands;
  - signs the user out.
- `apps/web/components/settings/delete-account-section.tsx` (new). The user types DELETE; password re-entry depends on Q2.
- Mount it in two places:
  - `apps/web/components/settings/your-data-settings.tsx`, replacing the :44 "Tell us with Send feedback" copy;
  - the owner "Account & Data" panel (`settings-layout.tsx:34`).
- `lib/__tests__/account-deletion-request.test.ts` (new).
- `docs/runbooks/account-deletion.md` (Claude-owned): anonymize the profile per design §3, then `auth.admin.deleteUser`.

**Acceptance**
1. Owner, manager and tenant each see the button (3 role tests).
2. The confirm button stays disabled until the user types exactly DELETE.
3. The action:
   - errors when unauthenticated;
   - creates one open request, and a repeat request is idempotent;
   - makes no delete calls on shared tables (asserted).
4. After success the user is signed out and sees the timeline notice. The exact copy waits on Q2.
5. Attacker SQL as `authenticated`: a user cannot read or insert another user's request and cannot change `status`.
6. A runbook dry run on a throwaway account (never the smoke accounts) works: after it, the login fails and shared records show "Deleted user".
7. `gate:web`, smoke and CI are green. Screenshots in light and dark.

### Sprint B: privacy links, AI consent, support page (5.1.1(i), 5.1.2(i), 1.5)

**Items**
- **ASR-03 + PRIV-8, in-app Privacy and Terms links** (high). Add links only, with no "you agree to" line until the new Terms are approved (ASR-03 verdict).
- **PRIV-3/ASR-05/ASC-08, Ask Domus consent** (high). It is live: production `ANTHROPIC_API_KEY` is set.
  - A one-time sheet naming Anthropic and what is sent, with Allow / Not now.
  - Consent is stored on the server, and the route returns 403 without it.
  - A Settings on/off switch.
  - Stop sending `user.email` as the name (`route.ts:191`).
- **ASC-05/ASR-10, `/support` page** (medium; App Store Connect needs an https Support URL).
- **IOS-2/PRIV-6, `accept` attributes** (medium). Stops "Take Video", which would need the microphone.
- **PRIV-10, analytics off in the iPhone app** (low). Only if Q6 = yes: render `<Analytics/>` only when `!native` (`app/layout.tsx:100,125`).

**Exact files**
- Links:
  - `apps/web/app/login/page.tsx:168-170` (footer)
  - `apps/web/components/auth/create-account-form.tsx:84-124`
  - `apps/web/components/settings/your-data-settings.tsx`, next to "Download my data"
  - `apps/web/components/help-menu.tsx:96-107`
- Consent:
  - `apps/web/components/dashboard/ai-assistant.tsx`, at :238, :260 and :267 (a starter-prompt tap must also hit the gate)
  - `apps/web/app/api/ai/chat/route.ts:167-207`
  - `apps/web/lib/ai-assistant.ts` (`getFirstName`)
  - `apps/web/app/actions/ai-consent.ts` (new)
  - `apps/web/components/settings/ask-domus-settings.tsx` (new), wired in `settings-layout.tsx`
  - `supabase/migrations/<date>_sprintNNN_profiles_ai_consent.sql`: `profiles.ai_consent_at timestamptz null`. Claude applies it and diffs it against live (L-012).
- Support:
  - `apps/web/app/support/page.tsx` (new)
  - `apps/web/app/sitemap.ts`
  - `apps/web/components/marketing/landing-page.tsx:110`
- Accept attributes:
  - `apps/web/components/dashboard/expenses/expense-form.tsx:264` and `expense-list.tsx:160`: `accept="image/*,application/pdf"`
  - `apps/web/components/dashboard/documents/signer-flow.tsx:154`: `accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"`
- Tests: extend `lib/__tests__/ai-assistant.test.ts` and `lib/__tests__/ai-chat-payments.test.ts`, and add `lib/__tests__/ai-consent.test.ts`.

**Acceptance**
1. With no consent, `POST /api/ai/chat` returns 403, and the Anthropic SDK mock records zero calls. With consent, the current behavior is unchanged.
2. The sheet appears before the first send, including a starter-prompt tap.
   - "Not now" sends nothing.
   - "Allow" sets `ai_consent_at` on the user's own profile only.
   - Turning the switch off clears it, and the next request returns 403.
3. The system prompt never contains the user's email.
4. Attacker SQL: user A cannot set user B's `ai_consent_at`.
5. Privacy and Terms links show on `/login` at phone width, on sign-up, in Settings for every role, and in the help menu.
6. `/support` returns 200 signed-out, lists support@ and privacy@, and is in the sitemap.
7. Tests assert the `accept` attributes. Confirm on a physical iPhone that no video option appears.
8. `gate:web`, smoke and CI are green. Screenshots of the sheet and the login footer in light and dark (L-009, L-022). Copy passes `lib/__tests__/plain-language.test.ts`.

**Not code:** the privacy policy and terms publish (PRIV-4/ASR-04/ASC-06, high) waits on the owner's legal decisions. When approved, it goes into a small follow-up packet: `app/privacy/page.tsx`, and `app/terms/page.tsx:41` to drop "Paid plans".

---

## 3) Metadata and docs Claude can draft now (no owner needed)

1. **`apps/ios/APP-STORE-LISTING.md`** (ASC-04), with character counts:
   - Name: default "Domus: Rent & Repairs" (21), because "Domus" is taken twice in the US store (ASC-03, Q1). The home-screen name stays "Domus".
   - Subtitle: "Rent, repairs and leases" (24).
   - Promotional text (≤170), description (≤4000), keywords (≤100, no repeats of name words).
   - Category: Business, then Productivity. Not Finance.
   - URLs: Support `https://domusbase.com/support` (until Sprint B ships, `https://domusbase.com`); Marketing `https://domusbase.com`; Privacy `https://domusbase.com/privacy`.
   - Copyright "2026 <legal name>", which waits on Q9.
   - Content rights: no third-party content. Price: Free. Availability: US only. Mac and Vision Pro off.
2. **App Review notes** (ASR-06, ASC-09):
   - Lead with Face ID lock (Settings → Security), the native Plaid LinkKit sheet, the universal-link return, and the PDF/CSV share sheet. Camera and the offline page are weak 4.2 evidence, so they go last.
   - Rent is a real-world service paid through Stripe (3.1.3(e)).
   - Bank connect needs a real US bank because Plaid is in production. Show the bank-file import instead.
   - Connect payout setup opens Safari.
   - Messages are private between people on the same lease. Report abuse via support@.
   - Ask Domus asks for consent first. Explain where account deletion is.
3. **App Privacy questionnaire, click by click** (PRIV-12, ASC-15), built from the refreshed audit §4:
   - all types linked, no tracking;
   - CoarseLocation is kept, with Sentry `user.geo` as the evidence;
   - CreditInfo is kept (Q7);
   - 19 rows, or 17 if Q6 = yes.
4. **Export compliance:** "uses only exempt encryption".
   - `ITSAppUsesNonExemptEncryption=false` is already set (`Info.plist:50-51`), so App Store Connect won't ask per build.
   - Evidence: OS HTTPS, CryptoKit SHA-256 (`PlaidLinkBridge.swift:76`), LocalAuthentication.
   - No documents to upload. No France filing, because availability is US only.
5. **TestFlight Test Information:** beta description, "What to Test", feedback email support@domusbase.com.
6. **Legal draft update** (`docs/legal-draft-terms-privacy-2026-10.md`):
   - add Apple's equal-protection sentence for third parties;
   - add the e-sign IP and device sentence (`app/actions/document-packets.ts:180-181, 221-227`);
   - say Face ID stays on the phone;
   - add an AI section naming Anthropic;
   - fix the deletion wording at :67 and :71 to match Sprint C (it promises "right away" today);
   - settle the response time: 30 days at :91 vs 45 days in `docs/policies/data-retention-policy.md:40`;
   - read vendor DPA and terms pages and cite them (PRIV-15).
7. **Exact copy for Sprints B and C:** consent sheet, Settings switch, support FAQ, delete confirm and done screens. Sixth-grade level, at most 12 words per sentence.
8. **App Review demo accounts** (ASR-08, ASC-11):
   - extend repo-root `scripts/seed-smoke-accounts.mjs` with a separate `appreview` owner and tenant graph;
   - non-personal addresses, `email_confirm` set so no email goes out;
   - rent below the $5 minimum (`lib/payment-fees.ts:13`);
   - credentials go in `apps/web/.env.local` as `APPREVIEW_*`.
   - Running it creates real production logins, so it runs after one "yes" (Q10).
9. **`docs/runbooks/account-deletion.md`**, plus handoff and grooming entries.
10. **Screenshot plan** (ASC-14): 6.9-inch, 1320×2868, light mode, 5–6 shots using the demo data. Capture once the Simulator is free.

---

## 4) Owner-only steps, in order (one action each)

Claude opens and fills each page first. The owner does only the step listed.

1. **Answer the editorial questions below.** One reply.
2. **Sign in to App Store Connect** (Apple password). If a Program License Agreement banner shows, accepting it is a separate legal click.
3. **Click Create** on the New App form Claude filled in: iOS, name per Q1, English (U.S.), `com.domusbase.app`, SKU `domus-ios`.
4. **Be at the Mac for the first upload.** After Sprint A is committed, Claude runs `testflight.sh`. Click "Always Allow" and type the Mac password.
5. **On your iPhone, tap Install on build 2 in TestFlight.** Claude then asks for one check at a time: Face ID, the receipt camera, saving a repair photo.
6. **Approve the legal text.** Give the entity name, retention years and response time (Q9), and say "publish". Lawyer review is recommended but up to you.
7. **Choose the developer account type for 5.1.1(ix)** (Q3). If you pick Organization, the D-U-N-S number and Apple migration are yours, and that is a longer, separate path.
8. **Click Publish** on App Privacy (Claude fills it in).
9. **Type your phone number, paste the demo password, and click Save** under App Review Information.
10. **Click Save** on Pricing and Availability: Free, US only, Mac and Vision Pro off.
11. **Invite testers** (Alia, siblings) when ready. Apple emails real people.
12. **Click Add for Review / Submit.**

Optional, any time:
- Create an App Store Connect API key, so later uploads run without you.
- Click Save on the Supabase email templates Claude fills in (IOS-5).

---

## 5) Medium and low items for later

| ID | Item | Note |
|---|---|---|
| IOS-4 (med) | Status-bar text unreadable when the Domus theme is set opposite to the iPhone setting | Native `domusTheme` handler; next iPhone sprint |
| IOS-5 (med) | Reset and confirm emails started in the app dead-end in Safari | Switch Supabase templates to `token_hash`; owner clicks Save |
| ASR-11 (med) | Tenant bank (ACH) checkout in the app not yet walked | Simulator walk when free |
| ASR-06(b) | Push notifications for 4.2 strength | Conflicts with the no-notifications rule (Q5) |
| ASC-14 (med) | Screenshots | After the Simulator is free |
| ASC-16, ASC-19 | Territories and Mac/Vision Pro | Covered by owner step 10 |
| IOS-8 (low) | XCTest gaps, no iOS CI, test host loads production | macOS CI minutes may cost money |
| IOS-9 (low) | No `webcredentials` for Password AutoFill | Entitlement plus AASA route change |
| IOS-10 (low) | Lock screen says "locked" when Face ID is off | `AppLock.swift:101-103`, `AppLockTests.swift:149-158` |
| IOS-11 (low) | Offline page uses pre-Wallet colors | `www/offline.html:8-10` |
| ASR-13 (low) | Email links open Safari, not the app | Optional AASA paths |
| ASR-14 (low) | No "Report message" control | Feedback with the thread id pre-filled |
| ASR-15 (low) | Future paid plans fall under 3.1.1 | Decide before adding pricing |
| PRIV-11 (low) | Sentry stores IP-derived city | "Prevent Storing of IP Addresses", after one "yes" |
| PRIV-13/14 (low) | E-sign IP disclosure; Credit Info row | Handled in sections 2 and 3 |
| ASC-17 (low) | Age rating answers | Drafted in the listing (Q8) |
| Full deletion | Account deletion design rev 4 | After the lawyer's retention answer |

---

## Editorial questions for the owner (answer before the run)

1. **App Store name.** "Domus" is taken. Use "Domus: Rent & Repairs"? Default: yes.
2. **Account deletion.** Ship the request flow now with "We will delete your account within 30 days"? Require password re-entry as well as typing DELETE? Default: yes and yes.
3. **5.1.1(ix).** Submit as an individual and accept the review risk and your public seller name, or form an LLC and get a D-U-N-S number first? Default: individual for TestFlight, decide before the App Store.
4. **Camera text.** "Take photos of repairs, receipts, and your profile." Default: yes.
5. **4.2 and push.** Submit to the App Store without push, or stay TestFlight-only until allowlist-only push ships? Default: submit with strong review notes.
6. **Analytics.** Turn Vercel Analytics off inside the iPhone app and drop the Device ID and Browsing History rows from the label? Default: yes.
7. **Credit Info.** Keep declaring it, since screening scores are free text? Default: keep.
8. **Age rating.** Set it to 18+ to match "Domus is for adults"? Default: yes.
9. **Legal.** Entity name, retention years (draft: 7), response time (30 or 45 days), and whether to publish before a lawyer reviews it.
10. **Demo accounts.** Create separate App Review owner and tenant logins on production with fake data? Default: yes.
11. **Store setup.** Category Business, then Productivity; Free; US only. Default: yes.

Files cited most often:
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/ios/ios/App/App/PrivacyInfo.xcprivacy`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/ios/ios/App/App/Info.plist`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/ios/scripts/config.test.cjs`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/ios/scripts/testflight.sh`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/apps/ios/PRIVACY-AUDIT.md`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/account-deletion-design.md`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/legal-draft-terms-privacy-2026-10.md`
- `/Users/courtneysmith/Documents/Codex/Rental Properties/scripts/seed-smoke-accounts.mjs`