# Sprint 36 — Codex Implementation Prompt

## 1. Objective

Brand all email templates (Supabase Auth + transactional notifications) with consistent Domus styling, add preheader text and notification preferences link, and create a dev-only email preview route.

## 2. Context

- **Branch**: `main`
- **HEAD**: `7f818f0`
- **Gate baseline**: 503/503 tests, lint clean, typecheck clean, build clean
- **No migration required** — all changes are email template HTML + API route
- **Key existing patterns**:
  - `buildNotificationEmail()` in `lib/email-templates.ts` — current branded HTML template
  - `sendNotificationEmail()` in `lib/notifications.ts` — Resend HTTP integration
  - `getEnvStatus()` in `lib/env.ts` — env var status checker
  - `GET /api/health` route — pattern for simple API routes
  - Brand colors: violet gradient `#7C3AED → #5B21B6`, emerald CTA `#10B981`
  - Dom mascot image: `https://domusbase.com/images/dom-the-key.png`
  - App URL: `process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"`

## 3. In Scope

### Part A: Supabase Auth Email Templates
- New file with 4 branded HTML template generators for Supabase auth emails
- Templates: confirmation, recovery, invite, magic link

### Part B: Enhanced Notification Email Template
- Add preheader text support
- Add "Manage notification preferences" footer link
- Improve plain text fallback

### Part C: Email Preview Dev Route
- New API route to preview all email templates in browser
- Blocked in production

## 4. Out of Scope

- Supabase dashboard configuration (Claude applies templates post-deploy)
- Custom SMTP setup
- Database migrations
- Test file modifications
- CLAUDE.md / AGENTS.md edits
- New npm dependencies

## 5. Exact Files Expected to Change

### New Files (2)
1. `apps/web/lib/auth-email-templates.ts`
2. `apps/web/app/api/email-preview/route.ts`

### Modified Files (2)
1. `apps/web/lib/email-templates.ts`
2. `apps/web/lib/notifications.ts`

## 6. Implementation Requirements

### Part A: Supabase Auth Email Templates

**New file**: `apps/web/lib/auth-email-templates.ts`

This file exports 4 functions that return HTML strings for Supabase Auth email templates. These templates use Supabase's Go template variables (`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`). Claude will paste the output into the Supabase dashboard.

**Important**: These templates must use the **exact same visual design** as the existing `buildNotificationEmail()` — same violet gradient header, same Dom mascot, same emerald CTA button, same footer styling. The only differences are the content and template variables.

```typescript
/**
 * Supabase Auth email templates.
 *
 * These return raw HTML strings containing Go template variables
 * (e.g. {{ .ConfirmationURL }}) that Supabase replaces at send time.
 *
 * Claude pastes these into the Supabase dashboard under
 * Authentication → Email Templates.
 */

/** Shared branded email shell — DRY wrapper used by all 4 templates. */
function buildAuthEmailShell(params: {
  title: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  preheaderText: string;
}): string {
  // Use the EXACT same HTML structure as buildNotificationEmail():
  // - Same <body> background (#f5f3ff)
  // - Same violet gradient header with Dom mascot
  // - Same white content area with borders
  // - Same emerald CTA button (#10B981, border-radius:999px)
  // - Same footer styling
  // ADD: preheader text as hidden <span> at the top of <body>
  // ADD: "Manage notification preferences" link in footer → {{ .SiteURL }}/settings
}

export function buildConfirmationEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Confirm Your Email",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        Thanks for signing up for Domus! Click the button below to confirm your email address and activate your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn't create a Domus account, you can safely ignore this email.
      </p>
    `,
    ctaText: "Confirm Email",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Confirm your email to get started with Domus."
  });
}

export function buildRecoveryEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Reset Your Password",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        We received a request to reset the password for your Domus account. Click the button below to choose a new password.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    `,
    ctaText: "Reset Password",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Reset your Domus account password."
  });
}

export function buildInviteEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "You're Invited to Domus",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        You've been invited to join a property on Domus — the platform that makes managing rentals simple. Click the button below to accept your invitation and set up your account.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    `,
    ctaText: "Accept Invitation",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "You've been invited to join a property on Domus."
  });
}

export function buildMagicLinkEmailTemplate(): string {
  return buildAuthEmailShell({
    title: "Your Sign-In Link",
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
        Click the button below to sign in to your Domus account. This link expires in 24 hours.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
        If you didn't request this link, you can safely ignore this email.
      </p>
    `,
    ctaText: "Sign In to Domus",
    ctaUrl: "{{ .ConfirmationURL }}",
    preheaderText: "Your Domus sign-in link is ready."
  });
}
```

**Key requirements for `buildAuthEmailShell`**:
1. Copy the exact HTML structure from `buildNotificationEmail()` in `email-templates.ts`
2. Do NOT call `escapeHtml()` on the body — it's pre-authored HTML, not user input
3. DO escape the `ctaUrl` for HTML attribute safety (replace `"` with `&quot;`)
4. Add a hidden preheader `<span>` as the first element inside `<body>`:
   ```html
   <span style="display:none;font-size:1px;color:#f5f3ff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
     ${preheaderText}
   </span>
   ```
5. Add a preferences link in the footer section:
   ```html
   <a href="{{ .SiteURL }}/settings" style="color:#7C3AED;text-decoration:underline;">
     Manage notification preferences
   </a>
   ```
6. The mascot image src must be `https://domusbase.com/images/dom-the-key.png`
7. The header must show "Domus" and "Rental Property Management" subtitle

### Part B: Enhanced Notification Email Template

**Modified file**: `apps/web/lib/email-templates.ts`

Update `EmailTemplateParams` and `buildNotificationEmail()`:

1. Add `preheaderText?: string` to `EmailTemplateParams` interface

2. Add a hidden preheader `<span>` as the first element inside `<body>` (same pattern as auth templates):
   ```html
   <span style="display:none;font-size:1px;color:#f5f3ff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
     ${escaped preheader text}
   </span>
   ```
   Only render if `preheaderText` is provided.

3. Add a notification preferences link in the footer, after the existing footer text:
   ```html
   <a href="${appUrl}/settings" style="color:#7C3AED;text-decoration:underline;">
     Manage notification preferences
   </a>
   ```
   Where `appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com"`.

4. Escape the preheader text with `escapeHtml()` (it comes from notification titles, which are user-influenced).

**Modified file**: `apps/web/lib/notifications.ts`

In `createNotificationWithDelivery()`, pass `preheaderText` when building the email:

```typescript
html: buildNotificationEmail({
  title: params.title,
  body: params.body,
  ctaText: cta.text,
  ctaUrl: cta.url,
  preheaderText: params.title  // Use notification title as preheader
})
```

This is a one-line change at ~line 184-189. The preheader will show the notification title as the preview text in email clients (Gmail, Apple Mail, Outlook).

### Part C: Email Preview Dev Route

**New file**: `apps/web/app/api/email-preview/route.ts`

```typescript
import { NextResponse, type NextRequest } from "next/server";
import {
  buildConfirmationEmailTemplate,
  buildRecoveryEmailTemplate,
  buildInviteEmailTemplate,
  buildMagicLinkEmailTemplate
} from "@/lib/auth-email-templates";
import { buildNotificationEmail } from "@/lib/email-templates";

const TEMPLATES: Record<string, () => string> = {
  confirmation: buildConfirmationEmailTemplate,
  recovery: buildRecoveryEmailTemplate,
  invite: buildInviteEmailTemplate,
  magic_link: buildMagicLinkEmailTemplate,
  notification: () =>
    buildNotificationEmail({
      title: "Rent Payment Received",
      body: "Your tenant Jane Smith paid $1,200.00 for Unit 4B.\n\nThe payment has been recorded and a receipt is available in the dashboard.",
      ctaText: "View Dashboard",
      ctaUrl: "https://domusbase.com/owner",
      preheaderText: "Rent payment received for Unit 4B."
    })
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const template = request.nextUrl.searchParams.get("template");

  if (!template || !TEMPLATES[template]) {
    const available = Object.keys(TEMPLATES);
    return NextResponse.json(
      {
        error: "Specify a template query parameter.",
        available,
        example: "/api/email-preview?template=confirmation"
      },
      { status: 400 }
    );
  }

  const html = TEMPLATES[template]();

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
```

**Key requirements**:
- Return raw HTML with `Content-Type: text/html` so the browser renders it
- Block in production with a 404
- List available templates when no `?template` param provided
- The notification sample should include realistic content with a newline to test `<br />` conversion

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] `buildConfirmationEmailTemplate()` returns branded HTML with `{{ .ConfirmationURL }}` and "Confirm Email" CTA
2. [ ] `buildRecoveryEmailTemplate()` returns branded HTML with `{{ .ConfirmationURL }}` and "Reset Password" CTA
3. [ ] `buildInviteEmailTemplate()` returns branded HTML with `{{ .ConfirmationURL }}` and "Accept Invitation" CTA
4. [ ] `buildMagicLinkEmailTemplate()` returns branded HTML with `{{ .ConfirmationURL }}` and "Sign In to Domus" CTA
5. [ ] All 4 auth templates have the same visual design as `buildNotificationEmail()` (violet header, Dom mascot, emerald button, branded footer)
6. [ ] All 4 auth templates include hidden preheader `<span>`
7. [ ] All 4 auth templates include "Manage notification preferences" link in footer using `{{ .SiteURL }}/settings`
8. [ ] `buildNotificationEmail()` now accepts optional `preheaderText` parameter
9. [ ] When `preheaderText` is provided, a hidden preheader `<span>` is rendered
10. [ ] Notification email footer includes "Manage notification preferences" link to `/settings`
11. [ ] `createNotificationWithDelivery()` passes `preheaderText: params.title` to the template builder
12. [ ] `/api/email-preview?template=confirmation` returns rendered HTML in dev mode
13. [ ] `/api/email-preview` returns 404 when `NODE_ENV === "production"`
14. [ ] `/api/email-preview` without `?template` returns 400 with available templates list
15. [ ] `npm run gate:web` passes — all tests, lint, typecheck, build clean

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues encountered]
```

## 10. Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT install new npm dependencies
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections — report compact status only
- The auth email templates must use Supabase Go template variables (`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`) — these are NOT JavaScript template literals
- The `buildAuthEmailShell` must visually match `buildNotificationEmail` exactly — same colors, same layout, same spacing
- Use `escapeHtml()` on user-influenced content in notification templates, but NOT on pre-authored auth template body HTML
- The email preview route must be completely blocked in production
