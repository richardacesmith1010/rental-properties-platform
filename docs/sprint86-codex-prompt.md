# Sprint 86 — Account Switcher Fix + Plain Language Pass

## 1. Objective

Fix the broken account switcher dropdown so users can switch accounts via click, and perform a comprehensive plain language pass across all user-facing text per CLAUDE.md §18 word replacement list.

## 2. Context

- **Branch:** main
- **HEAD:** 00446c0
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

## 3. In Scope

- Debug and fix the account switcher combobox/select in the sidebar so clicking opens the dropdown and selecting an account navigates to it
- Plain language replacements across ALL user-facing components and lib files
- Specific text replacements listed in Implementation Requirements
- Full grep of codebase for banned jargon words

## 4. Out of Scope

- New features or UI redesign
- Database migrations
- Backend logic changes
- Notification system changes
- Mobile-specific layout changes

## 5. Exact Files Expected to Change

- `apps/web/components/sidebar/account-switcher.tsx`
- `apps/web/components/dashboard/members-section.tsx`
- `apps/web/lib/action-items.ts`
- Any component file containing banned words (grep will identify — expect 5-15 additional files)
- Potentially: `apps/web/components/dashboard/*-section.tsx`, `apps/web/app/actions/*.ts` (user-facing strings only)

## 6. Implementation Requirements

### Account Switcher Fix

1. Open `apps/web/components/sidebar/account-switcher.tsx` and identify why click events are not registering on the dropdown.
2. Common causes to check:
   - `pointer-events: none` or `z-index` issues from a parent element
   - Missing `onSelect` or `onChange` handler on the combobox/select
   - Radix UI or shadcn `Popover`/`Select` not wired to open state
   - Event propagation being stopped by a parent sidebar element
   - The component rendering a display-only element instead of an interactive one
3. Fix must ensure: clicking the switcher opens a dropdown, selecting an account triggers navigation to that account's context (e.g., via router push or context update).
4. Test by verifying: the dropdown opens on click, lists available accounts, and selecting one changes the active account.

### Plain Language Pass

Run these greps to find all instances:

```bash
grep -rn "Delinquency\|Disbursement\|Reconciliation\|Remittance\|Commence\|Terminate\|Pursuant\|Herein\|Utilize\|Facilitate\|Subsequent\|Prior to\|Inquire\|Endeavor" apps/web/components/ apps/web/app/ apps/web/lib/ --include="*.tsx" --include="*.ts"
```

Specific required replacements:

| Location | Current Text | Replacement |
|---|---|---|
| Action center heading | "Home Action Center" | "What needs attention" |
| Action items (action-items.ts) | "cancel the extras" or similar invite check text | "Check if your invites were accepted" |
| Members section / payout config | "Configure how rent payments for J&MSP are routed after the LLC account receives funds" | "How should rent money be split?" |
| Members section | "Members without a payout account keep their share in the LLC account" | "If someone hasn't linked their bank, their share stays in the LLC" |
| Payout strategy: Retain All | Description text | "Keep all money in the LLC" |
| Payout strategy: Split Equally | Description text | "Everyone gets the same amount" |
| Payout strategy: Custom Split | Description text | "You pick who gets what" |
| Any file | "Delinquency" | "Overdue" |
| Any file | "Disbursement" | "Payout" |
| Any file | "Reconciliation" | Remove or replace with simple explanation |
| Any file | "Remittance" | "Payment" |
| Any file | "Submit" (as button label) | "Send" |
| Any file | "Utilize" | "Use" |
| Any file | "Facilitate" | "Help" |
| Any file | "Subsequent" | "Next" |
| Any file | "Prior to" | "Before" |
| Any file | "Commence" | "Start" |
| Any file | "Terminate" | "End" |

Do NOT change internal variable names, database column names, or Stripe API field names — only user-facing strings (button labels, headings, descriptions, placeholder text, error messages, toast messages).

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

- [ ] Account switcher dropdown opens on click
- [ ] Selecting an account in the dropdown switches the active account context
- [ ] No console errors when interacting with the account switcher
- [ ] Zero instances of banned words in user-facing strings (verified by grep)
- [ ] All specific text replacements from the table above are applied
- [ ] `npm run gate:web` passes (lint, typecheck, build, tests)
- [ ] No unrelated file changes

## 9. Report Format

```
account_switcher_fixed: true/false
dropdown_opens_on_click: true/false
account_switch_works: true/false
plain_language_grep_clean: true/false
specific_replacements_applied: true/false
gate_passed: true/false
files_changed: [list]
```

## 10. Constraints

- Do NOT deploy to production
- Do NOT edit CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change database schema or run migrations
- Do NOT rename internal variables, types, or database column references
- Report compact status only
