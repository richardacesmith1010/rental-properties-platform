# Sprint 94 — Invite & Signup Flow Diagnosis and Fix

## Objective

Diagnose and fix the reported 404 in the invite/signup flow. Verify all supported account-entry flows work end-to-end. Do not implement unrelated auth improvements.

## Primary Rule

Investigation must happen before implementation. If investigation shows the 404 was fully caused by Supabase config and no code path is broken, do not add speculative code fixes.

## Context

- **Branch:** `main`
- **HEAD:** `e90ad04`
- Supabase Site URL was previously misconfigured and produced malformed callback URLs.
- Config changes have already been applied.
- Remaining task is to confirm whether any code-level issues still exist in auth callback handling, invite link generation, or redirect targets.

## Required Output Sequence

1. Investigation findings
2. Confirmed root cause(s)
3. Whether config-only changes already solved the reported bug
4. Minimal code changes still justified
5. Validation results for all supported flows

## Investigation Requirements

- Reproduce or simulate the invite flow using the current config assumptions
- Capture the exact URL format for tenant invites and LLC invites
- Verify every redirect target in auth callback exists
- Verify callback behavior for all token types actually used by the app
- Verify whether `NEXT_PUBLIC_APP_URL` affects tenant invite links in production
- Verify whether the reported Angel Hernandez case is just an expired token and not a current code defect
- Verify profile/account/membership linkage after invite completion

## Supported Flows to Verify

1. Invited new tenant
2. Invited existing LLC member
3. Direct signup
4. Password sign-in
5. Password reset
6. Magic link, if supported by template/backend
7. Email change confirmation, if supported

## Implementation Rules

- Only modify code for verified issues
- Do not modify tenant invitation code or email templates unless investigation proves they are part of a broken live path
- Add callback support for `magiclink` and `email_change` only if those token types are actually used or expected by current templates/settings
- Do not add new pages unless required by a confirmed missing-route failure

## Validation Rules

- Manual runtime verification is required for invite, signup, and password reset flows
- Static code tracing alone is not sufficient
- Report whether each flow was runtime-tested, code-traced only, or not testable in current environment

### Validation Command

```bash
npm run gate:web
```

## Acceptance Criteria

- Invited user can follow invite email and complete onboarding without 404
- All active redirect targets exist
- All token types used by current Supabase templates/settings are handled
- No supported flow redirects to a missing page
- No speculative fixes added beyond verified root causes

## Report Format

```
investigation_findings: [list of findings]
root_cause: string
config_fix_sufficient: true/false
code_changes_made: [list or "none"]
gate_passed: true/false
flows_verified: [list with verification method: runtime-tested | code-traced | not-testable]
```

## Constraints

- Do NOT apply any database migrations
- Do NOT deploy to Vercel
- Do NOT modify test files, CLAUDE.md, or AGENTS.md
- Do NOT add password policy changes, lockout logic, or session expiry UX
- Do NOT create new pages unless required by a confirmed broken flow
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Investigation findings must be reported BEFORE implementation
- Only implement fixes for verified root causes
