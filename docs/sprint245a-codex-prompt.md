# Sprint 245a — After sign-in, go back to the page you asked for (L3, auth) — rev 3 APPROVED (rev 1 AWC → rev 2 AWC → rev 3 APPROVE)

## 1. Objective
When a signed-out person opens a Domus page (for example a receipt link, `/owner/money`, or `/tenant?section=rent`)
they are sent to `/login`, and after signing in they always land on their role home. Bring them back to the page
they asked for — safely: only same-site paths, only pages their role may open, never auth/API loops, and onboarding,
profile completion, invites and password recovery keep their current routing.

## 2. Context
- HEAD `b8f5739`. Next.js 15 `apps/web`, Supabase auth (password sign-in; email confirm / recovery / invite links go
  through `/auth/confirm` → `/auth/callback`). No magic-link sign-in exists.
- Guards redirect with a bare `redirect("/login")`: `lib/auth.ts:23` (`getAuthenticatedUser`, used by `requireRole`),
  `app/actions/auth-helpers.ts:24`, `app/payments/receipt/[chargeId]/page.tsx:29`, `app/ops/page.tsx:30,36` (stays plain `/login` — no role can return to `/ops`),
  `app/reset-password/page.tsx:16` (leave this one as is).
- `middleware.ts` (70 lines) refreshes the session; it does not redirect. Server components cannot see the URL.
- `app/login/page.tsx` (185 lines): no `next` in `searchParams`; signed-in users go to `getRoleHomePath(role)`;
  renders `<SignInForm />` (`components/auth/sign-in-form.tsx`, 92 lines) with no props.
- `app/actions/login.ts` (59 lines): ends `redirect("/")`; `app/page.tsx:19-22` then sends to role home.
- `app/auth/callback/route.ts` (246 lines): local `getSafeNextPath` (`:11-16`, only checks leading `/` and `//`);
  `next` is used only on the PKCE-miss branch (`:153-155`); success always goes to `resolveAuthRoute(...)`
  (`lib/route-resolver.ts`); `rawNext` is also an input to `hasInvitedSession` (`:33`) — invite links carry no `next`.
- `app/auth/confirm/page.tsx` (119 lines) rebuilds the callback URL from `token_hash` + `type` only (drops `next`).

## 3. In scope
1. **One shared guard** in the existing `apps/web/lib/route-resolver.ts`:
   `type SafeNextPath = string & { readonly __brand: "SafeNextPath" }`;
   `getSafeNextPath(raw: unknown): SafeNextPath | null`; `isNextAllowedForRole(next: SafeNextPath, role): boolean`
   (the brand means a raw string cannot be passed without going through the guard; only `getSafeNextPath` casts).
   `getSafeNextPath` (return `null` on any failure):
   - Input: string, 1–512 chars, ASCII only (every char 0x21–0x7e; this rejects spaces, controls, 0x7f, Unicode
     whitespace and slash look-alikes such as `／`, `∕`). Drop everything from the first `#`. Split at the first `?`
     into `rawPath` and `rawQuery` (possibly empty).
   - **Path** (`rawPath`): starts with exactly one `/`; no `//`, no `\`. Decode once with `decodeURIComponent`
     (reject on throw). The decoded path must again be ASCII 0x21–0x7e, contain no `%` (no double encoding), no `\`,
     no `//`, no `?` or `#` (an encoded `%3F`/`%23` in the path is rejected), and no `.` or `..` segment. Canonical
     path = `new URL(decodedPath, "https://domus.invalid").pathname` with origin check. All classification runs on this
     canonical path only (`/%6cogin` → `/login`; `/%6fwner/money` → `/owner/money`).
   - **Query** (`rawQuery`): kept **exactly as given** (never decoded or re-encoded). Every `%` must start a valid
     escape `%[0-9A-Fa-f]{2}` (reject `%zz`, `%4`, trailing `%`). Characters already limited to ASCII 0x21–0x7e, so
     nothing in the query can become a path delimiter (it is appended after `?`).
   - Result = canonical path + (`"?" + rawQuery` when `rawQuery` is non-empty), cast to `SafeNextPath`.
   - Reject canonical paths equal to or under `/login`, `/logout`, `/auth`, `/api`, `/onboarding`, `/complete-profile`,
     `/reset-password`, `/signup`, `/_next`, `/ops`.
2. **Remember the asked-for page.** `middleware.ts` clones the request headers, **deletes any client-supplied
   `x-domus-path`, then sets it** to the real `request.nextUrl.pathname + search`, and forwards those headers (also
   when `setAll` recreates the response). A code comment states it is navigation metadata only, never authorization.
   The matcher already covers every page route that uses these guards (verify and list them in the report). If the
   header is absent, guards behave as today. `getAuthenticatedUser`, `auth-helpers` and the receipt guard redirect to `/login?next=<encoded>` when
   `getSafeNextPath(header)` is non-null; otherwise plain `/login` (today's behavior).
3. **Login page + password sign-in.** `app/login/page.tsx` reads `searchParams.next`, sanitizes it, and: if already
   signed in with a complete profile → redirect to it when `isNextAllowedForRole`, else role home (today). Passes the
   safe value to `SignInForm` as a hidden `next` input. `loginAction` reads `next` from form data, re-sanitizes (never
   trusts the form), and after a successful sign-in redirects to it only if the signed-in user's auth state would
   otherwise resolve to their role home and `isNextAllowedForRole` is true; else `redirect("/")` (today).
4. **Email links.** `/auth/confirm` passes a sanitized `next` through to `/auth/callback` **only when `type` is
   `email`, `signup` or `magiclink`** — never for `invite` or `recovery` (so `hasInvitedSession` and recovery see
   exactly what they see today). In the callback's success
   branch, use `next` only when: not `recovery`, not an invite session (`hasInvitedSession` true → unchanged), and
   `resolveAuthRoute(...)` returns the role home for that role; then redirect to `next` if `isNextAllowedForRole`.
   The callback's local `getSafeNextPath` is replaced by the shared one (PKCE-miss branch keeps passing `next` to
   `/login`, now honored by item 3). The invite check must keep receiving the **raw** presence of `next` exactly as
   today (do not change invite detection).
5. Tests in §8.

## 4. Out of scope
iPhone native code (Face ID does not navigate; universal links only claim `/owner/bank/oauth-app`). Sign-up flow,
recovery destination (`/reset-password`), onboarding/profile-completion routing, invites, copy changes, styling.

## 5. Exact files expected to change
- `apps/web/lib/route-resolver.ts`
- `apps/web/middleware.ts`
- `apps/web/lib/auth.ts`
- `apps/web/app/actions/auth-helpers.ts`
- `apps/web/app/payments/receipt/[chargeId]/page.tsx` (guard redirect only)
- `apps/web/app/login/page.tsx`
- `apps/web/components/auth/sign-in-form.tsx`
- `apps/web/app/actions/login.ts`
- `apps/web/app/auth/confirm/page.tsx`
- `apps/web/app/auth/callback/route.ts`
- Tests: new `apps/web/lib/__tests__/safe-next-path.test.ts`; update/add in `apps/web/app/auth/__tests__/callback-route.test.ts`,
  `apps/web/app/actions/__tests__/login.test.ts`, `apps/web/app/login/__tests__/page.test.tsx`,
  `apps/web/__tests__/middleware.test.ts`, `apps/web/lib/__tests__/auth.test.ts` (create if missing)

## 6. Implementation requirements
1. Every `catch` around code that may `redirect()` starts with `unstable_rethrow(error)` (L-028).
2. Never echo `next` into HTML other than the hidden input value (React-escaped). Never log full `next` values with
   query strings (log the pathname only).
3. Rate limiting and error messages in `loginAction` unchanged.
4. Lines ≤ 140 characters. No new dependencies. `route-resolver.ts` stays one module (no new helper file).

## 7. Validation
```
cd apps/web
npx vitest run lib/__tests__/safe-next-path.test.ts app/auth/__tests__/callback-route.test.ts \
  app/actions/__tests__/login.test.ts app/login/__tests__/page.test.tsx __tests__/middleware.test.ts lib/__tests__/auth.test.ts
npm run gate:web
```

## 8. Acceptance criteria (named tests calling real code; assert exact values with `toEqual`)
- S1 `getSafeNextPath` accepts `/owner`, `/owner/money?year=2026`, `/tenant?section=rent`, `/payments/receipt/abc`
  (returns them exactly; `#frag` dropped).
- S2b Canonicalization rejects: `/%6cogin`, `/%61uth/callback`, `/%61pi/x`, `/owner/../tenant`, `/%2e%2e/owner`,
  `/./owner`, `/%252f%252fevil.com` (double-encoded), `/%00x`, `/%09x`, `/%7fx`, `/\u3000x`, `/\u00a0x`, `/\uff0fevil.com`,
  `/\u2215evil.com`, `/ops`, `/owner%3Fx`, `/owner%23x`, `/owner x`, `/owner?a=%zz`, `/owner?a=%4`, `/owner?a=%`,
  `/owner?a=b c`. Accepts and returns exactly: `/%6fwner/money` → `/owner/money`; `/owner?a=1&a=2&b=%20x` →
  `/owner?a=1&a=2&b=%20x`; `/tenant?section=rent%20due` → same; `/owner?q=100%25` → same; `/owner?q=a%23b%26c%3Fd` →
  same; `/owner?next=%2F%2Fevil.com` → same (query value only; path stays `/owner`); `/owner#x` → `/owner`;
  `/owner?a=1#x` → `/owner?a=1`.
- S2 Rejects (returns `null`): `null`, `""`, `"owner"`, `"//evil.com"`, `"/\\evil.com"`, `"/%2F%2Fevil.com"`,
  `"/%5cevil.com"`, `"https://evil.com"`, `"/\tx"`, `"/x\ny"`, `"/ x"`, `"/%E0%A4%A"` (bad encoding), a 513-char path,
  `"/login"`, `"/login?next=/owner"`, `"/auth/callback"`, `"/api/cron/x"`, `"/onboarding"`, `"/reset-password"`.
- S3 `isNextAllowedForRole` (called with `getSafeNextPath(...)!` values): owner `/owner/money` true, `/tenant` false,
  `/ownerx` false, `/Owner` false (routes are case-sensitive), `/settings` true; a type test (`// @ts-expect-error`)
  shows a plain string is not accepted;
  tenant `/tenant?section=rent` true, `/owner` false; manager `/manager` true, `/payments/receipt/1` true.
- S4 Middleware sets `x-domus-path` to `pathname + search` on the forwarded request, also after a session refresh
  rewrites cookies. Spoof: incoming request to `/owner/money?year=2026` carrying `x-domus-path: //evil.com` (and
  another with `/tenant`) → downstream header is exactly `/owner/money?year=2026`.
- S5 `getAuthenticatedUser` with no user and header `/owner/money?year=2026` → `redirect("/login?next=%2Fowner%2Fmoney%3Fyear%3D2026")`;
  header `/login` or missing → `redirect("/login")`.
- S6 `loginAction` success, owner, form `next=/owner/money` → `redirect("/owner/money")`; form
  `next=/owner?q=a%23b%26c` → `redirect("/owner?q=a%23b%26c")` (exact string); `next=/tenant` → `redirect("/")`;
  `next=//evil.com` → `redirect("/")`; profile incomplete (auth state → `/onboarding`) with valid `next` → `redirect("/")`;
  failed sign-in → returns the same error object as today and does not redirect.
- S7 Login page: signed-in tenant with `?next=/tenant?section=rent` → redirect there; with `?next=/owner` → `/tenant`;
  signed-in user with incomplete onboarding (auth state → `/onboarding`) and `?next=/owner/money` → today's
  onboarding redirect (not `next`); needs password set → `/complete-profile`;
  signed out with `?next=/tenant` → hidden input `next` value `/tenant`; with `?next=//evil.com` → no hidden input.
- S8 Callback success (`type=email`) + `next=/owner/money`, owner with complete profile → redirect `${origin}/owner/money`;
  same with onboarding incomplete → `/onboarding`; `type=recovery` + `next` → `/reset-password`; invite session
  (`type=invite`) + `next` → today's invite destination and `markTenantInvitationAccepted`/`markManagerInvitationsAccepted`
  calls unchanged; `next=//evil.com` → role home.
- S9 `/auth/confirm` builds `/auth/callback?token_hash=…&type=email&next=%2Fowner` for a safe `next`; omits `next` for
  an unsafe one; omits it for `type=invite` and `type=recovery` even when safe (assert the exact URL strings).
- S11 Repeated `next`: `/login?next=/owner&next=//evil.com` (searchParams array) → treated as no `next` (no hidden input;
  signed-in → role home); form data with two `next` values → `redirect("/")`.
- S12 Middleware cookie preservation: when Supabase `setAll` refreshes cookies, the returned response carries those
  cookies **and** the forwarded request has the correct `x-domus-path`.
- S13 The `@ts-expect-error` brand test lives in a `.ts` file included by `npm run typecheck` (part of the gate), so
  the compiler enforces it.
- S10 Redirect thrown inside a `try` in `loginAction`/guards is rethrown (L-028 redirect test).
Assert every listed fact; no `expect` inside mock implementations.

## 9. Report format
Compact status only: files changed with line deltas, S1–S10 → test names, validation counts verbatim. Do NOT include
'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5; list anything else. Do not commit. No Undo flow (navigation only).
The user should never need to read instructions to complete this flow: sign in, and you are where you meant to be.

Claude's live check after deploy: signed-out open `/owner/money?year=2026` → login → sign in → lands on that page.
