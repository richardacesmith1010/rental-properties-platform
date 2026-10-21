# Sprint 245a-fix1 — Middleware must forward refreshed session cookies (L3 follow-up)

## 1. Objective
245a (uncommitted in the working tree — keep all of it) clones `request.headers` into `requestHeaders` at the top of
`apps/web/middleware.ts`, then in Supabase `setAll` calls `request.cookies.set(...)` (which updates
`request.headers`' `cookie`) but forwards the **old** `requestHeaders`. When the session token refreshes in middleware,
server components downstream would receive the stale `cookie` header (expired access token) together with
`x-domus-path`. Before 245a, `NextResponse.next({ request })` forwarded the updated cookies.

## 2. Context
HEAD `550f9d7` + uncommitted 245a. Packet `docs/sprint245a-codex-prompt.md` rev 3 (ChatGPT APPROVE) governs.

## 3. In scope
In `setAll`, after updating `request.cookies`, rebuild the forwarded headers from the **current** `request.headers`
(delete any client `x-domus-path`, set it to the real `pathname + search`) and create the response with them. Use one
small local helper (e.g. `forwardedHeaders(request)`) for both the initial response and the `setAll` path.

## 4. Out of scope
Everything else in 245a.

## 5. Exact files expected to change
- `apps/web/middleware.ts`
- `apps/web/__tests__/middleware.test.ts`

## 6. Implementation requirements
Keep the "navigation metadata only" comment. Lines ≤ 140 characters.

## 7. Validation
```
cd apps/web
npx vitest run __tests__/middleware.test.ts
npm run gate:web
```

## 8. Acceptance criteria
- M1 Extend S12: after a simulated `setAll` refresh (`sb-test-auth-token=fresh`), the **forwarded request** headers
  (as Next encodes them on the response: `x-middleware-override-headers` plus `x-middleware-request-cookie` and
  `x-middleware-request-x-domus-path`) contain the fresh cookie value and the real path — not the incoming stale cookie.
  Assert exact values with `toEqual`/`toContain`.
- M2 Spoofed incoming `x-domus-path` is still replaced on both the no-refresh and refresh paths.
- M3 Gate green (counts verbatim).

## 9. Report format
Compact status only. Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact
status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change).
