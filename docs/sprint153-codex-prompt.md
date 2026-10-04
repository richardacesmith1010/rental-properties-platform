# Sprint 153 — Owner section reads via a GET route handler (stop hidden full-page refreshes)

**Severity: L3** — ChatGPT review: APPROVE WITH CHANGES; all 5 required + 4 optional adopted. (Replaces the Server Action transport with a new authenticated, data-returning GET endpoint; same auth/scoping logic; no money, schema, or copy changes.)

## 1. Objective
Stop the hidden full `/owner` server render that fires on most owner section clicks. Observed behavior (empirically reproduced in production on Next 14.2.5, 2026-10-04 — treat as a reproduced behavior, not an invariant this sprint depends on): a **Server Action still in flight when the URL changes via `history.replaceState`** makes the App Router refetch the whole RSC tree for the new URL. Sprint 152's neighbour preloads call the Server Action `loadOwnerSectionData`, so nearly every arrow click triggers a hidden ~2 s full render, which also clears the client overlay and causes duplicate re-preloads. (Two quick clicks reproduce it even with preloading disabled — Sprint 151 had the same latent bug.)

Fix: serve section data from a **GET route handler** called with `fetch`, which never touches the App Router. Expected result: zero RSC refetches during owner section navigation; preloads happen once per section per scope; arrow clicks to preloaded neighbours stay ~50–350 ms.

## 2. Context
- Branch `main`, HEAD `49b8e61` or later docs-only. Next 14.2.5.
- Current read path: `apps/web/app/actions/owner-section-data.ts` `loadOwnerSectionData(input)` — session auth (`createClient().auth.getUser()`) → Zod (`section` must be in `OWNER_SECTION_IDS`; optional `account`, `property`, `mode`, `preload`; `.strict()`) → `getCurrentUserRole === "owner"` → onboarding/setup checks → `resolveOwnerPageRequest` against the user's own ownership accounts → administered-property scoping of `property` → `buildOwnerBundlePlan` minus `OWNER_SHARED_BUNDLES` → `loadOwnerSectionBundles` (shared with the page in `apps/web/app/owner/owner-page-data.ts`). Returns `{status:"ready",data}` | `{status:"role-mismatch"|"needs-onboarding"|"needs-setup"}` | `{error}`.
- Client: `apps/web/components/dashboard/owner-section-cache.ts` `useOwnerSectionCache` calls `props.loadSection(input)` for clicks and preloads; `apps/web/app/owner/page.tsx` passes `loadSection={loadOwnerSectionData}` to `OwnerSectionDataProvider`.
- Existing route-handler auth pattern: e.g. `apps/web/app/api/pdf/receipts/route.ts` (`createClient().auth.getUser()` → 401 JSON; `export const dynamic = "force-dynamic"`; `Cache-Control: private, no-store`).
- **Serialization trap:** the Server Action used React Flight, which preserves `Map` (e.g. `ownerConnectedMap` is a `Map<string, boolean>`). JSON does not. Every bundle field must round-trip identically through the new transport.

## 3. In scope
1. **Shared core:** move the body of `loadOwnerSectionData` into a server-only function (e.g. `loadOwnerSectionDataForUser(user, input)` in a non-`"use server"` module such as `apps/web/app/owner/owner-section-data-core.ts`, importing `server-only` if the repo uses it) that takes the **session user** and the raw input and keeps the exact same order and outcomes (validate → role → onboarding/setup → owned-account → property scoping → section bundles only). No user id or role may come from the client.
2. **New GET route** `apps/web/app/api/owner/section-data/route.ts`:
   - `export const dynamic = "force-dynamic"`; `runtime = "nodejs"`.
   - Authenticate from the session; no user → `401 {error}`.
   - Input from query string only (`section`, `account`, `property`, `mode`, `preload=1`). Reject unknown params **and duplicate recognized params** (e.g. `?account=A&account=B`, `?section=x&section=y`) with `400 {error}` — never rely on first/last-value behaviour of `.get()` / `Object.fromEntries`. Build one canonical raw-input object and feed it into the existing strict Zod validation.
   - Non-owner / onboarding / setup → `200 {status}` (same typed statuses as today, so the client falls back exactly as now). Unexpected errors → `500 {error:"Unable to load this section."}` with no raw DB error text.
   - Response headers: `Cache-Control: private, no-store`; `Vary: Cookie`. No CORS headers (same-origin only).
   - Keep `[perf:owner]` events with `route: "owner-section-data-api"` and `preload: true` when applicable.
3. **Serialization (type-driven):** first inventory the complete ready payload (every bundle `loadOwnerSectionBundles` can return) for non-JSON-safe values — `Map`, `Set`, `Date`, `BigInt`, `undefined` inside arrays/objects, class instances, `NaN`/`Infinity` — and list what you found in the report. Build one shared codec that explicitly preserves every encountered type (tagged encoding), used by both the route and the client; no ad-hoc per-field hacks. Put the codec in a **transport-neutral module** that imports neither server-only nor client-only code; the server core itself must remain impossible to import into a client bundle.
4. **Client:** `owner-section-cache.ts` uses a `fetch`-based `loadSection` (`GET /api/owner/section-data?...`, `credentials: "same-origin"`, `cache: "no-store"`) that decodes the payload; support `AbortController` with explicit ownership: (a) a scope/epoch invalidation aborts **all** old-scope requests (clicks and preloads); (b) a superseded standalone click aborts only its own fetch; (c) a click that attached to an in-flight preload must **not** abort the shared preload fetch when the click is superseded — the preload stays owned by the cache lifecycle unless its scope becomes invalid. Aborts are silent. A decode failure on a click follows the `router.refresh()` fallback; a decode failure during preload is silent. All Sprint 151/152 rules stay: scope key, epoch + request id guards, single in-flight preload, de-dupe of click-onto-preload, silent preload failure, `router.refresh()` fallback for click failures / non-ready statuses (401 → treat as non-ready).
5. **Remove** the Server Action `loadOwnerSectionData` and its `loadSection` prop wiring from `page.tsx` once nothing imports it (grep the whole `apps/web` tree first — L-006). The page path keeps using `loadOwnerSectionBundles` unchanged.

## 4. Out of scope
- Auth/role rules themselves, the fixed auth prefix cost, shared-bundle loaders, manager/tenant navigation, schema, payments, UI/copy.
- No DB writes, deploy, env/secret changes, commit, or push.

## 5. Exact files expected to change
`apps/web/app/api/owner/section-data/route.ts` (new), `apps/web/app/owner/owner-section-data-core.ts` (new, or an equivalent server-only module — name it), `apps/web/app/actions/owner-section-data.ts` (deleted), `apps/web/components/dashboard/owner-section-cache.ts`, `apps/web/app/owner/page.tsx`, and a small shared encoder/decoder module if not placed in the core file (name it). Plus tests. ≤ 6 non-test files (a deleted file counts).

## 6. Implementation requirements
- Tests (Vitest):
  - Route: no session → 401 and zero data reads; unknown/invalid params → 400; non-owner → typed status, no bundle reads; foreign `account` / foreign `property` → assert every bundle loader receives only the authenticated user's id, the resolved owned account, and the administered-property scope, and the response contains **no** fixture data belonging only to the foreign account/property; returns only section bundles; `Cache-Control: private, no-store` and `Vary: Cookie` present and no `Access-Control-Allow-Origin` header; duplicate recognized params → 400; no raw DB error text on failure; `preload=1` does not change auth or data.
  - Core parity: for fixtures covering **every** bundle, the route's decoded payload deep-equals what `loadOwnerSectionBundles` produced (all inventoried types, including `ownerConnectedMap`). Malformed codec input is tested separately from HTTP/network failure.
  - Client: navigation never invokes a Server Action and never calls `router.refresh()`/`router.replace` on success; `history.replaceState` still updates the URL while the successful GET path calls neither `router.replace()` nor `router.refresh()`; a click while a preload is in flight reuses it, and superseding that click does not abort the preload; a superseded standalone click is aborted and its late result ignored; scope/epoch change aborts all old-scope requests; preload runs once per section per scope (no duplicate re-preloads); non-ready/401 on click → `router.refresh()`; preload failure silent.
- No PII in logs. Do not invent URLs or emails. The user should never need to read instructions to complete this flow; every step must be self-explanatory.

## 7. Validation commands
```bash
npm run gate:web
git diff --stat
```

## 8. Acceptance criteria (binary)
- Full `gate:web` passes (network enabled).
- Owner section reads go through `GET /api/owner/section-data`; no Server Action is used for section reads; the old action file is removed with zero remaining importers.
- Observable: a successful owner section navigation causes **zero** `/owner` RSC/tree refetches attributable to this path (verified by Claude in production).
- Duplicate and unknown query params are rejected (tests).
- Route follows auth → validate → role → onboarding/setup → owned account → property scoping; derives the user only from the session; cannot return another account's or property's data (tests).
- Every inventoried non-JSON-safe type round-trips identically across all bundles (tests); codec lives in a transport-neutral module.
- Client guards (scope, epoch, request id, abort, de-dupe, silent preload failure, refresh fallback) all covered by tests.
- Manager and tenant navigation unchanged. ≤ 6 non-test files.

## 9. Report format
Conform to `docs/codex-report-schema.json`. `self_verification.findings`: route step order, the payload type inventory and which fields needed tagged encoding, abort ownership rules, abort/de-dupe behaviour, confirmation the action file has zero importers, and expected RSC requests per owner section click (target 0).
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
No DB apply. No deploy. No env/secret changes. No commit/push — leave the working tree for Claude.
