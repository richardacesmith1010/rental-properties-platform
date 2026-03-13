# Sprint 16 — Guided Onboarding Wizard + Tenant UX Overhaul + Bug Fixes

## Objective

Overhaul the post-signup experience for owners and the tenant dashboard UX. Implement a guided onboarding wizard that walks owners through setup step-by-step using a modal overlay system. Fix the tenant dashboard to feel welcoming and respectful — not like a debt collection screen. Fix formatting, button states, and the missing Pay button.

## Context

- **Branch**: `main`
- **HEAD**: `d4408f5`
- **Deploy**: domusbase.com
- **Gate**: 232/232 tests, lint clean, build clean
- **Runtime**: Next.js 14.2.5, Supabase, Stripe Connect (sandbox)

### Testing findings that drive this sprint:
1. Owner creates property but has no guided path to add units, leases, or tenants
2. Tenant dashboard feels aggressive — just shows debt amounts prominently
3. Money displays as "$1,500.00" — unnecessary decimals when cents are zero
4. Sign-in button can appear to be clicked multiple times before navigation
5. Tenant "Pay with Card" button not showing (ownerConnectedMap lookup issue)

## In Scope

### Part A — Modal Overlay System (Foundation)
### Part B — Guided Owner Onboarding Wizard
### Part C — Tenant Dashboard UX Overhaul
### Part D — Currency Formatting Fix
### Part E — Sign-in Button Hardening
### Part F — Pay Button Fix

## Out of Scope

- Stripe live mode switch (Sprint 15 continuation)
- Email/notification sending (Resend setup)
- New database migrations
- Changes to CLAUDE.md or AGENTS.md

## Exact Files Expected to Change

### New Files
- `apps/web/components/ui/modal-overlay.tsx` — Reusable modal with blurred backdrop
- `apps/web/components/onboarding/onboarding-wizard.tsx` — Multi-step wizard container
- `apps/web/components/onboarding/steps/add-unit-step.tsx` — Unit creation step
- `apps/web/components/onboarding/steps/add-lease-step.tsx` — Lease creation step
- `apps/web/components/onboarding/steps/invite-tenant-step.tsx` — Tenant invite step
- `apps/web/components/onboarding/steps/connect-bank-step.tsx` — Bank connect step
- `apps/web/components/onboarding/steps/completion-step.tsx` — Celebration/summary step

### Modified Files
- `apps/web/components/dashboard/charges-section.tsx` — Tenant UX + Pay button fix
- `apps/web/app/owner/page.tsx` — Mount onboarding wizard
- `apps/web/app/tenant/page.tsx` — Tenant dashboard UX overhaul
- `apps/web/lib/format.ts` — Smart currency formatting
- `apps/web/app/login/page.tsx` — Sign-in button hardening (if needed)
- `apps/web/components/login-form.tsx` or equivalent — Button disabled state
- `apps/web/lib/tenant-payments.ts` — Ensure propertyId is always populated
- `apps/web/lib/__tests__/format.test.ts` — Tests for new formatting

## Implementation Requirements

### Part A — Modal Overlay System

Create `apps/web/components/ui/modal-overlay.tsx`:

```
"use client"

Props:
  open: boolean
  onClose?: () => void  (optional — some modals have no close)
  children: ReactNode

Behavior:
  - When open=true: backdrop blur (backdrop-blur-sm), dark overlay (bg-black/40)
  - Content centered vertically and horizontally
  - Smooth enter/exit transitions (opacity + scale, 200ms ease-out)
  - Click outside to close (if onClose provided)
  - Escape key to close (if onClose provided)
  - Body scroll locked when open
  - z-50 to sit above everything
```

### Part B — Guided Owner Onboarding Wizard

Create `apps/web/components/onboarding/onboarding-wizard.tsx`:

**When to show**: After owner creates their FIRST property (check if user has exactly 1 property and 0 units). The wizard is triggered by detecting the fresh state — NOT by a URL param.

**Wizard Steps** (in order):

1. **Add Unit** — Form to add a unit to the property just created
   - Fields: unit number, bedrooms, bathrooms, monthly rent
   - On success: XP toast from Dom mascot, proceed to next step
   - "Skip for now" link at bottom

2. **Add Lease** — Form to create a lease for the unit just added
   - Fields: tenant email, start date, end date, monthly rent (pre-filled from unit), due day of month
   - On success: XP toast, proceed
   - "Skip for now" link

3. **Invite Tenant** — If lease was created, prompt to send invite
   - Auto-filled from lease tenant email
   - "Skip for now" link

4. **Connect Bank** — If not already connected
   - Explain why (receive rent payments)
   - "Connect Now" button → redirects to /connect/onboard
   - "Skip for now" link
   - If already connected, skip this step automatically

5. **Completion** — Celebration screen
   - Dom mascot animation/celebration
   - Summary of what was set up
   - XP bonus for completing onboarding
   - "Go to Dashboard" button

**Wizard UI Pattern:**
- Uses ModalOverlay from Part A
- Step indicator at top (dots or numbered progress bar)
- Each step is a card (~max-w-lg) centered in the overlay
- Background is blurred dashboard
- Smooth slide/fade transitions between steps
- "Skip for now" is always available (never trap the user)

**State management:**
- Use React useState for current step
- Each step form uses useActionState with the existing server actions
- Wizard state does NOT persist to DB — if user closes and reopens, wizard re-evaluates whether to show based on data state (0 units = show, 1+ units = don't show)

### Part C — Tenant Dashboard UX Overhaul

The tenant dashboard currently feels like a debt collection screen. Redesign the overview section to feel **welcoming and informative** — like a helpful home portal.

**New Overview Layout:**

1. **Welcome Header** — "Welcome home, {nickname}" with a warm greeting. Show the property name and unit number prominently (this is their HOME).

2. **Quick Status Card** — Instead of "Outstanding Rent: $X" as the hero metric, reframe:
   - If all paid: "You're all set! No payments due." (green, encouraging)
   - If payment due: "Next payment: $X due {date}" (neutral, informative — NOT red/alarming unless actually late)
   - If late: "Payment of $X was due {date}" (amber warning, still respectful)

3. **Action Cards** (horizontal row):
   - "Make a Payment" — primary action card (violet), always visible
   - "Submit a Request" — maintenance ticket shortcut
   - "My Documents" — lease docs access
   - "Contact Landlord" — inbox/messaging shortcut

4. **Upcoming & Recent** — Timeline of recent activity:
   - Upcoming charges (informational, not alarming)
   - Recent payments (positive reinforcement — "Paid $1,500 on Mar 1")
   - Maintenance updates

**Tone Rules:**
- Never use red for amounts unless actually LATE (past due date)
- Use "payment" not "charge" in tenant-facing copy
- Use "due" not "outstanding" or "owed"
- Show payment history positively (green checkmarks for paid items)
- The property name + unit should feel like "your place" not "the landlord's asset"

### Part D — Currency Formatting Fix

Update `apps/web/lib/format.ts`:

Change `formatCurrency` to be smart about decimals:
- If cents are zero: show "$1,500" (no decimals)
- If cents are non-zero: show "$1,500.50" (2 decimals)

```typescript
export function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  const hasCents = cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0
  }).format(dollars);
}
```

Add tests in `apps/web/lib/__tests__/format.test.ts`:
- `formatCurrency(150000)` → `"$1,500"`
- `formatCurrency(150050)` → `"$1,500.50"`
- `formatCurrency(0)` → `"$0"`
- `formatCurrency(99)` → `"$0.99"`
- `formatCurrency(100)` → `"$1"`

### Part E — Sign-in Button Hardening

The login form already has `disabled={loading}` but users report being able to click multiple times. Fix:

1. Add visual feedback immediately on click — the button should visually change BEFORE any async operation begins
2. Add a spinner icon (use Loader2 from lucide-react with `animate-spin`) alongside the text
3. Ensure the `disabled` styling is unmissable — use `aria-disabled` + pointer-events-none + opacity change
4. If form submission takes longer than expected, the button should never re-enable until navigation completes or an error occurs

### Part F — Pay Button Fix

The "Pay with Card" button is not showing for the tenant. Debug and fix:

1. In `apps/web/app/tenant/page.tsx`, the `ownerConnectedMap` is built from `arePropertyOwnersConnected()` which walks charge → propertyId → owner profile → stripe status.

2. Verify that `charge.propertyId` is populated correctly in the tenant payments query. The propertyId comes from the unit → property join. If the join fails or returns empty, `ownerConnectedMap.get(charge.propertyId)` returns undefined, which falls through to `stripeConnected ?? true` — so it should default to showing the button.

3. The more likely issue: check if the `createCheckoutForCharge` server action is what's preventing render. Check for any error in the server action chain.

4. If the issue is that `arePropertyOwnersConnected` returns false because `getOwnerStripeAccountForProperty` can't find the owner's Stripe account through the ownership account chain, add a fallback: also check `owner_profile_id` directly on the property (not just through ownership_accounts).

5. Add console.warn in development for debugging when ownerConnected resolves to false unexpectedly.

## Validation Commands

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npx eslint . --max-warnings 0
cd apps/web && npx vitest run
npm run gate:web
```

## Acceptance Criteria

### Part A — Modal Overlay
- [ ] AC-1: ModalOverlay renders with blurred backdrop when open=true
- [ ] AC-2: ModalOverlay hides when open=false (no DOM residue)
- [ ] AC-3: Escape key and outside click call onClose
- [ ] AC-4: Smooth enter/exit transitions

### Part B — Onboarding Wizard
- [ ] AC-5: Wizard appears automatically after first property creation when 0 units exist
- [ ] AC-6: Wizard does NOT appear if user already has 1+ units
- [ ] AC-7: Each step has a working form that creates real data via existing server actions
- [ ] AC-8: XP toasts appear from Dom mascot after each successful step
- [ ] AC-9: "Skip for now" works on every step and advances to next
- [ ] AC-10: Completion step shows celebration + summary
- [ ] AC-11: Step indicator shows progress (current step highlighted)
- [ ] AC-12: Background is blurred while wizard is open

### Part C — Tenant Dashboard
- [ ] AC-13: Overview shows "Welcome home, {nickname}" with property name + unit
- [ ] AC-14: Payment status uses neutral/positive framing (not debt-collector tone)
- [ ] AC-15: Red/alarm styling ONLY used for actually late payments
- [ ] AC-16: Action cards row: Make a Payment, Submit Request, Documents, Contact
- [ ] AC-17: Payment history shows green checkmarks for paid items

### Part D — Currency Formatting
- [ ] AC-18: $1,500 (no decimals) when cents are zero
- [ ] AC-19: $1,500.50 (2 decimals) when cents are non-zero
- [ ] AC-20: Format tests pass

### Part E — Sign-in Button
- [ ] AC-21: Button shows spinner + "Signing in..." immediately on click
- [ ] AC-22: Button is visually and functionally unclickable during loading
- [ ] AC-23: Button never re-enables until navigation or error

### Part F — Pay Button
- [ ] AC-24: Tenant sees "Pay with Card" button for pending/late charges when owner is Stripe-connected
- [ ] AC-25: Fallback check via owner_profile_id if ownership account chain fails

## Report Format

```
gate_pass: bool
lint_pass: bool
type_check_pass: bool
test_pass: bool
test_count: number
files_changed: list
ac_results: { AC-1: pass/fail, AC-2: pass/fail, ... }
```

## Constraints

- Do NOT apply any database migrations
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT deploy to Vercel
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Use existing server actions (createProperty, createUnit, createLease, etc.) — do NOT create new server actions for the wizard
- Use existing XP/gamification functions (awardXp, XP_VALUES)
- Preserve all existing functionality — this is additive, not a rewrite
