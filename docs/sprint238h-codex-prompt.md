# Sprint 238h — iPhone privacy manifest: 17 data types now that analytics is off (iPhone, small) — rev 1

## 1. Objective
Make the app's privacy manifest and audit match the App Store privacy label we will publish. Owner decision Q6 turned
analytics off; production has `NEXT_PUBLIC_ENABLE_ANALYTICS` unset, so `<Analytics />` never renders
(`apps/web/app/layout.tsx:125`). Device ID and Browsing History were declared only for Vercel Analytics. Remove them so
the manifest lists the same 17 types as `docs/app-store/app-privacy-answers.md` §1a (gate G2 there).

## 2. Context
- `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` (252 lines): 19 `NSPrivacyCollectedDataTypes` entries, including
  `NSPrivacyCollectedDataTypeDeviceID` and `NSPrivacyCollectedDataTypeBrowsingHistory` (both linked, not tracking,
  purpose Analytics).
- `apps/ios/PRIVACY-AUDIT.md`: section 3 rows at `:130-131` give Vercel Analytics as the only source for those two
  types; section 4 step 2 (`:169`) and section 5 (`:178`) say "19"; the machine-readable table between
  `<!-- manifest-data:start -->` and `<!-- manifest-data:end -->` has rows for both at `:204-205`. U1 (`:9-11`) says
  "Analytics label removal waits for Sprint 238c" (238c shipped `f8807c1`).
- `apps/ios/scripts/config.test.cjs:85-104` parses that table and asserts it deep-equals the manifest; `:431-437` checks the
  built bundle has the exact manifest.
- Claude verified on 2026-10-16: Vercel production env has no `NEXT_PUBLIC_ENABLE_ANALYTICS`; e-sign IP and user agent
  map to Other Diagnostic Data (audit `:133-140`), which stays.

## 3. In scope
Remove the two rows from the manifest and the audit table; update the audit text that says 19 and the U1 note; tests.

## 4. Out of scope
Any other data type or purpose; web app code; `Info.plist`; App Store Connect (Claude enters the label).

## 5. Exact files expected to change
1. `apps/ios/ios/App/App/PrivacyInfo.xcprivacy`
2. `apps/ios/PRIVACY-AUDIT.md`
3. `apps/ios/scripts/config.test.cjs`

## 6. Implementation requirements
1. Delete exactly the DeviceID and BrowsingHistory dictionaries from `NSPrivacyCollectedDataTypes`; every other entry,
   `NSPrivacyTracking=false`, empty tracking domains and the UserDefaults `CA92.1` API entry stay byte-identical.
2. Audit: remove both rows from the section 3 table and the manifest-data table; change "19" to "17" at `:169` and
   `:178`; add one line under them: "Device ID and Browsing History were removed in 238h: analytics is off in production
   (Q6; `NEXT_PUBLIC_ENABLE_ANALYTICS` unset). Re-add both if analytics is ever turned on." Update U1 to "Analytics label
   removed in 238h."
3. Test: add an assertion that the manifest has exactly 17 collected types and neither `...DeviceID` nor
   `...BrowsingHistory`; keep the table↔manifest deep-equal test.
4. `plutil -lint` passes. Lines ≤ 140.

## 7. Validation commands
```
cd apps/ios && plutil -lint ios/App/App/PrivacyInfo.xcprivacy && node --test scripts/config.test.cjs
```
(Move `ios/App/Signing.local.xcconfig` aside if required and restore it.) Do NOT run `testflight.sh`.

## 8. Acceptance criteria
1. `config.test.cjs` "privacy manifest matches audit flags/purposes and App Resources" passes with 17 rows.
2. New assertion: exactly 17 types; DeviceID and BrowsingHistory absent.
3. `git diff` of the manifest shows only the two removed dictionaries.

## 9. Report format
Compact status only: files changed with line counts, tests per criterion, command results. Do NOT include "Claude prompt"
or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the files in §5. No new dependencies. No signing/entitlement changes.
