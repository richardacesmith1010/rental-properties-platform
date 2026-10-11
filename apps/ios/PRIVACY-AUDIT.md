# Domus iPhone privacy audit — Sprint 212, rev 3

Status: **repo audit performed; production verification incomplete** (2026-10-10).
No database, deployed app, vendor dashboard, Apple account, archive or upload was accessed.

## UNVERIFIED items

- **U1 — deployed collection:** confirm the deployed revision and environment switches for Sentry DSN, analytics, Anthropic and Plaid against this repo. Inspect a consented test session's network payloads and provider dashboards. Conditional integrations are included below, not assumed off in production.
- **U2 — providers:** actual retention, subprocessors, advertising/data-broker use and account-specific settings at Supabase, Stripe, Plaid, Sentry, Vercel, Anthropic and Resend require the owner's vendor agreements/settings. Repo code shows no ads or cross-app tracking; this is not proof of every vendor's server-side practice.
- **U3 — diagnostics linkage:** inspect scrubbed production Sentry events and Vercel logs. `sendDefaultPii: false` does not prove anonymous events: URL, breadcrumb and error text are not fully scrubbed. Linked is conservatively **yes** below; no claim of verified de-identification.
- **U4 — hosted financial flows:** inspect the configured Stripe Connect identity-verification fields and Plaid Link flows with test accounts. Additional identity documents or sensitive fields, if required there, must be reflected in the questionnaire before submission. No actual bank connection was made.
- **U5 — native dependencies/bundle:** verify the resolved Capacitor SPM binary frameworks' manifests in the built app. Local npm sources were inspected, but Xcode package resolution/build currently encounters sandbox cache/service restrictions. See section 2.
- **U6 — manual screening:** confirm whether owners record credit scores versus a general application score. CreditInfo is included conservatively because a stored manual screening score/summary can contain credit information.
- **U7 — photos:** physical-iPhone camera and image share-sheet behavior needs a device walk. No direct photo-library save API is present; the generic share sheet may offer Save Image for image downloads.

All tracking answers below mean **no advertising attribution, cross-app identity matching or data-broker sharing found in repo** (U2 still applies). Collection and user linkage are distinct from tracking.

## 1. Native shell (our Swift)

`ios/App/App/DomusBridgeViewController.swift` installs the web view delegates and the CSV bridge. `NavigationPolicy.swift:10` restricts main-frame hosts, but subresources and remote web services still collect data. WebKit cookies retain account sessions; no separate native analytics SDK or advertising identifier access appears in our Swift.

`ios/App/App/DownloadHandler.swift:18` shares a downloaded file with the system share sheet. Lines 47 onward use temporary directories; completion/cancel removes files. CSV payloads and downloaded documents can contain names, addresses, financial data and user content already listed in section 3; this adds no independent server collection. The user chooses any external share recipient.

`apps/web/components/dashboard/maintenance/photo-upload.tsx:100` uses file inputs, including camera capture. The photo upload reaches Supabase (`apps/web/app/actions/maintenance-queries.ts:61`). There is no `PHPhotoLibrary`, `UIImageWriteToSavedPhotosAlbum`, or native repair-photo save implementation. A generic image share can offer photo-library saving (U7); no new permission strings are added. Camera text stays unchanged. System photo selection needs no blanket library permission.

### First-party required-reason APIs (separate from SDKs)

Searched every `ios/App/App/*.swift` for `UserDefaults`, `CFPreferences`, `stat`, `fstat`, `lstat`, file creation/modification dates, `attributesOfItem`, `resourceValues`, `systemUptime`, `mach_absolute_time`, `statfs`, volume/disk capacity and active keyboard APIs. **No required-reason API use found.** FileManager directory creation, file writing/removal and `Date` are not declarations of timestamp access. `NSPrivacyAccessedAPITypes` is therefore `[]`; no reason code is claimed or quoted, and CA92.1 is not assumed.

Reference: [Apple required-reason API list](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

## 2. SDK manifests (Capacitor SPM)

`ios/App/CapApp-SPM/Package.swift:15` selects Capacitor SPM **8.5.3** and local App, SplashScreen and StatusBar packages. `Package.resolved` pins revision `4c7f346d16196e21fbe23d4a7a6fc7af62af6742`. The [upstream package](https://github.com/ionic-team/capacitor-swift-pm/blob/8.5.3/Package.swift) uses binary Capacitor and Cordova frameworks.

Locally available matching npm source manifests (paths relative to apps/ios):

- `node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy`
- `node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy`

Both declare tracking false and empty tracking domains, collected-data and required-reason arrays. These declarations are **not copied** into the app manifest. In the SPM distribution, check each platform slice of `Capacitor.xcframework` and `Cordova.xcframework` for its framework `PrivacyInfo.xcprivacy` (U5). `@capacitor/app`, `@capacitor/splash-screen`, and `@capacitor/status-bar` contain no own `PrivacyInfo.xcprivacy` in the installed packages; their Package.swift files reference their Swift sources. No other native plugins are selected.

SPM binary manifest paths (also present in the local `/tmp/domus-frameworks` cache):

- `Capacitor.xcframework/ios-arm64/Capacitor.framework/PrivacyInfo.xcprivacy`
- `Capacitor.xcframework/ios-arm64_x86_64-simulator/Capacitor.framework/PrivacyInfo.xcprivacy`
- `Cordova.xcframework/ios-arm64/Cordova.framework/PrivacyInfo.xcprivacy`
- `Cordova.xcframework/ios-arm64_x86_64-simulator/Cordova.framework/PrivacyInfo.xcprivacy`

Cache presence is not proof that the current app bundles those files; U5 remains open until the current Release builds pass.

## 3. Remote web and third-party services

Evidence paths below are repository-relative; native paths above are relative to apps/ios. Purpose abbreviations: **F** = AppFunctionality; **A** = Analytics. Each data type is an exact Apple key. Conditional services are covered even if currently disabled. Linked **yes** is conservative where the repo lacks a demonstrated pre-collection anonymization boundary; linkage can be to an account or device, not just a name.

| Data type | Where collected (file:line or service) | Linked to user (why) | Tracking (why) | Purposes |
| --- | --- | --- | --- | --- |
| NSPrivacyCollectedDataTypeName | `apps/web/app/actions/profile.ts:120`; Supabase profiles; `apps/web/app/api/ai/chat/route.ts:320` owner name to Anthropic | yes — account profile and portfolio | no — account operation, no ad matching | F |
| NSPrivacyCollectedDataTypeEmailAddress | `apps/web/app/actions/leasing.ts:178`; `apps/web/lib/notification-email.ts:36` Resend; `apps/web/lib/stripe-connect.ts:119`; AI owner email fallback at chat route:320 | yes — contact/account recipient | no — service delivery | F |
| NSPrivacyCollectedDataTypePhoneNumber | `apps/web/app/actions/leasing.ts:180`; `apps/web/lib/validations-entity.ts:27` | yes — applicant or profile | no — rental contact | F |
| NSPrivacyCollectedDataTypePhysicalAddress | `apps/web/lib/validations-property.ts:38`; `apps/web/app/actions/properties.ts:92` Supabase properties | yes — occupied home and owner portfolio | no — rental operation | F |
| NSPrivacyCollectedDataTypePhotosorVideos | `apps/web/app/actions/profile.ts:59`; `apps/web/app/actions/maintenance-queries.ts:61` photo storage and uploader metadata | yes — avatar, ticket and uploader | no — repairs/profile display | F |
| NSPrivacyCollectedDataTypePaymentInfo | `apps/web/lib/stripe.ts:146` Stripe Checkout inside web view; `apps/web/lib/stripe-connect.ts:155` Connect; `apps/web/lib/plaid.ts:49` Auth and bank accounts | yes — payment/customer/bank relationship | no — payments and fraud prevention, not ads | F |
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
| NSPrivacyCollectedDataTypeCoarseLocation | Vercel Analytics inferred city/region/country; enabled by `apps/web/app/layout.tsx:123` | yes — conservative URL/device association (U1) | no — aggregate analytics | A |
| NSPrivacyCollectedDataTypeDeviceID | Vercel Analytics request-derived visitor hash/session identification; `apps/web/app/layout.tsx:123` | yes — conservative device/session linkage despite short lifetime | no — same-site metrics, no cross-app matching | A |
| NSPrivacyCollectedDataTypeBrowsingHistory | Vercel Analytics external referrer URL; `apps/web/app/layout.tsx:123` | yes — conservative URL/device association (U1) | no — referral analysis | A |

### Service findings

- **Supabase:** account authentication, profiles, contacts, property/lease records, messages, files, repair photos, feedback, manual screening and financial records are associated with accounts or properties. No live schema or rows inspected.
- **Stripe:** Checkout is explicitly allowed in the web view. Therefore payment data is disclosed even when Stripe collects it directly. Connect is handed to Safari; linked account identifiers/status return to Domus. U4 covers account-dependent verification fields.
- **Plaid:** Auth and Transactions products are requested; user ID, linked account identity/mask and balances are explicit in `lib/plaid.ts:49–106`. Bank-feed operations also retain transaction data. Credentials entered into Plaid's hosted interface are never treated as absent just because Domus does not store a raw password.
- **Sentry:** `sendDefaultPii: false`, `tracesSampleRate: 0`, `beforeSend: scrubSentryEvent`. Browser/server/edge init all use that helper. No replay integration or replay sampling configuration, no `setUser`, no explicit performance capture found. Scrubber deletes request cookies/body, authorization headers and sensitive-key extras; it does not universally scrub URLs, error text or breadcrumbs. CrashData remains; PerformanceData comes from application server timing logs, not Sentry traces.
- **Vercel Analytics:** conditional on `NEXT_PUBLIC_ENABLE_ANALYTICS === "true"`; no `beforeSend` URL redaction passed. Vercel describes page views, referrers, approximate location, device/browser attributes and short-lived request-derived visitor identification. We conservatively include coarse location, device identifier and referral browsing data, in addition to product interaction; no precise/GPS location API is used. [Vercel privacy documentation](https://vercel.com/docs/analytics/privacy-policy).
- **Anthropic:** chat route:309–335 sends owner first name (email fallback), portfolio summary, tenant labels, property names, rent/arrears, payment amounts/dates, maintenance titles/status and the submitted conversation. `toTenantLabel` shortens tenant names but is not an anonymity guarantee. No automatic photo/document attachment to AI was found. Free text can contain personal data. Purpose: requested assistant functionality; vendor retention/training terms are U2.
- **Resend:** sends addresses and rendered message bodies (including names, property, rent or message details, depending on template). `lib/notification-email.ts:36`, `lib/invite-email.ts:20`. Purpose: requested invitations and notifications, no marketing campaign integration found.

No advertising SDK, IDFA, tracking consent framework, ad attribution, or cross-app tracker was found in our native sources or the reviewed web integrations. No Contacts/HealthKit/microphone/precise-location collection path found. Generic free-text uploads can incidentally contain additional information; do not assert vendor KYC fields or uploaded document contents are fully classified without U4/U6 review.

## 4. App Store Connect privacy questionnaire answers

These are the full **repo-derived proposed answers**, covering native, remote web and third parties, subject to the UNVERIFIED items above. Do not describe them as a completed production attestation.

1. **Do you or third-party partners collect data? Yes.** Include optional and conditionally enabled functionality.
2. Select every data type in section 3 (19 types). For each, select the purposes in that row: F = **App Functionality**, A = **Analytics**. Section 5 supplies the corresponding exact manifest values.
3. **Linked to the user? Yes** for these rows, including conservative diagnostics/device/URL associations explained above. This avoids claiming data is anonymous merely because default PII is off.
4. **Used for tracking? No** for each type; no tracking domains. Confirm U2 before publishing. No advertising/marketing, product-personalization or Other Purposes selections supported by current repo use.
5. Do not select unrelated health, fitness, precise location, contacts, audio, gameplay or search-history categories: no deliberate collection path found. The app's own page views belong under Product Interaction; external referrers are covered as Browsing History.
6. Supply the owner's reviewed public privacy-policy URL in App Store Connect (URL/publication not verified here). Resolve U1–U7 before declaring these answers final, and update them whenever the remote website changes.

## 5. What goes in PrivacyInfo.xcprivacy

The app-level manifest covers the same 19 collected types, including the remote website. This is not a replacement for the App Store Connect questionnaire or each SDK's own manifest. `NSPrivacyTracking=false`, `NSPrivacyTrackingDomains=[]`, and first-party `NSPrivacyAccessedAPITypes=[]`.

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
