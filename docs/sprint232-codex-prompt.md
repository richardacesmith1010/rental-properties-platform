# Sprint 232 — Code health: two files back under 500 lines (L3: touches a money server action) — rev 2 (rev 1 ChatGPT APPROVE WITH CHANGES, all 7 REQUIRED + 4 OPTIONAL adopted)

## 1. Objective
Bring `apps/web/app/actions/connect.ts` (508 lines) and
`apps/web/components/dashboard/sections/render-section-cases.tsx` (501 lines) under 500 lines
with **verbatim moves only**. No behavior change. First pin `updateManagementFee` with a
characterization test, because it has no test today.

## 2. Context
- HEAD: `7fd8bf8` (main). Scorecard: Code health 79; this is the step back to 80.
- `apps/web/app/actions/connect.ts` — 508 lines, 18,300 chars, `"use server"`. Exports
  `initiateStripeConnect`, `initiateAccountStripeConnect`, `initiateMemberPayoutConnect`,
  `checkConnectStatus`, `getExpressDashboardUrl` (Stripe Connect) and `updateManagementFee`
  (lines 394–508: sets the manager's flat fee in `manager_payment_configs`; not Stripe Connect).
- `updateManagementFee` callers: `apps/web/app/actions/index.ts` (re-export, line 16) and
  `apps/web/app/owner/page.tsx` (imports it from `@/app/actions`, line 94). No test covers it.
- `apps/web/app/actions/__tests__/connect.test.ts` (197 lines) tests the Connect actions only.
  Reuse its mocking style (vi.mock of `@/lib/supabase/admin`, `@/app/actions/auth-helpers`,
  `@/lib/rate-limit`, `@/lib/property-access`, `@/lib/audit`, `@/lib/logger`, `next/cache`).
- `apps/web/components/dashboard/sections/render-section-cases.tsx` — 501 lines, 22,018 chars.
  Lines 23–34 define `AnalyticsSection` with `next/dynamic` (`ssr: false`, loading text
  "Loading analytics..."). Only this file uses it. The file has no `"use client"` line, but it is
  only reached from client modules: `components/dashboard/section-renderer.tsx` is imported by
  `components/dashboard/index.tsx` and `components/dashboard/dashboard-data-loader.tsx`, both `"use client"`.

## 3. In scope
- New characterization test for `updateManagementFee` (written and green **before** the move).
- Move `updateManagementFee` verbatim to a new `"use server"` file `apps/web/app/actions/management-fee.ts`.
- Move the `AnalyticsSection` dynamic definition verbatim to a new file
  `apps/web/components/dashboard/sections/analytics-section-lazy.tsx` and import it.

## 4. Out of scope
- Any change to logic, copy, error messages, queries, rate-limit keys, audit fields or revalidated paths.
- The other files over 500 lines (`stripe-webhook-handlers.ts`, `account-wipe.ts`, `ownership.ts`,
  `stripe-connect.ts`) — not this sprint.
- Renaming exports, changing `apps/web/app/actions/index.ts` export names, or touching `section-map.ts`.

## 5. Exact files expected to change
1. `apps/web/app/actions/__tests__/management-fee.test.ts` (new)
2. `apps/web/app/actions/management-fee.ts` (new)
3. `apps/web/app/actions/connect.ts`
4. `apps/web/app/actions/index.ts` (re-export source for `updateManagementFee` only)
5. `apps/web/components/dashboard/sections/analytics-section-lazy.tsx` (new)
6. `apps/web/components/dashboard/sections/render-section-cases.tsx`

No other file may change. `apps/web/app/owner/page.tsx` keeps importing from `@/app/actions`.

## 6. Implementation requirements
Do these in order.
1. **Test first.** Write `management-fee.test.ts` importing `updateManagementFee` from
   `@/app/actions/connect`. Run it against the unchanged code; it must pass. Then do the move
   and change only the import path to `@/app/actions/management-fee`. It must still pass with no
   other edit to the test.
2. **Move `updateManagementFee`.** Cut lines 394–508 of `connect.ts` into `management-fee.ts`
   character for character. The new file starts with `"use server";` and imports exactly what the
   function uses (`revalidatePath`, `createAdminClient`, `canUserAdministerProperty`, `logAudit`,
   `sideEffectError`, `checkRateLimit`, `isMissingSchemaError`, `parseFormData`,
   `updateManagementFeeSchema`, `requireAuth`, type `ActionState`). Remove from `connect.ts` only
   the imports that become unused; lint must be clean.
3. **Re-export.** In `index.ts`, export `updateManagementFee` from `./management-fee` and keep the
   other five names exported from `./connect`. Do not add any re-export inside a `"use server"` file.
4. **Move `AnalyticsSection`.** Cut the `const AnalyticsSection = dynamic(...)` block (lines 23–34)
   into `analytics-section-lazy.tsx` as `export const AnalyticsSection = dynamic(...)`, unchanged.
   The new file's first line is `"use client";` (keeps `ssr: false` inside a Client Component
   module, explicitly). Then `import dynamic from "next/dynamic";` and the import path adjusted from
   `"../analytics-section"` only if the new file's location requires it (it sits in the same
   folder, so the path stays `"../analytics-section"`). In `render-section-cases.tsx`, import it
   from `"./analytics-section-lazy"` and drop the `next/dynamic` import if now unused.
5. **Verbatim rule (primary check).** `connect.ts` and `render-section-cases.tsx` may differ from
   HEAD only by removing the moved function/block and by necessary import edits. The moved
   `updateManagementFee` function and the `AnalyticsSection` `dynamic(...)` call must be
   byte-identical to HEAD (only `const` → `export const` on the AnalyticsSection line is allowed).
   Claude diffs this. Every changed or new line ≤ 140 characters; no line merging or reformatting.
   (Secondary L-015 check: non-whitespace characters across old + new files within ±10% of before.)

## 7. Validation commands
```
cd apps/web && npx vitest run app/actions/__tests__/management-fee.test.ts app/actions/__tests__/connect.test.ts
cd apps/web && npx tsc --noEmit
npm run lint:web
npm run build:web   # Next.js compile: checks the "use server" barrel and the next/dynamic client boundary
wc -l apps/web/app/actions/connect.ts apps/web/components/dashboard/sections/render-section-cases.tsx
```
`build:web` needs no database; CI runs it with placeholder env vars (NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, CRON_SECRET — see `.github/workflows/ci.yml`). If your sandbox
cannot finish it (e.g. no network), say so in the report; Claude runs it. Do NOT run
`npm run gate:web` (its runtime verifier needs the database). Claude runs it.

## 8. Acceptance criteria
`management-fee.test.ts` has at least these 14 cases, each calling `updateManagementFee`.
"No write" means: no `upsert` on `manager_payment_configs` and no `logAudit` call.
1. Calls `requireAuth("owner")` with exactly that one role (owner only).
2. Rate limit hit → `{ success: false, error: "Too many requests. Please try again later." }`;
   `parseFormData`/`createAdminClient` never called (no database access at all).
3. Invalid form (e.g. missing `propertyId` or a negative fee) → returns the exact result
   `parseFormData(updateManagementFeeSchema, formData)` gives (assert the literal object); no write.
4. `canUserAdministerProperty` false → `"Access denied."`; no write.
5. Units query error → `"Unable to validate the management fee for this property."`; no write.
6. Fee above the highest unit rent → the exact "cannot exceed the highest unit rent" message with
   both dollar amounts (assert the full string); no write.
7. Fee > 0, no active config and no active manager → "Assign an active manager to this property
   before setting a management fee."; no write.
8. Happy path with an active config → `from("manager_payment_configs")` on the **request** client
   (not admin), and `upsert` called with exactly (`toEqual`, not `objectContaining`, except
   `updated_at` matched as any ISO string):
   `{ property_id, manager_profile_id: <config's id>, payment_type: "flat", percentage_rate: null,
   flat_amount_cents: dollars × 100, base_rent_cents: null, label: "Property Management Fee",
   frequency: <config's frequency>, active: true, updated_at }` and
   `{ onConflict: "property_id,manager_profile_id" }`; returns
   `{ success: true, message: "Management fee updated." }`; `revalidatePath` called with exactly
   `/owner` and `/manager`; `logAudit` called with `action: "update_management_fee"`,
   `entityType: "property"`, `entityId: propertyId`, `metadata: { propertyId, managementFeeCents }`.
9. No active config but an active manager → upsert uses that manager's `manager_profile_id` and
   `frequency: "monthly"` (exact payload as in 8).
10. Fee 0 with an active config → upsert with `flat_amount_cents: 0`, `active: false`.
11. Fee 0 with no active config → no manager lookup, no upsert, but still success +
    `logAudit` + revalidate (pin whatever HEAD does; assert it).
12. Active-config query error: missing-schema error → "This feature requires a database update.";
    other error → "Failed to update management fee." (two `it` cases or one `it.each`).
13. Active-manager query error: same two branches as 12.
14. Upsert error: same two branches as 12.
Use the real `isMissingSchemaError` (do not mock `@/lib/supabase-errors`); build the
missing-schema error the way `lib/supabase-errors.ts` recognizes it.
Also:
- `connect.ts` < 500 lines and `render-section-cases.tsx` < 500 lines.
- `connect.test.ts` passes unchanged (not edited).
- One barrel assertion in `management-fee.test.ts`: `(await import("@/app/actions")).updateManagementFee`
  is the same function as the `management-fee.ts` export.
- tsc, lint and `build:web` clean.

## 9. Report format
Compact status only: files changed with line counts before/after, test count, the vitest/tsc/lint
results, and max line length of the new files. Do NOT include "Claude prompt" or "recommended next
steps for Claude" sections. Report compact status only.

## 10. Constraints
- Verbatim moves: the body of `updateManagementFee` and the `AnalyticsSection` block must be
  byte-identical to the originals (Claude diffs them).
- No new dependencies. No changes outside §5. No `]:hidden` / `]:opacity-0` child selectors.
- Do not edit any `docs/` file. Only the six files in §5 may change.
