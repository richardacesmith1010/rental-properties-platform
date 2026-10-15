# Sprint 235b-b — Update one validation test fixture for the new tenant name fields (L1)

## 1. Objective
Sprint 235b made `tenantFirstName` and `tenantLastName` required in `unifiedSetupLeaseSchema` when a tenant is added.
One existing test's "valid payload" fixture lacks them, so the full suite is 2474/2475.

## 2. Context
- Working tree has 235b's uncommitted changes. Keep them.
- Failing test: `apps/web/lib/__tests__/validations.test.ts:655`, "createPropertyWithSetupSchema accepts a valid unified
  property setup payload" (`expected false to be true`).

## 3. In scope
Add `tenantFirstName` and `tenantLastName` (e.g. "Maya" / "Lopez") to that fixture's tenant/lease part, matching the
schema field names exactly. If any other fixture in the same file builds a tenant payload that should be valid, add the
fields there too.

## 4. Out of scope
Any change to the schema or app code. Any other test file.

## 5. Exact files expected to change
1. `apps/web/lib/__tests__/validations.test.ts`

## 6. Implementation requirements
Also add one case in the same file: the same valid payload with `tenantFirstName` removed → `success: false` with the
message `Enter the tenant's first and last name.` (only if the schema returns that message; otherwise assert
`success: false` and report the actual message).

## 7. Validation commands
```
cd apps/web && npx vitest run lib/__tests__/validations.test.ts
cd apps/web && npx vitest run --reporter=dot
```

## 8. Acceptance criteria
- The named test passes; full suite 2476/2476 (2475 + the new case).

## 9. Report format
Compact status only. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
Only the one file. No new dependencies.
