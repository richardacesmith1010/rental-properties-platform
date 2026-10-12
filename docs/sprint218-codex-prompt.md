# Sprint 218 — Sign-in and Create account in the Wallet look (L3, auth-adjacent UI) · rev 2 (ChatGPT review: APPROVE WITH CHANGES, folded in)

The owner approved this on 2026-10-11. Mockups are the artboards **"Sign in"** and **"Create account"** (row 2) on https://claude.ai/artifact/FsvezREEzyFY6WXg9PDqo4.

## 1. Objective
Today `/login` asks people to pick a role card (Owner / Manager / Tenant) before they can even sign in. Signing in doesn't need a role: the server already routes by the stored role (`loginAction` → `redirect("/")`).

Rebuild `/login` as two plain screens:
1. **Sign in:** email + password only, plus "Forgot password?" and a "Create an account" button.
2. **Create account:** first "What brings you to Domus?" (3 radio cards), then email + password + confirm.

The auth calls, the rate limit, redirects and the callback handling must stay exactly as they are today. There are **no auth or backend behavior changes**, but splitting the auth component is real risk, so treat it carefully.

Also ride-along: the dark-mode Money period switch's selected segment is hard to see (Sprint 217b finding).

## 2. Context (HEAD `a8d0661`, branch `main`)
- **`app/login/page.tsx` (194 lines):**
  - a marketing hero on the left at `lg` (hidden on phones), plus a card;
  - the card holds alerts for `sessionExpired`, `confirmed`, `password_reset`, `error=invite_expired`, `error=reset_link_expired` and the other `error` values;
  - then `RoleSelector`;
  - the "New to Domus? Create an account" link goes to `/login?mode=signup&role=owner`;
  - a signed-in user is redirected to their role home.
- **`components/auth/role-selector.tsx` (142 lines):** 3 role cards. Each expands `LoginForm` with `nextPath` (`/owner`, `/manager`, `/tenant`) and `role`.
- **`components/auth/login-form.tsx` (452 lines):**
  - **sign-in mode:** the `loginAction` server action (`app/actions/login.ts`). This holds the rate limit `reserveFailureAttempt('login:'+email, 5, 900_000)`, `signInWithPassword` and `redirect("/")`.
  - **forgot mode:** reset email.
  - **signup mode:** client `supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/callback?next=' + nextPath, data: role ? { role } : undefined } })`. It enforces password strength (`validatePassword`) and a matching confirm.
    - `user_already_exists` is treated as success. That's deliberate and must stay (no account enumeration).
  - **"Check your email" screen:** has a resend button with a 60s cooldown.
- **Links into `/login` that must keep working:**
  - `?mode=signup&role=owner` (`components/marketing/landing-page.tsx:34,93`);
  - `?confirmed=true&next=…`, `?password_reset=true`, `?error=…` (`app/auth/callback/route.ts`, `reset-password-form.tsx`).
- **E2E helpers click the role card first:** `apps/web/tests/e2e/helpers.ts` (`loginAsRole`: `getByRole("button", { name: new RegExp("^" + role) })`) and `tests/e2e/smoke-keyboard.spec.ts`. The production smoke suite depends on these.
- **Money period switch:** `components/home-money/period-switch.tsx`. In dark mode, the selected segment (`--surface`) is nearly the same as the track (`--surface-2`).
- Plain-language rules: CLAUDE.md §18. Wallet tokens and the Geist font shipped in Sprint 215.

## 3. In scope
### 3.1 Sign in (default `/login`)
1. **Phone-first single column** on `--ground`, max width 420px, centered, with no card.
2. **Content, top to bottom:**
   - a 56px rounded accent tile with the house icon (`aria-hidden`);
   - h1 "Welcome back" (34px/700);
   - "Sign in to see your rent, bills and homes." (17px muted);
   - the existing alerts in their current order and with their current copy, restyled with the existing `Alert` component;
   - **Email:** label "Email", `type=email`, `autocomplete=email`, 52px high, 14px radius;
   - **Password:** label "Password", `autocomplete=current-password`, same size and radius;
   - a "Forgot password?" link-button, right-aligned, 44px high, opening the existing forgot flow in place;
   - a full-width "Sign in" accent button, 54px high, 16px radius.
3. **Bottom:** "New to Domus?" (muted), then a full-width white 52px "Create an account" button. It's an `<a href="/login?mode=signup">`.
4. **The form posts to the existing `loginAction`, unchanged.**
   - Show its error text exactly as today in an `role="alert"` region.
   - Disable the button while it's pending, with the label "Signing in…".
5. **Desktop `lg+`:** keep the left marketing hero as it is today. The right side becomes this new column (no card).

### 3.2 Create account (`/login?mode=signup`, with an optional `role=owner|manager|tenant`)
1. A "‹ Sign in" back link at the top (44px, to `/login`), then h1 "Create your account", then "First, what brings you to Domus?"
2. **A radiogroup** (`role="radiogroup"`, `aria-label="I am"`) of 3 radio cards. Use native `<input type="radio">` inside a `<label>`, styled as cards: 72px high, 16px radius, with a 2px accent border when selected. The cards are:
   - `owner`: "I own rentals" / "Track rent, bills and taxes";
   - `manager`: "I manage rentals for others" / "Run homes for owners";
   - `tenant`: "I rent a home" / "Pay rent and report problems".
   - The `role` query param preselects one; the default is `owner`.
3. Under the cards: "Renting from someone on Domus? Use the link they sent you." (13px muted, centered).
4. A **Continue** button (54px accent) reveals step 2 on the same page, with no navigation:
   - Email, Password (with the existing `PasswordStrengthMeter`), Confirm password;
   - a "Create account" button;
   - a "‹ Change" link back to step 1 that keeps the typed email.
5. **Signup calls the existing client `supabase.auth.signUp`, byte-for-byte the same as today:**
   - `data: { role }` is the selected radio value;
   - `emailRedirectTo` = `origin + '/auth/callback?next=' + encodeURIComponent(rolePath)`, where `rolePath` is `/owner` | `/manager` | `/tenant` (today's mapping);
   - `user_already_exists` is still treated as success;
   - the same password validation and confirm rules apply;
   - the same "Check your email" screen, with the resend and 60s cooldown.
6. `?mode=signup&role=owner` (marketing links) lands on step 1 with Owner selected.

### 3.3 Structure
1. Replace `RoleSelector` usage on `/login`. Delete `role-selector.tsx` only if nothing else imports it (grep the full tree, per L-006).
2. Split `login-form.tsx` into:
   - `components/auth/sign-in-form.tsx`;
   - `components/auth/create-account-form.tsx`;
   - `components/auth/check-email.tsx` (the shared "Check your email" screen and resend);
   - and keep the forgot-password view.
   - Each file ≤ 200 lines.
3. Keep every existing `title` / `aria` attribute pattern. Use real `<form>` elements, so Enter submits.

### 3.4 E2E helpers (so the production smoke keeps working)
- `tests/e2e/helpers.ts` `loginAsRole`: stop clicking a role card. Fill Email and Password, then click the "Sign in" button. Keep the signature, and ignore `role` for sign-in.
- Update `tests/e2e/smoke-keyboard.spec.ts`, and every other e2e spec that clicks a login role card (grep `"^Owner"`, `/^Owner/`, `new RegExp("^" + role)` under `apps/web/tests/e2e`), the same way.
- Signup-flow specs select the radio by its label.

### 3.5 Ride-along: Money period switch in dark mode
In `period-switch.tsx`, the selected segment uses `--accent` fill with white text in **dark mode only** (`dark:` or the existing dark token hook). Light mode is unchanged. Contrast must be ≥ 4.5:1.

## 4. Out of scope
- Any change to `app/actions/login.ts`, `app/actions/forgot-password.ts`, `lib/rate-limit`, `app/auth/callback/route.ts`, the reset-password page, `handle_new_user` or any DB function, RLS or Supabase auth settings.
- Magic links (the current form has none; don't add one).
- Face ID (Sprint 219), `apps/ios`, `apps/mobile`.

## 5. Exact files expected to change
- `apps/web/app/login/page.tsx`
- `apps/web/components/auth/login-form.tsx` (split into the three new files below, or reduced to a re-export shim)
- `apps/web/components/auth/sign-in-form.tsx`, `create-account-form.tsx`, `check-email.tsx` (new)
- `apps/web/components/auth/role-selector.tsx` (delete only if unused)
- `apps/web/components/home-money/period-switch.tsx`
- `apps/web/tests/e2e/helpers.ts`, `apps/web/tests/e2e/smoke-keyboard.spec.ts`, plus any e2e spec found by the §3.4 grep
- Unit tests:
  - `components/__tests__/login-form.test.tsx`, `app/login/__tests__/*`, `app/actions/__tests__/login.test.ts` (read-only unless an import path moves);
  - new tests for the two forms;
  - the period-switch test.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines.
- Use tokens only, with no new hex values.
- Use 44px+ targets and visible labels (no placeholder-only fields).
- Text contrast ≥ 4.5:1 in light and dark.
- Copy, exactly:
  - "Welcome back"
  - "Sign in to see your rent, bills and homes."
  - "Email"
  - "Password"
  - "Forgot password?"
  - "Sign in"
  - "Signing in…"
  - "New to Domus?"
  - "Create an account"
  - "Create your account"
  - "First, what brings you to Domus?"
  - the 3 card labels and notes in §3.2
  - "Renting from someone on Domus? Use the link they sent you."
  - "Continue"
  - "Confirm password"
  - "Create account"
  - "‹ Sign in"
  - "‹ Change"
- Keep all existing alert, error, success and check-email copy verbatim.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.
- **Security invariants (L-021):**
  - The sign-in path still calls only `loginAction`, so the rate limit still applies.
  - Sign-in never sends a role.
  - Signup's `options.data` contains **only** `{ role }`, with role ∈ {owner, manager, tenant} validated client-side against that list; anything else falls back to `owner`.
  - The "already exists" path is still indistinguishable from success.
  - No new server action, API route or DB call.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Run `rm -rf apps/web/.next` first if tsc reports " 2" duplicates.
- Don't run `gate:web` or the e2e suite (Claude runs them against production).

## 8. Acceptance criteria (binary; each one needs a named test that calls real code, or the static verification named in that item)
1. **Sign in:**
   - (a) it renders Email, Password, "Forgot password?", "Sign in" and "Create an account", with no role cards;
   - (b) submitting calls `loginAction` with only `email` and `password` form fields;
   - (c) a `loginAction` error shows in `role="alert"`;
   - (d) "Forgot password?" opens the existing forgot view.
2. **Alerts:** each of `session expired`, `confirmed=true`, `password_reset=true`, `error=invite_expired`, `error=reset_link_expired`, and another `error` renders its existing copy (6 cases).
3. **Create account:**
   - (a) `?mode=signup&role=manager` preselects Manager;
   - (b) with no role, it defaults to Owner;
   - (c) an invalid role → Owner;
   - (d) Continue reveals the fields;
   - (e) "‹ Change" goes back and keeps the email;
   - (f) `signUp` is called with `data: { role: 'tenant' }` and `emailRedirectTo` ending `/auth/callback?next=%2Ftenant` when Tenant is chosen;
   - (g) `user_already_exists` → the "Check your email" screen;
   - (h) a weak password or a mismatch blocks the call.
   - (i) **Allowlist at the call boundary:** for `?mode=signup&role=admin` (and `role=../evil`), the actual `signUp` call receives `options.data.role === "owner"` and `emailRedirectTo` ending `/auth/callback?next=%2Fowner`.
   - (j) **No enumeration:** the `user_already_exists` path and a normal success render the same visible "Check your email" output. Compare the rendered text and the presence of the resend button.
   - (k) Pick Manager → Continue → "‹ Change" → pick Tenant → submit. `signUp` gets `role: "tenant"` with `next=%2Ftenant`, so no stale role is used.
   - (l) Pressing Enter in the password field submits both sign-in and signup step 2.
4. A signed-in user visiting `/login` is still redirected to their role home (the existing test still passes).
5. `loginAsRole` in `tests/e2e/helpers.ts` no longer references a role button (asserted by reading the file in a unit test, or shown in the report with a grep).
6. The period switch in dark mode: the selected segment has the accent class, and light mode is unchanged (test).
7. Lint, typecheck, the full vitest suite and the build are green.

## 9. Report format
JSON per `docs/codex-report-schema.json`. Include:
- the test names mapped to each §8 item;
- where the forgot-password view (`forgotPasswordAction`) lives now.

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- No DB access, deploy, commit or push. Don't run `gate:web` or e2e.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or any "* 2.*" files.
- Don't invent URLs, emails or copy beyond what's specified here.
