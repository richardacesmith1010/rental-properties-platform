# Sprint 65 — Codex Implementation Prompt

## 1. Objective

Polish the tenant invitation flow: branded invite emails via Resend, a step-by-step tenant invite wizard (like the property wizard), and a smooth tenant onboarding landing experience.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest)
- **Production URL**: `https://domusbase.com`
- **Resend configured**: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (noreply@domusbase.com) are set in Vercel

**Existing infrastructure:**
- `app/actions/invitations.ts` — `inviteTenant()` uses `admin.auth.admin.inviteUserByEmail()` which sends Supabase's default email (no branding)
- `lib/email-templates.ts` — branded Domus email shell with header, CTA button, mascot
- `app/onboarding/page.tsx` — onboarding form after invite acceptance
- `app/complete-profile/page.tsx` — password setup
- `components/dashboard/property-wizard.tsx` — wizard pattern to follow
- Sidebar "New Tenant" mode exists but just switches workflow mode, no wizard

## 3. In Scope

### Part A: Branded Tenant Invite Email
- Send invite emails through Resend (not Supabase default) with Domus branding
- Email includes: property name, unit, landlord name, invite link, mascot
- Clear CTA button: "Accept Invitation & Set Up Your Account"
- Fallback: if Resend fails, fall back to Supabase default invite

### Part B: Tenant Invite Wizard
- Modal wizard (like property wizard) that opens when clicking "New Tenant" in sidebar
- Step 1: Select property and unit (from owner's existing properties/units)
- Step 2: Enter tenant info (name, email, phone — optional)
- Step 3: Set rent amount and lease dates (optional — can be done later)
- Step 4: Confirmation + "Invitation sent!" success screen
- The wizard sends the branded invite email on completion

### Part C: Tenant Landing Experience
- When tenant clicks the invite link and creates their account, they should land on a branded welcome page
- Show: "Welcome to Domus! You've been invited by {owner name} to manage your rental at {property address}"
- Guide them through: complete profile → view their dashboard
- The onboarding flow should feel warm and personal, not like a generic signup

### Part D: Invitation Status Tracking
- Owner can see pending invitations in the dashboard (who was invited, when, status)
- "Resend" button on pending invitations
- "Revoke" button to cancel a pending invitation
- Show in the Portfolio section or a dedicated "Invitations" sub-section

## 4. Out of Scope

- SMS/text invitations
- Bulk invite (invite multiple tenants at once)
- Tenant self-registration (invite-only for now)
- Lease document generation during invite
- Database migrations (use existing invitations table)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (3-5)
1. `apps/web/components/dashboard/tenant-invite-wizard.tsx` — step-by-step invite wizard modal
2. `apps/web/lib/invite-email.ts` — Resend-powered branded invite email builder + sender
3. `apps/web/components/dashboard/invitations-panel.tsx` — pending invitations list with resend/revoke
4. `apps/web/lib/__tests__/invite-email.test.ts` — unit tests

### Modified Files (4-6)
1. `apps/web/app/actions/invitations.ts` — use Resend for branded email instead of Supabase default
2. `apps/web/components/dashboard/index.tsx` — render tenant invite wizard modal
3. `apps/web/components/dashboard/sidebar/nav-items.ts` — wire "New Tenant" to open wizard
4. `apps/web/components/dashboard/section-renderer.tsx` — add invitations panel to portfolio or as sub-section
5. `apps/web/app/onboarding/page.tsx` — personalize with invite context (property name, owner name)
6. `apps/web/lib/email-templates.ts` — add tenant invite email template

## 6. Implementation Requirements

### Part A: Branded Invite Email

**New file: `lib/invite-email.ts`**

```typescript
import { buildNotificationEmail } from "./email-templates";

interface TenantInviteEmailParams {
  tenantName: string;
  tenantEmail: string;
  ownerName: string;
  propertyAddress: string;
  unitLabel: string;
  inviteUrl: string;   // Supabase auth invite URL
  monthlyRent?: string; // optional, formatted
}

export async function sendTenantInviteEmail(params: TenantInviteEmailParams): Promise<boolean> {
  // 1. Check if RESEND_API_KEY is set
  // 2. Build HTML email using buildNotificationEmail shell:
  //    - Subject: "{ownerName} invited you to Domus"
  //    - Body: "You've been invited to manage your rental at {propertyAddress}, {unitLabel}."
  //    - If monthlyRent: "Your monthly rent is {monthlyRent}."
  //    - CTA button: "Accept Invitation" → inviteUrl
  //    - Footer: "Domus makes it easy to pay rent, submit maintenance requests, and view your lease."
  // 3. Send via Resend API (fetch POST to api.resend.com/emails)
  // 4. Return true on success, false on failure (don't throw — caller handles fallback)
}
```

**In `app/actions/invitations.ts`**, modify `inviteTenant`:
```typescript
// After creating the Supabase auth invite (which generates the invite URL):
const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?...`;

// Try Resend first
const emailSent = await sendTenantInviteEmail({
  tenantName: fullName,
  tenantEmail: email,
  ownerName: currentUserProfile.full_name,
  propertyAddress: property.address_line_1,
  unitLabel: unit?.unit_number ?? "",
  inviteUrl: /* extract from Supabase invite response */,
});

// Supabase already sent its default email via inviteUserByEmail,
// so the tenant will get an email either way. The Resend email is a branded supplement.
```

**Note:** `admin.auth.admin.inviteUserByEmail()` automatically sends Supabase's built-in email. We can't prevent that without disabling email confirmations globally. So the approach is:
1. Call `inviteUserByEmail` with `options: { data: { ... } }` to create the user
2. Send a SEPARATE branded email via Resend with the same invite/confirmation link
3. The tenant may receive 2 emails — the Supabase default + the branded one. This is OK for now.

**OR better approach:** Use `admin.auth.admin.createUser()` instead of `inviteUserByEmail()` to create the user without sending the default email, then send only the branded Resend email with a password reset link. Check if this is feasible without breaking the auth flow.

### Part B: Tenant Invite Wizard

**File: `components/dashboard/tenant-invite-wizard.tsx`**

Follow the exact same pattern as `property-wizard.tsx`:
- Use `ModalOverlay` for the modal
- Use `useRef` for step state to survive parent re-renders
- Use `prevOpenRef` pattern to only reset on closed→open transition

**Step 1 — Select Property & Unit:**
```tsx
// Dropdown of owner's properties (from dashboard data)
// Dropdown of units for selected property
// If only 1 property, pre-select it
// If only 1 unit, pre-select it
```

**Step 2 — Tenant Info:**
```tsx
// Full name (required)
// Email (required)
// Phone (optional)
```

**Step 3 — Rent & Lease (Optional):**
```tsx
// Monthly rent amount (optional — can set up later)
// Lease start date (optional)
// Lease end date (optional)
// "Skip — I'll set this up later" button
```

**Step 4 — Confirmation:**
```tsx
// Success: "Invitation sent to {email}!"
// Summary: property, unit, tenant name
// "They'll receive a branded email with a link to create their account."
// Buttons: "Invite Another Tenant" | "Back to Dashboard"
```

### Part C: Tenant Landing Experience

**In `app/onboarding/page.tsx`:**

When a tenant arrives via invite link, personalize the welcome:
- Check if the user has invitation records in the DB
- If yes, show: "Welcome to Domus, {name}! You've been invited by {owner} to {property address}."
- Show the mascot (waving pose)
- Guide through profile completion with context

### Part D: Invitation Status Panel

**File: `components/dashboard/invitations-panel.tsx`**

Show in the Portfolio section or as its own section:
- List of pending invitations with: tenant name, email, property, sent date, status badge
- "Resend" button — calls `resendInvite` action
- "Revoke" button — updates invitation status to cancelled
- Accepted invitations show green "Accepted" badge with date

### Part E: Unit Tests

Test:
1. Invite email builder produces correct HTML with all fields
2. Invite email builder handles missing optional fields (no rent, no unit)
3. Resend API failure returns false (doesn't throw)
4. Wizard step validation: can't proceed without email
5. Wizard step validation: can't proceed without property selected

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Tenant invite sends a branded Domus email (not just Supabase default)
2. [ ] Email includes property name, owner name, CTA button with invite link
3. [ ] Tenant invite wizard opens from "New Tenant" sidebar click
4. [ ] Wizard has 4 steps: Property/Unit → Tenant Info → Rent/Lease (optional) → Confirmation
5. [ ] Wizard survives parent re-renders (uses same patterns as property wizard fix)
6. [ ] Pending invitations visible to owner with resend/revoke options
7. [ ] Tenant onboarding page shows personalized welcome with property context
8. [ ] Mascot (waving pose) shown on tenant welcome
9. [ ] 5+ unit tests passing
10. [ ] `npm run gate:web` passes
11. [ ] No regressions to existing invite flow

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
INVITE_EMAIL: branded | default only
WIZARD: working | broken
INVITATIONS_PANEL: working | broken
ONBOARDING_PERSONALIZED: yes | no
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations (use existing invitations table)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT modify modal-overlay.tsx — it was just rewritten
- Use the same wizard patterns as property-wizard.tsx (prevOpenRef, useRef for stability)
- For Resend email sending, use a direct `fetch` to `https://api.resend.com/emails` with the API key — do NOT install the Resend npm package
- The branded email is a supplement — the Supabase auth invite still handles the actual account creation flow
