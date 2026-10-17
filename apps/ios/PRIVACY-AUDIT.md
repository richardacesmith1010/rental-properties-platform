# Domus iPhone privacy audit — Sprint 238a (updates Sprint 212 rev 3)

Status: **Sprint 238a source and bundle audit complete** (2026-10-16).
Production findings below are attributed to the readiness audit, not repeated here.
No live database, provider dashboard, Apple account, archive or upload was accessed in 238a.

## Audit follow-up status

- **U1 — CLOSED, deployed collection:** adopted PRIV-9's closure from
  `docs/phone-readiness-plan-2026-10-16.md:81-97`. The plan records production Anthropic in the Sprint B section.
  Conditional integrations remain declared. Analytics label removal waits for Sprint 238c.
- **U2 — OPEN, providers:** vendor retention, subprocessors and account-specific settings still need review.
  Repo code cannot establish every vendor's server-side practices.
- **U3 — CLOSED, diagnostics linkage:** keep linked diagnostics, without claiming anonymity.
  `apps/web/lib/sentry-options.ts` disables default PII and tracing, not all identifying context.
  The readiness plan, section 3 item 3, records Sentry `user.geo` evidence.
  CoarseLocation remains declared for that reason, even after analytics changes.
- **U4 — CLOSED, hosted financial flows:** retain linked payment and financial disclosures.
  `apps/web/lib/stripe-connect.ts` configures hosted Connect; `apps/web/lib/plaid.ts:81` requests Transactions only.
  See readiness plan PRIV-9 for the adopted audit closure. No new bank connection was made here.
  Vendor-side practices remain under U2.
- **U5 — CLOSED, native dependencies/bundle:** source, binary and bundled manifest inventory is in section 2.
  The existing built app contains Capacitor, Cordova and LinkKit frameworks, plus LinkKitSub resources.
- **U6 — CLOSED, manual screening:** CreditInfo stays declared.
  `apps/web/app/actions/leasing.ts:459-466` stores manual score and summary.
  Readiness decision Q7 keeps this disclosure because screening notes allow free text.
- **U7 — OPEN, photos device walk:** the Photos-add key now covers WebKit's image-save action.
  Physical-iPhone permission and save behavior still require verification.

All tracking answers below mean **no advertising attribution, cross-app identity matching or data-broker sharing found in repo** (U2 still applies). Collection and user linkage are distinct from tracking.

## 1. Native shell (our Swift)

`ios/App/App/DomusBridgeViewController.swift` installs the web view delegates and the CSV bridge. `NavigationPolicy.swift:10` restricts main-frame hosts, but subresources and remote web services still collect data. WebKit cookies retain account sessions; no separate native analytics SDK or advertising identifier access appears in our Swift.

`ios/App/App/DownloadHandler.swift:18` shares a downloaded file with the system share sheet. Lines 47 onward use temporary directories; completion/cancel removes files. CSV payloads and downloaded documents can contain names, addresses, financial data and user content already listed in section 3; this adds no independent server collection. The user chooses any external share recipient.

`apps/web/components/dashboard/maintenance/photo-upload.tsx` uses camera-enabled file inputs.
Uploads reach Supabase. WebKit offers Save to Photos on the full-size repair image
(`apps/web/components/dashboard/maintenance/photo-gallery.tsx:124-128`).
`Info.plist` now provides the exact camera and Photos-add messages.
The generic download share sheet was not the crash path (readiness plan PRIV-5).

Face ID uses LocalAuthentication (`BiometricAuth.swift`). Biometric data stays on the device.
Domus stores lock preferences and enrollment-state data locally (`AppLock.swift:10-28`).
Neither is sent to Domus servers.

### First-party required-reason APIs

All app-target Swift sources were scanned for all five API categories.
`AppLock.swift:10-28` reads/writes app-owned UserDefaults preferences.
The app manifest therefore declares exactly **UserDefaults / CA92.1**.
No first-party file timestamp, disk space, system boot time or active keyboard access was found.
File writes, directory creation and wall-clock `Date` are not those APIs.

## 2. Required-reason SDK and built-bundle inventory

Inspected on 2026-10-16, before changing the app manifest:

- Installed `node_modules/@capacitor/ios` and core: 8.5.3.
- App 8.1.2, SplashScreen 8.0.2, StatusBar 8.0.4: all native sources and Package.swift files.
- `ios/App/CapApp-SPM/Package.swift`, Xcode package references and resolved LinkKit 7.2.2 sources.
- Existing built `App.app/Frameworks`: Capacitor.framework, Cordova.framework, LinkKit.framework only.
- Built `App.app/LinkKit_LinkKitSub.bundle/PrivacyInfo.xcprivacy` and LinkKitSub's source/resources.
- Matching device and simulator SPM framework manifests, binary undefined symbols and Objective-C selectors.

The inspected build is under
`~/Library/Developer/Xcode/DerivedData/App-dmyzdyyzmpyajucupkaznkgppigs/Build/Products/Debug-iphonesimulator/App.app`.
It predates this patch; the new app manifest still needs its post-build check.
No CocoaPods or additional embedded frameworks were present.

| Code/bundle | UserDefaults | File timestamps | Disk space | Boot time | Active keyboards | Declaring bundle |
| --- | --- | --- | --- | --- | --- | --- |
| App Swift | AppLock preferences | none found | none found | none found | none found | App.app: CA92.1 |
| Capacitor 8.5.3 | none found | none found | none found | none found | none found | Capacitor.framework: empty API array |
| Cordova 8.5.3 | none found | none found | none found | none found | none found | Cordova.framework: empty API array |
| App 8.1.2 plugin | none found | none found | none found | none found | none found | No manifest; no required use |
| SplashScreen 8.0.2 | none found | none found | none found | none found | none found | No manifest; no required use |
| StatusBar 8.0.4 | none found | none found | none found | none found | none found | No manifest; no required use |
| LinkKit 7.2.2 binary | NSUserDefaults | none found | none found | none found | none found | LinkKit.framework: CA92.1 |
| LinkKitSub stub | no executable use found | none found | none found | none found | none found | LinkKit_LinkKitSub.bundle: CA92.1 |

Source and symbol searches covered UserDefaults/CFPreferences; stat/fstat/lstat/getattrlist;
creation/modification dates and resource values; statfs/statvfs and capacity keys;
systemUptime/mach_absolute_time; and activeInputModes.
Capacitor's `KeyValueStore.swift` uses JSON files, not UserDefaults.
No manifest-less plugin use needs an extra app-level category.
Binary symbol inspection is not vendor source access; vendor attestations remain under U2.

### LinkKit 7.2.2

`plaid-link-ios-spm/Package.swift` downloads LinkKit 7.2.2 and embeds LinkKitSub's resource bundle.
Both SDK manifests declare UserDefaults with CA92.1, plus linked UserID for App Functionality.
The built LinkKit binary references NSUserDefaults/standardUserDefaults.
The SDK manifests cover the SDK, not Domus's AppLock preferences.
Domus's configured product is **Transactions only** (`apps/web/lib/plaid.ts:81`).
Auth, Identity and Assets are not requested products.

### Capacitor failure forwarding

Installed `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:139-161`
loads `bridge.config.errorPathURL` in both failure callbacks, without checking for an offline-page loop.
`DomusNavigationDelegate` forwards genuine current failures to that original handler.
It suppresses cancellation, superseded-navigation and offline-page failures.
Offline navigation then follows the same start/finish rule; its failure waits for the watchdog.

## 3. Remote web and third-party services

Evidence paths below are repository-relative; native paths above are relative to apps/ios. Purpose abbreviations: **F** = AppFunctionality; **A** = Analytics. Each data type is an exact Apple key. Conditional services are covered even if currently disabled. Linked **yes** is conservative where the repo lacks a demonstrated pre-collection anonymization boundary; linkage can be to an account or device, not just a name.

| Data type | Where collected (file:line or service) | Linked to user (why) | Tracking (why) | Purposes |
| --- | --- | --- | --- | --- |
| NSPrivacyCollectedDataTypeName | `apps/web/app/actions/profile.ts:120`; Supabase profiles; `apps/web/app/api/ai/chat/route.ts:320` owner name to Anthropic | yes — account profile and portfolio | no — account operation, no ad matching | F |
| NSPrivacyCollectedDataTypeEmailAddress | `apps/web/app/actions/leasing.ts:178`; `apps/web/lib/notification-email.ts:36` Resend; `apps/web/lib/stripe-connect.ts:119`; AI owner email fallback at chat route:320 | yes — contact/account recipient | no — service delivery | F |
| NSPrivacyCollectedDataTypePhoneNumber | `apps/web/app/actions/leasing.ts:180`; `apps/web/lib/validations-entity.ts:27` | yes — applicant or profile | no — rental contact | F |
| NSPrivacyCollectedDataTypePhysicalAddress | `apps/web/lib/validations-property.ts:38`; `apps/web/app/actions/properties.ts:92` Supabase properties | yes — occupied home and owner portfolio | no — rental operation | F |
| NSPrivacyCollectedDataTypePhotosorVideos | `apps/web/app/actions/profile.ts:59`; `apps/web/app/actions/maintenance-queries.ts:61` photo storage and uploader metadata | yes — avatar, ticket and uploader | no — repairs/profile display | F |
| NSPrivacyCollectedDataTypePaymentInfo | Stripe and Plaid: see service findings | yes — account | no — payments | F |
| NSPrivacyCollectedDataTypeOtherFinancialInfo | `apps/web/lib/plaid.ts:89` balances; `apps/web/app/actions/bank-feed.ts:142`; `apps/web/lib/ai-assistant.ts:100` rent, debts and payments sent to Anthropic | yes — owner, lease and tenant portfolio | no — financial operation | F |
| NSPrivacyCollectedDataTypeCreditInfo | `apps/web/app/actions/leasing.ts:459` manual screening score and summary (U6) | yes — applicant | no — application review | F |
| NSPrivacyCollectedDataTypeUserID | `apps/web/lib/plaid.ts:53`; `apps/web/lib/audit.ts:145`; Supabase Auth profile IDs | yes — explicit account identifier | no — authentication and attribution | F |
| NSPrivacyCollectedDataTypeEmailsOrTextMessages | `apps/web/app/actions/inbox.ts:87`; `apps/web/lib/notification-email.ts:36` Resend payload | yes — sender, recipients and thread | no — user communication | F |
| NSPrivacyCollectedDataTypeCustomerSupport | `apps/web/app/actions/feedback.ts:161` support/bug feedback with contact details | yes — profile/email may be attached | no — resolving user issues | F |
| NSPrivacyCollectedDataTypeOtherUserContent | `apps/web/app/actions/maintenance-ticket-actions.ts:79`; documents and application notes; `apps/web/app/api/ai/chat/route.ts:331` free-text conversation | yes — tickets, documents, applicant and AI session | no — requested app functions | F |
| NSPrivacyCollectedDataTypeCrashData | `apps/web/app/global-error.tsx:15`; `apps/web/lib/sentry-options.ts:4`; `apps/web/lib/sentry-scrub.ts:22` | yes — conservative, error text/URLs may identify an account (U3) | no — error diagnosis | A |
| NSPrivacyCollectedDataTypePerformanceData | `apps/web/lib/logger.ts:86` timing logs in Vercel; Sentry tracing explicitly off at `sentry-options.ts:11` | yes — request context may correlate with server logs (U3) | no — performance analysis | A |
| NSPrivacyCollectedDataTypeOtherDiagnosticData | `apps/web/lib/logger.ts:47` failed-side-effect logs with userId; `apps/web/app/actions/feedback.ts:166` browser and viewport | yes — userId/contact and request context | no — operational diagnostics | F,A |
| NSPrivacyCollectedDataTypeProductInteraction | `apps/web/app/layout.tsx:123` optional Vercel Analytics; `apps/web/lib/audit.ts:135` audit actions | yes — audit actions carry user_id; analytics URLs may carry identifiers | no — usage analysis and audit trail | F,A |
| NSPrivacyCollectedDataTypeCoarseLocation | Sentry geo: see U3; Vercel Analytics | yes — linked context | no — analytics | A |
| NSPrivacyCollectedDataTypeDeviceID | Vercel Analytics request-derived visitor hash/session identification; `apps/web/app/layout.tsx:123` | yes — conservative device/session linkage despite short lifetime | no — same-site metrics, no cross-app matching | A |
| NSPrivacyCollectedDataTypeBrowsingHistory | Vercel Analytics external referrer URL; `apps/web/app/layout.tsx:123` | yes — conservative URL/device association (U1) | no — referral analysis | A |

### E-sign evidence (existing data types)

| Data | Evidence | Linked / tracking | Existing manifest type and purpose |
| --- | --- | --- | --- |
| Signer IP and device/browser | See source below | yes / no | OtherDiagnosticData; App Functionality |

`apps/web/app/actions/document-packets.ts:180-181,221-227` stores signer IP and user-agent.
The signature audit record links these values to the signer.
This supports signature evidence; it does not infer location or track devices.
No new collected-data category is added.

### Service findings

- **Supabase:** account authentication, profiles, contacts, property/lease records, messages, files, repair photos, feedback, manual screening and financial records are associated with accounts or properties. No live schema or rows inspected.
- **Stripe:** Checkout is explicitly allowed in the web view. Therefore payment data is disclosed even when Stripe collects it
  directly. Connect is handed to Safari; linked account identifiers/status return to Domus. The U4 closure retains linked
  financial disclosures.
- **Plaid:** Only the Transactions product is requested; user ID, linked account identity/mask and balances are explicit in
  `lib/plaid.ts:49–106`. Bank-feed operations also retain transaction data. Credentials entered into Plaid's hosted interface
  are never treated as absent just because Domus does not store a raw password.
- **Sentry:** `sendDefaultPii: false`, `tracesSampleRate: 0`, `beforeSend: scrubSentryEvent`. Browser/server/edge init all use that helper. No replay integration or replay sampling configuration, no `setUser`, no explicit performance capture found. Scrubber deletes request cookies/body, authorization headers and sensitive-key extras; it does not universally scrub URLs, error text or breadcrumbs. CrashData remains; PerformanceData comes from application server timing logs, not Sentry traces.
- **Vercel Analytics:** conditional on `NEXT_PUBLIC_ENABLE_ANALYTICS === "true"`; no `beforeSend` URL redaction passed. Vercel describes page views, referrers, approximate location, device/browser attributes and short-lived request-derived visitor identification. We conservatively include coarse location, device identifier and referral browsing data, in addition to product interaction; no precise/GPS location API is used. [Vercel privacy documentation](https://vercel.com/docs/analytics/privacy-policy).
- **Anthropic:** chat route:309–335 sends owner first name (email fallback), portfolio summary, tenant labels, property names, rent/arrears, payment amounts/dates, maintenance titles/status and the submitted conversation. `toTenantLabel` shortens tenant names but is not an anonymity guarantee. No automatic photo/document attachment to AI was found. Free text can contain personal data. Purpose: requested assistant functionality; vendor retention/training terms are U2.
- **Resend:** sends addresses and rendered message bodies (including names, property, rent or message details, depending on template). `lib/notification-email.ts:36`, `lib/invite-email.ts:20`. Purpose: requested invitations and notifications, no marketing campaign integration found.

No advertising SDK, IDFA, tracking consent framework, ad attribution, or cross-app tracker was found in our native sources or
the reviewed web integrations. No Contacts/HealthKit/microphone/precise-location collection path found. Generic free-text
uploads can incidentally contain additional information; do not assert vendor KYC fields or uploaded document contents are fully
classified without reviewing future collection changes.

## 4. App Store Connect privacy questionnaire answers

These are the full **repo-derived proposed answers**, covering native, remote web and third parties, subject to open U2 and U7
above. Do not describe them as a completed production attestation.

1. **Do you or third-party partners collect data? Yes.** Include optional and conditionally enabled functionality.
2. Select every data type in section 3 (19 types). For each, select the purposes in that row: F = **App Functionality**, A = **Analytics**. Section 5 supplies the corresponding exact manifest values.
3. **Linked to the user? Yes** for these rows, including conservative diagnostics/device/URL associations explained above. This avoids claiming data is anonymous merely because default PII is off.
4. **Used for tracking? No** for each type; no tracking domains. Confirm U2 before publishing. No advertising/marketing, product-personalization or Other Purposes selections supported by current repo use.
5. Do not select unrelated health, fitness, precise location, contacts, audio, gameplay or search-history categories: no deliberate collection path found. The app's own page views belong under Product Interaction; external referrers are covered as Browsing History.
6. Supply the owner's reviewed public privacy-policy URL in App Store Connect (URL/publication not verified here). Resolve open
   U2 and U7 before declaring these answers final, and update them whenever the remote website changes.

## 5. What goes in PrivacyInfo.xcprivacy

The app-level manifest covers the same 19 collected types, including the remote website. This is not a replacement for the App
Store Connect questionnaire or each SDK's own manifest. `NSPrivacyTracking=false`, `NSPrivacyTrackingDomains=[]`, and
first-party `NSPrivacyAccessedAPITypes` contains only UserDefaults with CA92.1.

The following is the **single machine-readable manifest table**; tests parse the bounded section, booleans and comma-separated exact purpose keys. Section 3 is the evidence and rationale for each row.

<!-- manifest-data:start -->
| DataType | Linked | Tracking | Purposes |
| --- | --- | --- | --- |
| NSPrivacyCollectedDataTypeName | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeEmailAddress | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypePhoneNumber | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypePhysicalAddress | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypePhotosorVideos | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypePaymentInfo | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeOtherFinancialInfo | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeCreditInfo | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeUserID | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeEmailsOrTextMessages | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeCustomerSupport | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeOtherUserContent | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality |
| NSPrivacyCollectedDataTypeCrashData | true | false | NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypePerformanceData | true | false | NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypeOtherDiagnosticData | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality,NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypeProductInteraction | true | false | NSPrivacyCollectedDataTypePurposeAppFunctionality,NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypeCoarseLocation | true | false | NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypeDeviceID | true | false | NSPrivacyCollectedDataTypePurposeAnalytics |
| NSPrivacyCollectedDataTypeBrowsingHistory | true | false | NSPrivacyCollectedDataTypePurposeAnalytics |
<!-- manifest-data:end -->

Sources: [Apple data type keys](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype), [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/). No collection behavior was changed.
