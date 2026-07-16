# Sprint 83 — Codex Implementation Prompt

## 1. Objective

Replace the join-code-based LLC member invite with a one-click email invitation flow. Owner enters one or more email addresses, each person gets a branded email with a magic link. Clicking the link → creates their account (or signs in if existing) → auto-joins them to the LLC → lands them on the LLC dashboard. Zero friction.

## 2. Context

- **Branch**: `main`
- **HEAD**: `83f6195`
- **Production URL**: `https://domusbase.com`
- **Supabase project**: `vawqdqkaguhdgfhdebqw`
- **Existing infrastructure**:
  - `app/actions/tenant-invitations.ts` — existing tenant invite pattern (magic link via Supabase auth)
  - `lib/email-templates.ts` — branded Domus email shell with CTA buttons
  - `lib/invite-email.ts` — invite email template builder
  - Resend configured and working for email delivery
  - `ownership_account_members` table with `account_id`, `profile_id`, `member_role`, `active`
  - `addOwnershipMember` action in `app/actions/ownership.ts`
  - Members page at `components/dashboard/members-section.tsx` — currently shows join code
  - Supabase auth supports `signInWithOtp` for magic links and `inviteUserByEmail` for admin invites
  - `app/onboarding/page.tsx` — existing onboarding flow for new users

## 3. In Scope

### Part A: Multi-Email Invite Form
Replace the join code display on the Members page with an email invite form:

**UI:**
```
┌─────────────────────────────────────────┐
│  Invite Members                          │
│                                          │
│  Email addresses (one per line or        │
│  comma-separated):                       │
│  ┌────────────────────────────────────┐  │
│  │ brother@gmail.com                  │  │
│  │ sister@gmail.com                   │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [ Send Invitations ]                    │
│                                          │
│  Pending Invitations:                    │
│  • brother@gmail.com — sent 2 min ago   │
│  • sister@gmail.com — sent 2 min ago    │
└─────────────────────────────────────────┘
```

- Textarea accepts multiple emails (comma-separated or newline-separated)
- Validates each email format before sending
- "Send Invitations" button sends all at once
- Shows pending invitations with timestamp and resend option

### Part B: LLC Invitation Table
New database table to track pending LLC invitations:

```sql
CREATE TABLE IF NOT EXISTS llc_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id UUID NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(ownership_account_id, email, status)
);
```

### Part C: Invite Email
When owner sends invitations:

1. For each email, create a row in `llc_invitations`
2. Send branded email via Resend:

```
Subject: You've been invited to join [LLC Name] on Domus

Hi,

Richard Smith has invited you to join J&MSP on Domus — a rental property management platform.

Click below to accept the invitation and set up your account:

[ Accept Invitation → ]

This invitation expires in 7 days.

---
Domus - Rental Property Management
```

The CTA link format: `https://domusbase.com/join-llc?token={invitation_token}`

### Part D: Join LLC Route
New page: `app/join-llc/page.tsx`

**Flow for the person clicking the link:**

1. **Page loads** → validates the token against `llc_invitations` table
   - If invalid/expired → show "This invitation has expired or is invalid" with link to marketing page
   - If valid → continue

2. **Check if user is already signed in:**
   - If signed in → auto-join them to the LLC (insert into `ownership_account_members`), mark invitation as accepted, redirect to `/owner?account={llcAccountId}`
   - If not signed in → continue to step 3

3. **Check if email already has a Domus account:**
   - If yes → show "Sign in to accept this invitation" with email pre-filled, password field. On sign in → auto-join → redirect to LLC dashboard
   - If no → show "Create your account to join [LLC Name]" with:
     - Email (pre-filled, read-only — matches invitation)
     - Password (create new)
     - First name, Last name
     - "Create Account & Join [LLC Name]" button

4. **On account creation:**
   - Create Supabase auth user
   - Create profile
   - Auto-join the LLC as member (role: "owner")
   - Mark invitation as accepted
   - Redirect to `/owner?account={llcAccountId}`
   - Skip normal onboarding (they don't need to create their own account/property — they're joining an existing LLC)

### Part E: Server Actions

```typescript
// sendLLCInvitations(formData)
// Params: accountId, emails (comma or newline separated string)
// 1. Auth check — must be owner/admin of the LLC
// 2. Parse and validate each email
// 3. For each email:
//    a. Check if already an active member → skip with message "Already a member"
//    b. Check if pending invitation exists → skip with message "Already invited"
//    c. Create llc_invitations row with unique token
//    d. Send email via Resend with branded template
// 4. Return { success: true, sent: number, skipped: string[] }

// acceptLLCInvitation(token)
// Params: token (UUID from URL)
// 1. Fetch invitation by token, verify status === 'pending' and not expired (7 days)
// 2. Get current user (if signed in)
// 3. If signed in: add to ownership_account_members, mark invitation accepted
// 4. If not signed in: return invitation details for the join-llc page to render signup form
// 5. Revalidate paths

// resendLLCInvitation(invitationId)
// Params: invitationId
// 1. Auth check — must be inviter or LLC admin
// 2. Resend the email
// 3. Update created_at to now() (resets expiry)

// cancelLLCInvitation(invitationId)
// Params: invitationId
// 1. Auth check
// 2. Update status to 'cancelled'
```

### Part F: Pending Invitations Display
On the Members page, show pending invitations below the invite form:

```tsx
// For each pending invitation:
<div className="flex items-center justify-between py-2 border-b">
  <div>
    <span className="text-sm font-medium">{invitation.email}</span>
    <span className="text-xs text-muted-foreground ml-2">
      Sent {timeAgo(invitation.createdAt)}
    </span>
  </div>
  <div className="flex gap-2">
    <Button size="sm" variant="ghost" onClick={() => resend(invitation.id)}>Resend</Button>
    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancel(invitation.id)}>Cancel</Button>
  </div>
</div>
```

### Part G: Remove Join Code UI
- Remove the join code display from the Members page
- Keep the join_code column in the database (backward compatible) but don't show it in UI
- The invite-by-email flow completely replaces it

## 4. Out of Scope

- Batch inviting from contacts/address book
- Invitation expiry cron job (manual check on page load is fine)
- Changing member roles from the invite (all join as "owner" for now)
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (5-6)
1. `supabase/migrations/20260324_sprint83_llc_invitations.sql` — llc_invitations table + RLS
2. `apps/web/app/join-llc/page.tsx` — invitation acceptance page (sign in or sign up)
3. `apps/web/app/actions/llc-invitations.ts` — send, accept, resend, cancel actions
4. `apps/web/components/dashboard/llc-invite-form.tsx` — multi-email invite form
5. `apps/web/lib/llc-invitation-email.ts` — email template for LLC invitations
6. `apps/web/lib/__tests__/llc-invitations.test.ts` — unit tests

### Modified Files (3-4)
1. `apps/web/components/dashboard/members-section.tsx` — replace join code with invite form, show pending invitations
2. `apps/web/lib/email-templates.ts` — add LLC invite email template (or use new file)
3. `apps/web/middleware.ts` — ensure `/join-llc` route is accessible without auth (public route)
4. `apps/web/app/actions/ownership.ts` — auto-generate join_code on LLC creation (fix root cause)

## 6. Implementation Requirements

### Migration

```sql
CREATE TABLE IF NOT EXISTS llc_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ownership_account_id UUID NOT NULL REFERENCES ownership_accounts(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_llc_invitations_unique_pending
  ON llc_invitations(ownership_account_id, email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_llc_invitations_token
  ON llc_invitations(token) WHERE status = 'pending';

ALTER TABLE llc_invitations ENABLE ROW LEVEL SECURITY;

-- LLC members can view invitations for their account
CREATE POLICY "LLC members can view invitations" ON llc_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
    )
  );

-- LLC owner/admin can create invitations
CREATE POLICY "LLC admins can create invitations" ON llc_invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
        AND m.member_role IN ('owner', 'admin')
    )
  );

-- LLC owner/admin can update invitations (cancel/resend)
CREATE POLICY "LLC admins can update invitations" ON llc_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM ownership_account_members m
      WHERE m.account_id = ownership_account_id
        AND m.profile_id = auth.uid()
        AND m.active = true
        AND m.member_role IN ('owner', 'admin')
    )
  );

-- Allow public token lookup for accepting invitations (service role handles the actual join)
-- The join-llc page uses service role to validate tokens
```

### Join LLC Page

```tsx
// app/join-llc/page.tsx
// This is a PUBLIC page (no auth required — new users land here)

// URL: /join-llc?token=abc123-def456-...

// 1. Read token from searchParams
// 2. Server-side: validate token against llc_invitations (use service role)
// 3. If invalid/expired: render error state
// 4. If valid: render based on auth state
//    a. Already signed in → "Accept invitation to join {LLC Name}" button → auto-join
//    b. Has existing account → "Sign in to join {LLC Name}" form (email pre-filled)
//    c. New user → "Create account to join {LLC Name}" form

// The form should feel like the login page (split layout from Sprint 73)
// Left: branding + LLC name + "You've been invited to join {LLC Name}"
// Right: form (sign in or create account)
```

### Email Template

```typescript
export function buildLLCInviteEmail(params: {
  llcName: string;
  inviterName: string;
  acceptUrl: string;
}): { subject: string; html: string } {
  // Use buildNotificationEmail shell
  // Subject: "You've been invited to join {llcName} on Domus"
  // Body: "{inviterName} has invited you to join {llcName} on Domus..."
  // CTA: "Accept Invitation →" linking to acceptUrl
  // Footer note: "This invitation expires in 7 days."
}
```

### Unit Tests

1. Email parsing: comma-separated, newline-separated, mixed
2. Email validation: valid emails pass, invalid rejected
3. Duplicate detection: already member skipped, already invited skipped
4. Token validation: valid token returns invitation, expired token rejected, invalid token rejected
5. Invitation acceptance: creates member record, marks invitation accepted

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Members page shows multi-email invite form (textarea + send button)
2. [ ] Owner can enter multiple emails (comma or newline separated)
3. [ ] Each invitee receives a branded email with one-click "Accept Invitation" link
4. [ ] Clicking the link as a new user → account creation form → auto-joins LLC
5. [ ] Clicking the link as an existing user → sign in → auto-joins LLC
6. [ ] Clicking the link while already signed in → auto-joins immediately
7. [ ] After joining, user lands on the LLC dashboard (`/owner?account={llcId}`)
8. [ ] Pending invitations shown below invite form with Resend/Cancel buttons
9. [ ] Invalid/expired tokens show clear error message
10. [ ] Duplicate invitations prevented (same email, same LLC, pending status)
11. [ ] Already-members get "Already a member" message (not re-invited)
12. [ ] Join code UI removed from Members page
13. [ ] `/join-llc` route accessible without authentication
14. [ ] Migration creates `llc_invitations` table with RLS
15. [ ] `createOwnershipAccount` auto-generates join_code for LLC accounts (root cause fix)
16. [ ] 5+ unit tests passing
17. [ ] `npm run gate:web` passes
18. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
INVITE_FORM: working | broken
EMAIL_DELIVERY: working | broken
JOIN_PAGE: working | broken
AUTO_JOIN: working | broken
PENDING_LIST: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT apply the migration to Supabase (Claude will apply)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- The /join-llc page MUST work without authentication (it's for new users)
- Use Supabase admin/service role for token validation and member insertion (RLS won't allow anonymous access)
- Invited members join as role "owner" by default
- Invitation tokens expire after 7 days (check created_at + 7 days > now())
- Keep join_code column in database but don't display in UI
