# Sprint 173 — Owner first impression: sign-up entry, honest marketing, setup cleanup, mobile sheets above the nav (L2)

## 1. Objective
Fix the owner first-touch items from `docs/launch-review-2026-10-05.md`, so a stranger can go from the landing page to their first home without confusion, dead links or fake numbers. Also make phone bottom sheets show their buttons above the bottom menu bar.

## 2. Context
- Branch `main`, HEAD `7a3bc33` or a later docs-only commit. Notifications stay off until launch. Reminders are not sent.
- Verify every line reference before editing; the references come from a code read.
- **Sign-up entry:**
  - The landing page `components/marketing/landing-page.tsx` (~33, ~90) sends "Start free" to the login page, which is headed "Welcome back" (`app/login/page.tsx` ~131, ~187).
  - Sign-up is a small link inside a role card (`components/auth/role-selector.tsx`).
  - The login page's "See plans and get started" link goes back to the landing page, which loops.
  - In `role-selector.tsx` (~39, ~103–107), the form sits in a one-third-width column with `max-h-[400px]` and overflow hidden. The sign-up form can be clipped, hiding "Create account".
- **Fake numbers:** `app/login/page.tsx` ~25–29 has `proofPoints`: "500+ Landlords", "2,000+ Units managed", "With Stripe + Resend: Live".
- **Promises:** `components/marketing/landing-content.tsx` (~6, ~31) says "It reminds tenants for you" and "Domus sends reminders."
- **Dead link:** `components/dashboard/welcome-card.tsx` (~85–91) has "Watch a 2-minute tour" pointing at `#owner-setup-tour`, which does not exist.
- **Setup wizard:**
  - `components/onboarding/steps/add-lease-step.tsx` (~71–82) asks for a "Tenant Profile ID" (UUID placeholder) before any tenant exists. It opens after "Add Your First Unit" (`components/dashboard/dashboard-data-loader.tsx` ~271).
  - `app/owner/setup/page.tsx` (~28–30) uses "ownership account… payouts" and never explains "LLC".
  - `components/onboarding/owner-setup-wizard.tsx` (~286) shows a raw "Account ID: <uuid>", and its Back button (~288–295) appears after the LLC is already created.
- **Wording:**
  - `components/dashboard/dashboard-home-loader.ts` (~68): "so charges can start flowing".
  - `welcome-card.tsx` (~67): "resident operations".
  - The checklist card says "Property" while the menu says "Homes".
- **Property wizard:** `components/dashboard/unified-property-wizard.tsx`.
  - Placeholders "1st Home" and "131 Chaste Tree Circle" (~436, ~440) look like the owner's real home and address.
  - The success screen (~735–736) says "ready to collect rent" even with no bank connected.
- **Mobile sheets:**
  - The live check showed the "Add a manager" bottom sheet (`components/ui/modal-overlay.tsx`, `z-50`) with its Back/Next buttons **under** the owner bottom nav (`components/dashboard/owner-bottom-bar.tsx`, `fixed bottom-0 z-40`, rendered through a portal). Find the cause, for example a stacking context, portal order, or sheet height.
  - The step copy in `components/dashboard/invitations/invite-manager-form.tsx` reads "Step 1: Pick property for manager assignment."
- **Reminder button:** the owner Home "Send reminder" (`owner-daily-ops-home.tsx` ~175) replies "Saved. Notifications are off until launch, so no one was notified."

## 3. In scope
1. **Sign-up entry:**
   - "Start free" (and any landing call-to-action that means sign-up) goes to `/login?mode=signup&role=owner`.
   - The login page reads `mode` and `role`:
     - with `mode=signup`, the heading is "Create your account" (not "Welcome back") and the Owner card opens directly in sign-up mode;
     - the default, sign in, is unchanged.
   - Replace "See plans and get started" with a "New to Domus? Create an account" link to `/login?mode=signup&role=owner`, so nothing loops back to the landing page.
   - `role-selector.tsx`: render the open form full width on mobile and at least half width on desktop, with **no max-height clipping**. "Create account" must always be visible without inner scrolling.
2. **Remove `proofPoints`** and their render block entirely. Leave no placeholder numbers.
3. **Landing promises:**
   - "It reminds tenants for you" → "It shows you who has paid."
   - "Domus sends reminders" → "See who owes rent at a glance."
4. **Remove "Watch a 2-minute tour"** from `welcome-card.tsx`.
5. **Setup wizard:**
   - Remove the "Tenant Profile ID" lease step from the setup flow. After the first unit, the next step is "Invite your tenant", using the existing tenant invite flow, or the flow finishes with a clear "Next: invite your tenant" button. Do not delete the existing lease wizard used elsewhere.
   - `app/owner/setup/page.tsx`: use plain words.
     - Explain LLC on first use: "LLC (a business you own the homes through)".
     - Replace "ownership account" with "your account", and "payouts" with "rent money".
   - `owner-setup-wizard.tsx`:
     - hide the raw Account ID;
     - remove the Back button once the account or LLC has been created;
     - show "Done" and continue instead.
6. **Wording:**
   - `dashboard-home-loader.ts` ~68 → "so rent can reach you".
   - `welcome-card.tsx` ~67 → plain words ("your homes and tenants").
   - The checklist says "Home" and "Homes", not "Property".
7. **Property wizard:**
   - placeholders → "Maple House" and "123 Main St";
   - success text: when the owner's bank is connected, "Your home is ready. Tenants can pay rent here."; otherwise, "Your home is added. Connect your bank so tenants can pay you." with a link to the existing bank setup route.
   - Use the bank status already available to the wizard or page, from `lib/owner-bank-status.ts` or existing props. Don't add new queries if a status is already loaded.
8. **Mobile sheets:** fix the root cause so that any `ModalOverlay` sheet, when open, renders fully above the owner, manager and tenant bottom navs, with its action buttons visible and tappable at 375×812. Pick one of these:
   - render the overlay through a portal to `document.body` after the nav, with a z-index above the nav; or
   - hide the bottom navs while a modal is open.

   Change the step copy to "Step 1: Pick the home."
9. **Reminder button:** while notifications are off (the existing `notificationsEnabled()` check, or the flag already passed to the client), hide "Send reminder" on the owner Home. Keep "Mark as paid". When notifications are on, the behaviour is unchanged.

## 4. Out of scope
- Plans or pricing pages, payments, auth logic (sign-in and sign-up actions stay unchanged; only the entry UI changes), emails, schema.
- The lease wizard outside onboarding.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
Source:
- `components/marketing/landing-page.tsx`
- `components/marketing/landing-content.tsx`
- `app/login/page.tsx`
- `components/auth/role-selector.tsx`
- `components/auth/login-form.tsx` (only if needed to open in sign-up mode)
- `components/dashboard/welcome-card.tsx`
- `components/dashboard/dashboard-home-loader.ts`
- `components/onboarding/steps/add-lease-step.tsx` and/or `components/dashboard/dashboard-data-loader.tsx` (removing the step from the flow)
- `app/owner/setup/page.tsx`
- `components/onboarding/owner-setup-wizard.tsx`
- `components/dashboard/unified-property-wizard.tsx`
- `components/ui/modal-overlay.tsx` and/or the three bottom-bar components
- `components/dashboard/invitations/invite-manager-form.tsx`
- `components/dashboard/owner-daily-ops-home.tsx`

All paths are under `apps/web/`.

Tests: the existing test files for these (update, never delete cases) plus new ones as needed.

Each line at most 140 characters. Do not compact code (L-015). Files already over 400 lines must not grow by more than 30 lines.

## 6. Implementation requirements
- Plain-language rules (6th-grade level, at most 12 words per sentence, no banned words). The user should never need to read instructions to complete this flow. Every step must be self-explanatory.
- Do not invent URLs or emails. New links only point to `/login?mode=signup&role=owner` or to existing routes.
- Keep light and dark mode tokens. Every tap target is at least 44 px.

## 7. Validation commands to run
- `npx vitest run` from `apps/web` on all changed or added tests, plus existing tests importing changed files
- `npx tsc -p apps/web/tsconfig.json --noEmit`
- `npm run lint:web`

## 8. Acceptance criteria (binary). Each case needs a real test that calls the code (L-017)
1. **Login page:**
   - with `mode=signup&role=owner`, it renders "Create your account" and the Owner sign-up form;
   - without params, it renders "Welcome back" (unchanged);
   - no "500+" or "2,000+" text renders;
   - the "Create an account" link has the signup href.
2. **Landing:**
   - "Start free" has `href="/login?mode=signup&role=owner"`;
   - the two reminder promises are gone.
3. **`role-selector`:** the open form container has no `max-h-[400px]` or `overflow-hidden` (assert the class names or the computed structure).
4. **Welcome card:** no "2-minute tour" link. The checklist says "Homes"/"Home". There is no "charges".
5. **Setup flow:**
   - after the first unit, no "Tenant Profile ID" field renders;
   - the next action is "Invite your tenant".
6. **Setup wizard:** no "Account ID" text; no Back button after creation.
7. **Property wizard:**
   - the placeholders are "Maple House" and "123 Main St";
   - the success text differs for connected and not-connected banks, with the bank link in the not-connected case.
8. **Modal:**
   - when open, the overlay renders through a portal to `document.body` (or the bottom nav is hidden);
   - a test asserts the chosen mechanism;
   - Claude verifies live at 375 px that the "Add a manager" Next button is above the nav.
9. **Owner Home:** with notifications off, no "Send reminder" button; with them on, it shows. "Mark as paid" always shows.
10. A grep of §5 files finds none of "Welcome back" on the signup path, "500+", "2-minute tour", "Tenant Profile ID", "charges can start flowing", "131 Chaste Tree", or "manager assignment".
11. Typecheck and lint pass. Only §5 files changed.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, list each test file with its number of cases, and name the modal root cause you found. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never modify or revert files outside §5. No new dependencies.
