# Sprint 255c — Tell co-owners that shared homes are not deleted (L2: copy + one read) — rev 1

## 1. Objective
Since Sprint 255b (`2286e49`) every wipe on Settings → Account & Data only touches accounts where the user is the
**only** active owner; for a shared account the full wipe only removes the user's own membership. A co-owner has no
way to know this. Show a short, calm note above the delete cards when the owner shares at least one account.

## 2. Context
- `app/settings/page.tsx:76-101` (owner branch) already reads the user's active owner memberships
  (`ownership_account_members`: `profile_id`, `member_role = 'owner'`, `active`) and `ownership_accounts`
  (`id, display_name, …`) for those ids.
- `components/settings/account-data-settings.tsx:112-166` renders `DeleteAccountSection`, legal links, then six
  `DangerActionCard`s. Props today: the six actions only (`app/settings/page.tsx:239-246`).
- Plain-language rules: `docs/claude/reference.md` (6th-grade, ≤ 12 words per sentence).

## 3. In scope
1. In the owner branch of `app/settings/page.tsx`, compute `sharedAccountNames: string[]`: display names of the
   user's owner accounts that have **another** active owner (one extra query: `ownership_account_members`
   `select("account_id, profile_id")` with `account_id in accountIds`, `member_role = 'owner'`, `active = true`;
   reuse the already-loaded account names; no query in a loop). On a read error: log with `console.error` and pass `[]`.
   Non-owners pass `[]`.
2. `AccountDataSettings` gets an optional `sharedAccountNames?: string[]` (default `[]`). When non-empty, render
   **above the first `DangerActionCard`** an informational `Alert` (not destructive styling) with `role="note"`:
   - line 1 (bold): **Some homes are shared with other owners.**
   - line 2: These buttons won't delete them. A full wipe only removes you.
   - line 3: `Shared: <names joined with ", ">` (names sorted A→Z).
   Nothing renders when the list is empty.

## 4. Out of scope
Wipe logic, the six cards' copy, other settings sections, layout changes beyond this note.

## 5. Exact files expected to change
- `apps/web/app/settings/page.tsx`
- `apps/web/components/settings/account-data-settings.tsx`
- `apps/web/components/settings/__tests__/account-data-shared-note.test.tsx` (new)

## 6. Implementation requirements
Exact copy above (no other wording). Lines ≤ 140 characters. Plain-language guard passes. Colors via existing tokens
only (readable in light and dark; no `--faint` text). L-022: no child-selector hiding. Every Supabase error checked
(L-002).

## 7. Validation
```
cd apps/web
npx vitest run components/settings/__tests__/account-data-shared-note.test.tsx
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- N1 With `sharedAccountNames={["Smith Family LLC", "Aspen LLC"]}` the note shows the three lines exactly, with
  `Shared: Aspen LLC, Smith Family LLC`, inside an element with `role="note"`, placed before the "Delete All
  Properties" heading in document order.
- N2 With `[]` or the prop omitted, no note and no "shared" text renders.
- N3 The six cards and their buttons are unchanged (same headings and button labels).
- N4 Gate green (counts verbatim).

## 9. Report format
Compact status only: N1–N4 → test names, counts. Do NOT include 'Claude prompt' or 'recommended next steps for
Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: a co-owner
sees, before any delete button, that shared homes stay safe. Claude walks Account & Data on production light and dark
with the smoke owner (no shared account → no note) and checks the note's render in the test.
