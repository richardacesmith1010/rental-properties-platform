# App Privacy, export compliance and screenshots — "Domus: Rent & Repairs" (iPhone)

Drafted 2026-10-16 by Claude. Sources: `apps/ios/PRIVACY-AUDIT.md` §3–§5 (rev 3), `docs/phone-readiness-plan-2026-10-16.md`
(decisions Q6, Q7, Q10, Q11; section 3 items 3, 4, 10), `docs/phone-walk-2026-10-16.md`.
Repo-derived answers, not a production attestation. Audit item U2 (vendor-side practices) is still open.

**In plain words:** Domus collects 17 kinds of data. All of it is tied to the person's account.
None of it is used to track people. None of it is used for ads.

## 0) Before anyone clicks Publish

App Privacy must be published before App Store submission. TestFlight does not need it.

| # | Check | Why | If not true |
|---|---|---|---|
| G1 | Sprint 238c is live: `<Analytics/>` does not render inside the iPhone app (`apps/web/app/layout.tsx:125`) | Q6 drops Device ID and Browsing History | Use the 19-type fallback in section 2. Never publish 17 while the app still runs analytics. |
| G2 | `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` lists the same 17 types and purposes as section 1 | Label and manifest must agree | **Met 2026-10-17 (Sprint 238h):** manifest has 17 types; a test fails if analytics is turned back on without updating both. |
| G3 | The e-sign IP/device row (238a) in `PRIVACY-AUDIT.md` maps to a type in section 1 | `app/actions/document-packets.ts:180-181, 221-227` stores signer IP and browser | Mirror that row here. If it says Coarse Location for App Functionality, tick F on row 8. |
| G4 | https://domusbase.com/privacy shows the owner-approved policy | Apple links the label to it | Wait for owner step 6 (Q9). Entity name: `[OWNER: legal entity name]`. |
| G5 | Ask Domus asks first (238c, `profiles.ai_consent_at`) and no longer sends email as the name (`route.ts:191`) | Rows 1, 7 and 12 describe the consented flow | Hold Publish until 238c is live. |

Re-check this file whenever the website changes. The app loads the website, so web changes change the label.

## 1) App Privacy, click by click (17 types)

**Entered 2026-10-16 as a draft (not published; owner said "do not click Publish").** Privacy Policy URL saved; all 17
types saved with the purposes in 1a, linked = yes, tracking = no (verified after reload). Preview: Data Linked to You =
7 categories; nothing used to track; nothing unlinked. Publish waits on G2 (Sprint 238h manifest 17) and G4 (Q9 legal
text live).

Claude fills every screen. The owner clicks only **Publish** (step 7).

1. App Store Connect → **Apps** → **Domus: Rent & Repairs** → left sidebar → **App Privacy** (under General).
2. **Privacy Policy** → **Edit**.
   - Privacy Policy URL: `https://domusbase.com/privacy`
   - User Privacy Choices URL: leave blank (optional field).
   - Click **Save**.
3. **Data Types** → **Get Started**.
   - "Do you or your third-party partners collect data from this app?" → **Yes, we collect data from this app** → **Next**.
4. Tick exactly these boxes, then click **Save**. Everything not listed stays unticked (see 1b).

   | Apple category (on screen) | Tick | Leave unticked |
   |---|---|---|
   | Contact Info | Name, Email Address, Phone Number, Physical Address | Other User Contact Info |
   | Health & Fitness | — | Health, Fitness |
   | Financial Info | Payment Info, Credit Info, Other Financial Info | — |
   | Location | Coarse Location | Precise Location |
   | Sensitive Info | — | Sensitive Info |
   | Contacts | — | Contacts |
   | User Content | Emails or Text Messages, Photos or Videos, Customer Support, Other User Content | Audio Data, Gameplay Content |
   | Browsing History | — | Browsing History |
   | Search History | — | Search History |
   | Identifiers | User ID | Device ID |
   | Purchases | — | Purchase History |
   | Usage Data | Product Interaction | Advertising Data, Other Usage Data |
   | Diagnostics | Crash Data, Performance Data, Other Diagnostic Data | — |
   | Surroundings | — | Environment Scanning |
   | Body | — | Hands, Head |
   | Other Data | — | Other Data Types |

   Count of ticks: 4 + 3 + 1 + 4 + 1 + 1 + 3 = **17**.
5. For each ticked type, click **Set Up [type]**. Answer three screens, then **Save**:
   - **Purposes:** tick only what the table below says. Never tick Third-Party Advertising, Developer's
     Advertising or Marketing, Product Personalization, or Other Purposes.
   - **Linked to the user's identity?** → **Yes** for all 17.
   - **Used for tracking?** → **No** for all 17.
6. Check the preview on the App Privacy page:
   - **Data Used to Track You:** none.
   - **Data Linked to You:** 7 categories (Contact Info, Financial Info, Location, User Content, Identifiers,
     Usage Data, Diagnostics).
   - **Data Not Linked to You:** none.
7. **OWNER:** click **Publish** (top right). One click.

### 1a) The 17 answers

Purpose letters: **F** = App Functionality, **A** = Analytics. Every row: collected **yes**, linked **yes**, tracking **no**.

| # | Apple type (on screen) | Manifest key | Purposes to tick | Why we collect it (evidence) |
|---|---|---|---|---|
| 1 | Name | `NSPrivacyCollectedDataTypeName` | F | Profiles and portfolios (`apps/web/app/actions/profile.ts:120`). Ask Domus gets the owner's first name only after consent (238c). |
| 2 | Email Address | `...EmailAddress` | F | Sign-in, invites and notices (`app/actions/leasing.ts:178`, `lib/notification-email.ts:36` Resend, `lib/stripe-connect.ts:119`). |
| 3 | Phone Number | `...PhoneNumber` | F | Applicant and profile contact (`app/actions/leasing.ts:180`, `lib/validations-entity.ts:27`). |
| 4 | Physical Address | `...PhysicalAddress` | F | Home addresses (`lib/validations-property.ts:38`, `app/actions/properties.ts:92`). |
| 5 | Payment Info | `...PaymentInfo` | F | Stripe Checkout runs inside the web view (`lib/stripe.ts:146`); Connect payouts (`lib/stripe-connect.ts:155`); linked bank account name and mask (Plaid, `lib/plaid.ts:115-116`). |
| 6 | Credit Info | `...CreditInfo` | F | Manual screening score and summary (`app/actions/leasing.ts:459`). Kept per Q7: free text can hold credit facts. |
| 7 | Other Financial Info | `...OtherFinancialInfo` | F | Rent, payments, bank balances and transactions (`lib/plaid.ts:81` Transactions only, balances `:208`; `app/actions/bank-feed.ts:195`). Ask Domus summary after consent. |
| 8 | Coarse Location | `...CoarseLocation` | A | Sentry stores an IP-derived city (`user.geo`) on error events (PRIV-11). Vercel Analytics is no longer a source in the app (Q6). See G3. |
| 9 | Emails or Text Messages | `...EmailsOrTextMessages` | F | In-app messages (`app/actions/inbox.ts:87`) and email notices via Resend. |
| 10 | Photos or Videos | `...PhotosorVideos` | F | Repair photos and profile pictures (`app/actions/maintenance-queries.ts:61`, `app/actions/profile.ts:59`). |
| 11 | Customer Support | `...CustomerSupport` | F | Send feedback (`app/actions/feedback.ts:161`). The account deletion request (238b) also files a feedback row. |
| 12 | Other User Content | `...OtherUserContent` | F | Repair notes, documents, application notes (`app/actions/maintenance-ticket-actions.ts:79`); Ask Domus chat text after consent. |
| 13 | User ID | `...UserID` | F | Account IDs (Supabase Auth; Plaid `client_user_id`, `lib/plaid.ts:77`; `lib/audit.ts:145`). |
| 14 | Product Interaction | `...ProductInteraction` | F, A | Activity history (`lib/audit.ts:135`). A stays ticked to match the manifest; server request logs show which pages are used. |
| 15 | Crash Data | `...CrashData` | A | Sentry error reports (`app/global-error.tsx:15`, `lib/sentry-options.ts`). Error text and URLs may point to an account (U3). |
| 16 | Performance Data | `...PerformanceData` | A | `[perf:*]` timing logs in Vercel (`lib/logger.ts:86-93`). Sentry tracing is off (`tracesSampleRate: 0`). |
| 17 | Other Diagnostic Data | `...OtherDiagnosticData` | F, A | Failed-step logs with user ID (`lib/logger.ts:52-62`); browser and screen size on feedback (`app/actions/feedback.ts:166`). |

Paths without `apps/web/` are relative to `apps/web`.

**Claude review note (optional, not required to publish).** Apple's App Functionality definition lists
"minimize app crashes" and "improve scalability and performance." So rows 15 and 16 could also tick F.
Over-declaring a purpose is safe. If we add it, change the manifest in the same iPhone sprint (keeps G2 true).

### 1b) Left unticked, and why

| Apple type | Why not |
|---|---|
| Device ID | Q6: analytics off in the app. No IDFA. The Face ID setting stays on the phone (`AppLock.swift`, UserDefaults). |
| Browsing History | Q6: analytics off in the app, so no referrer URLs are sent. |
| Precise Location | No GPS or location API anywhere. |
| Sensitive Info | No deliberate collection. Face ID data never leaves the phone; Domus only gets pass or fail. |
| Contacts | No address book access. |
| Audio Data | No microphone use. 238c `accept` attributes remove "Take Video" (which records sound). |
| Search History | Searches are not stored. |
| Purchase History | Rent is not a store purchase. Rent and payment records are rows 5 and 7. Tick only if App Review asks. |
| Advertising Data, Other Usage Data | No ads and no other usage tracking. |
| Health, Fitness, Gameplay Content, Other User Contact Info, Environment Scanning, Hands, Head, Other Data Types | Not collected. |

## 2) Fallback: 19 types (only if G1 fails)

Use this only if the iPhone app still runs Vercel Analytics. It matches today's manifest (19 rows).

- Also tick **Identifiers → Device ID**: purposes A, linked yes, tracking no.
- Also tick **Browsing History → Browsing History**: purposes A, linked yes, tracking no.
- Coarse Location stays A (Vercel's city guess is a second source).

Preview then still shows no tracking and no ads.

## 3) Export compliance

**Answer: the app uses only exempt encryption. It uses only encryption built into iOS.**

- `ITSAppUsesNonExemptEncryption = false` is already set (`apps/ios/ios/App/App/Info.plist:50-51`).
  App Store Connect will not ask per build. A processed build goes straight to TestFlight.
- If App Store Connect asks anyway ("Export Compliance Information" or "App Encryption Documentation"):
  - "What type of encryption algorithms does your app implement?" → **None of the algorithms mentioned above**.
  - If the older form shows: "Does your app use encryption?" → **Yes**. "Does it qualify for an exemption?" → **Yes**.
  - France question: not shown (US only, Q11). If it shows, answer **No**.
  - Upload no documents. Apple asks for none with exempt-only use.

| Encryption use | Where | Provided by |
|---|---|---|
| HTTPS for every page and API call | WKWebView and URLSession | iOS |
| SHA-256 hash of sign-in cookies (a hash, not encryption) | `apps/ios/ios/App/App/PlaidLinkBridge.swift:4, 76` (CryptoKit) | iOS |
| Face ID lock | `apps/ios/ios/App/App/BiometricAuth.swift:1` (LocalAuthentication) | iOS |
| Plaid bank connect | LinkKit 7.2.2 framework | Uses iOS networking (see check) |

Bundled frameworks check (Claude, 2026-10-16, Debug simulator build in DerivedData): `Capacitor`, `Cordova` and
`LinkKit` binaries contain no `openssl`, `boringssl`, `libsodium`, `CCCrypt` or `SecKeyCreateEncrypted` strings.
Re-run on the Release archive before App Store submission:

```
for f in <archive>/Products/Applications/App.app/Frameworks/*.framework; do n=$(basename "$f" .framework);
  echo "$n: $(strings "$f/$n" | /usr/bin/grep -c -i 'openssl\|boringssl\|libsodium\|CCCrypt\|SecKeyCreateEncrypted')"; done
```

Every count must be 0. If not, stop and re-answer this section before upload.

## 4) Screenshot plan

**Format.** iPhone 6.9-inch display, **1320 × 2868** portrait PNG, light mode, **5–6 shots**.
The app is iPhone only (`TARGETED_DEVICE_FAMILY = 1`) and portrait only (`Info.plist:56-59`).
So no iPad or landscape shots are needed. App Store Connect scales 6.9-inch shots for smaller iPhones.

**When.** After both of these:
1. Sprint 238d ships: safe-area headers (P3), help button overlap (P2), "Repair" wording (P7), message pill (P5).
2. The App Review demo owner and tenant exist (Q10). Fake data only. Never real tenant data.

Demo rent is under $5 on purpose. Online pay starts at $5 (`lib/payment-fees.ts:13`).
So no real charge can happen, and the tenant sees no Pay rent button (`lib/tenant-pay-state.ts:24`).
To make Home look normal, the seed can add past fake payments. Mark them paid by hand, with no Stripe.

**Setup (Claude, Simulator).**
- Device: the Pro Max Simulator whose screenshot is exactly 1320 × 2868 (iPhone 17 Pro Max). Check each file with
  `sips -g pixelWidth -g pixelHeight <file>`.
- `xcrun simctl ui booted appearance light`
- `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`
- In Domus, set the theme to Light (avoids the IOS-4 status-bar contrast bug).
- Face ID lock off, so no lock screen covers a shot.
- Sign in with the demo accounts. Passwords: `[OWNER: APPREVIEW_* in apps/web/.env.local — never paste here]`.
- Capture: `xcrun simctl io booted screenshot --type=png <name>.png`.

**Shots, in upload order.**

| # | Account | Screen | Must show | Caption (optional overlay) |
|---|---|---|---|---|
| 1 | Demo owner | Home (Wallet) | Rent collected this month, next rent due, tab bar | See your rent at a glance. |
| 2 | Demo tenant | Home | "Paid … Thank you!" (needs a past fake payment and no open rent) | See when your rent is paid. |
| 3 | Demo tenant | Problems tab (renamed by 238d) → new repair with a photo | Photo attached, "Repair" wording (238d) | Report a repair with a photo. |
| 4 | Demo owner | Money | Income, costs and a receipt; header clear of the status bar | Track rent and costs in one place. |
| 5 | Demo owner | Inbox tab (page "Messages") → one thread | Owner and tenant messages; pill not clipped | Message your tenants in one place. |
| 6 (optional) | Demo owner | Homes | Home cards with fake addresses | All your homes in one list. |

**Before upload, every shot must pass:**
- exactly 1320 × 2868; light mode; status bar shows 9:41 and a full battery;
- no real names, addresses or amounts; no "?" button covering content;
- no Debug banners, keyboards or error toasts;
- readable text and visible button labels (L-009, L-022).

**Upload.** App Store Connect → the app → iOS app version → **Previews and Screenshots** → **iPhone 6.9" Display**.
Drag the shots in the order above. Claude does this; it needs no owner click beyond sign-in.

## 5) Owner placeholders in this file

- `[OWNER: legal entity name]` — for the published privacy policy (Q9, G4).
- **Publish** click on App Privacy — owner step 8 in the plan.
- `[OWNER: APPREVIEW_* in apps/web/.env.local — never paste here]` — demo passwords stay in `.env.local` only.

Contact for privacy questions: privacy@domusbase.com. Support: support@domusbase.com, https://domusbase.com/support
(live after Sprint 238c; until then use https://domusbase.com).
