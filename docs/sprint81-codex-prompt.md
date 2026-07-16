# Sprint 81 — Codex Implementation Prompt

## 1. Objective

Add a persistent feedback button on EVERY page (marketing, login, and app interior) that lets any user — including unauthenticated visitors — report bugs, request features, or share thoughts. Feedback is stored in the database and emailed to the owner.

## 2. Context

- **Branch**: `main`
- **HEAD**: (latest after Sprint 80)
- **Production URL**: `https://domusbase.com`
- **Owner email**: `richard.ace.smith@gmail.com`
- **Resend configured**: Yes, emails send from `notifications@domusbase.com`
- **Why**: The property manager (Alia) couldn't log in and had no way to report it from within the app. Every user — tenant, manager, visitor — should be able to report issues with ONE click.

## 3. In Scope

### Part A: Feedback Button (Persistent on Every Page)
A small floating button in the bottom-right corner of every page:
- Icon: speech bubble or "?"
- Label: "Feedback" (visible on desktop, icon-only on mobile)
- Fixed position, always accessible, never overlaps critical UI
- Z-index above everything except modals

### Part B: Feedback Modal
When clicked, opens a simple modal:

```
┌─────────────────────────────────────┐
│  Send Feedback                   ✕  │
│                                     │
│  What type of feedback?             │
│  [ Bug 🐛 ] [ Feature 💡 ] [ Other ]│
│                                     │
│  Tell us what happened              │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │  (textarea)                     ││
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  Email (optional)                   │
│  ┌─────────────────────────────────┐│
│  │  (auto-filled if logged in)     ││
│  └─────────────────────────────────┘│
│                                     │
│  [ Submit Feedback ]                │
│                                     │
│  Your feedback goes directly to the │
│  Domus team.                        │
└─────────────────────────────────────┘
```

**Behaviors:**
- Type selector: Bug / Feature Request / Other (defaults to Bug)
- Message: required, min 10 characters
- Email: optional, auto-filled from session if logged in
- Auto-captures: current page URL, user agent, viewport size, user role (if logged in), timestamp
- Submit shows success animation: "Thanks! We got your feedback."
- Rate limit: max 5 submissions per hour per IP/session

### Part C: Database Storage
Store feedback in a new `feedback` table:

```sql
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'other')),
  message TEXT NOT NULL,
  email TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  page_url TEXT,
  user_agent TEXT,
  viewport TEXT,
  user_role TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'wontfix')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS needed for insert (anyone can submit)
-- Only owner can read
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback" ON feedback
  FOR INSERT WITH CHECK (true);

-- Only the app owner can view feedback
-- Using a hardcoded owner email check or a simple admin flag
CREATE POLICY "Owner can view feedback" ON feedback
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'richard.ace.smith@gmail.com'
    )
  );

CREATE POLICY "Owner can update feedback" ON feedback
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE email = 'richard.ace.smith@gmail.com'
    )
  );
```

### Part D: Email Notification to Owner
When feedback is submitted, send an email to `richard.ace.smith@gmail.com`:

```
Subject: [Domus Feedback] Bug report from Alia Sanders

Type: Bug
From: sandersalia@yahoo.com (Manager)
Page: /manager?section=maintenance
Message: "I can't reset my password, the link says expired"

---
View all feedback: https://domusbase.com/ops?section=feedback
```

### Part E: Feedback Viewer in /ops
Add a "Feedback" tab to the existing /ops page where the owner can:
- See all feedback sorted by newest first
- Filter by type (bug / feature / other)
- Filter by status (new / reviewed / resolved)
- Mark feedback as reviewed / resolved / wontfix
- See who submitted it, from what page, and when

### Part F: Works on EVERY Page
The feedback button must render on:
- `/marketing` — unauthenticated visitors
- `/login` — unauthenticated users trying to get in
- `/owner`, `/tenant`, `/manager` — logged-in users
- `/settings`, `/reports` — all interior pages
- `/reset-password`, `/complete-profile` — edge-case pages

This means it must be in the root layout (`app/layout.tsx`), not inside any auth-gated component.

## 4. Out of Scope

- Screenshot capture (too complex for now)
- File attachments
- Feedback replies (owner can't respond to feedback yet)
- Public feedback board
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

### New Files (4-5)
1. `apps/web/components/feedback/feedback-button.tsx` — floating button
2. `apps/web/components/feedback/feedback-modal.tsx` — feedback form modal
3. `apps/web/app/actions/feedback.ts` — submit feedback action (works for auth and anon)
4. `apps/web/components/ops/feedback-viewer.tsx` — feedback list in /ops
5. `supabase/migrations/20260323_sprint81_feedback.sql` — feedback table

### Modified Files (2-3)
1. `apps/web/app/layout.tsx` — add FeedbackButton to root layout
2. `apps/web/app/ops/page.tsx` — add feedback tab/section
3. `apps/web/lib/email-templates.ts` — add feedback notification email template

## 6. Implementation Requirements

### Part A: Feedback Button

```tsx
"use client";

// Floating button — bottom-right corner
// Desktop: "💬 Feedback" text + icon
// Mobile: just icon, 48x48px touch target
// Position: fixed, bottom-6 right-6, z-50
// Style: purple bg, white text, rounded-full, shadow-lg
// Hover: slightly larger shadow, scale up slightly
// Does NOT appear inside modals (check for modal overlay presence)

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-violet-700 hover:shadow-xl transition-all"
        aria-label="Send feedback"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
```

### Part B: Feedback Modal

```tsx
// Simple modal with backdrop
// Type selector: 3 buttons, one selected at a time
// Textarea: auto-focus, placeholder "Describe the issue or idea..."
// Email: auto-filled from session, editable
// Submit: calls server action, shows success toast, closes modal
// Cancel: close modal
// Escape key: close modal

// Auto-capture on submit:
const metadata = {
  pageUrl: window.location.href,
  userAgent: navigator.userAgent,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
};
```

### Part C: Server Action

```typescript
"use server";

// submitFeedback(formData)
// This action must work for BOTH authenticated and unauthenticated users
//
// 1. Try to get session (may be null for unauthenticated)
// 2. Extract: type, message, email, pageUrl, userAgent, viewport
// 3. Validate: message min 10 chars, type is valid
// 4. Rate limit: check by email or IP (simple in-memory or skip for now)
// 5. Insert into feedback table using service role client (bypasses RLS for insert)
// 6. Send email notification to owner via Resend
// 7. Return { success: true }

// IMPORTANT: Use createServiceRoleClient (admin) for the insert
// because unauthenticated users can't use the normal client
```

### Part D: Email Template

```typescript
export function buildFeedbackEmail(params: {
  type: string;
  message: string;
  email: string | null;
  userName: string | null;
  userRole: string | null;
  pageUrl: string;
}): { subject: string; html: string } {
  const typeEmoji = { bug: "🐛", feature: "💡", other: "💬" }[params.type] || "💬";
  // Subject: [Domus Feedback] Bug report from [name or "Anonymous"]
  // Body: type, from, page, message content
  // Use simple HTML, not the full branded template (keep it utilitarian for internal use)
}
```

### Part E: Feedback Viewer

```tsx
// In /ops page, add a "Feedback" section:
// - Table/list of all feedback
// - Columns: Type (emoji), Message (truncated), From, Page, Date, Status
// - Click row to expand full message
// - Status dropdown: new → reviewed → resolved / wontfix
// - Filter bar: type filter + status filter
// - Count badge: "12 new"
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Feedback button visible on EVERY page (marketing, login, app interior)
2. [ ] Button is floating, bottom-right, purple, always accessible
3. [ ] Modal opens with type selector, message textarea, optional email
4. [ ] Email auto-fills for logged-in users
5. [ ] Submit stores feedback in database with metadata (page URL, viewport, user agent)
6. [ ] Submit sends email notification to owner
7. [ ] Submit shows success toast and closes modal
8. [ ] Message required, min 10 characters
9. [ ] Works for unauthenticated users (marketing page, login page)
10. [ ] /ops page has Feedback viewer with all submissions
11. [ ] Feedback viewer can filter by type and status
12. [ ] Owner can mark feedback as reviewed/resolved/wontfix
13. [ ] Migration creates feedback table with appropriate RLS
14. [ ] `npm run gate:web` passes
15. [ ] No regressions

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
FEEDBACK_BUTTON: visible on all pages | missing on some
FEEDBACK_MODAL: working | broken
FEEDBACK_STORAGE: working | broken
EMAIL_NOTIFICATION: working | broken
OPS_VIEWER: working | broken
ANON_SUBMIT: working | broken
NOTES: [any issues]
```

## 10. Constraints

- Do NOT apply the migration to Supabase (Claude will apply it)
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- The feedback button MUST work on unauthenticated pages
- Use service role client for inserting feedback (bypass RLS)
- Owner email is hardcoded for now (richard.ace.smith@gmail.com) — can be made configurable later
- Keep the feedback form SIMPLE — 3 fields max (type, message, email)
