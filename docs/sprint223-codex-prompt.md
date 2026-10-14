# Sprint 223 — Shared duties for an LLC (L2: new table + RLS, no money) · rev 1

Owner approved 2026-10-13. Source: `docs/partner-ledger-requirements.md` B6. The sister's sheet lists recurring duties, each with how often it happens and an owner. Examples:
- "Managing Tenant Mortgage Payment", Monthly;
- "Requesting Tax Documents from PFFCU", Annually;
- "Open Investment Account", Ad hoc, owned by Ace.

## 1. Objective
1. Each LLC has a shared **Tasks** list that every partner can see. Each task has:
   - a title;
   - how often it happens: monthly, every 3 months, yearly, or as needed;
   - an optional owner (a partner from Sprint 219);
   - a next due date.
2. **Mark done:** "Done" records who did it and when, and moves the next due date forward. As-needed tasks have no due date.
3. **Home:** if any task assigned to you is due within 7 days or overdue, "Needs you" shows "<n> tasks due".
4. **Getting started:** when an LLC has no tasks, **Add common tasks** adds the starter list in §3.4 in one tap. Each one stays editable.

## 2. Context (HEAD `ffaa100`, branch `main`)
- **Partners (Sprint 219):**
  - `public.account_partners(id, account_id, display_name, profile_id, active)`, with `unique (id, account_id)`;
  - helpers `public.is_owner_member_of_account(uuid)` and `public.is_llc_account(uuid)`;
  - `lib/partners.ts` `checkPartnerAccess` (user-scoped client, active owner member, LLC).
- **Money page:** `app/owner/money/page.tsx`, with `components/home-money/*`. The Partners card shows when a single LLC is selected (`singleSelectedAccount`).
- **Home:** `components/dashboard/owner-home/needs-you-list.tsx` (63 lines) and `lib/owner-wallet-home.ts` (the bank-needs count lives there).
- **Supabase:** default privileges grant ALL to anon and authenticated, so revoke first (lesson from 219).
- **Rules:** use only `is_owner_member_of_account` (never `is_creator_of_account`).

## 3. In scope
### 3.1 Migration `supabase/migrations/20261016_sprint223_account_tasks.sql` (Codex writes it; Claude applies it and runs attacker SQL)
1. **`public.account_tasks` table:**
   - columns:
     - `id uuid pk default gen_random_uuid()`;
     - `account_id uuid not null references ownership_accounts(id) on delete cascade`;
     - `title text not null check (length(trim(title)) between 1 and 80)`;
     - `frequency text not null check (frequency in ('monthly','quarterly','yearly','as_needed'))`;
     - `next_due_on date null`;
     - `owner_partner_id uuid null`;
     - `last_done_on date null`, `last_done_by_profile_id uuid null references profiles(id)`;
     - `active boolean not null default true`;
     - `created_by_profile_id uuid not null default auth.uid() references profiles(id)`, `created_at timestamptz not null default now()`;
   - constraints:
     - `check ((frequency = 'as_needed') = (next_due_on is null))`;
     - foreign key `(owner_partner_id, account_id)` → `account_partners(id, account_id)` `on delete set null (owner_partner_id)`. If your Postgres version doesn't support column-list `set null`, use a plain `on delete restrict` and have partner deactivation, not deletion, be the norm.
2. **RLS:** enable it.
   - select and delete: `is_owner_member_of_account(account_id)`;
   - insert `with check`: `is_owner_member_of_account(account_id) and is_llc_account(account_id) and created_by_profile_id = auth.uid()`;
   - update `using` and `with check`: `is_owner_member_of_account(account_id) and is_llc_account(account_id)`.
3. **Grants:**
   - `revoke all on public.account_tasks from anon, authenticated;`
   - `grant select, insert, delete on public.account_tasks to authenticated;`
   - `grant update (title, frequency, next_due_on, owner_partner_id, active, last_done_on) on public.account_tasks to authenticated;`
   - **`last_done_by_profile_id` isn't client-writable.**
4. **Trigger `account_tasks_done_by`** (BEFORE UPDATE, `SECURITY INVOKER`, `search_path = ''`): when `last_done_on` changes, set `new.last_done_by_profile_id := auth.uid()`. The trigger owns that column, so it can't be spoofed.

### 3.2 Server
1. **`lib/account-tasks.ts`** (new, ≤ 200 lines):
   - **`nextDueAfter(frequency, currentDue, today)`:** advance by 1, 3 or 12 months (end-of-month clamped, e.g. Jan 31 + 1 month → Feb 28/29) **until the date is after today**. `as_needed` → null.
   - **`loadAccountTasks(accountId)`:** user-scoped client, after `checkPartnerAccess` (owner member, LLC). Returns the tasks with owner names, sorted by `next_due_on` ascending, nulls last, then title.
   - **`countMyDueTasks(userId, today)`:** counts active tasks across all LLCs the user is an active owner member of, where the owner partner's `profile_id = userId` and `next_due_on <= today + 7 days`. Batched queries only.
2. **`app/actions/account-tasks.ts`** (new). Each action follows AGENTS.md §3: auth → owner role → `checkPartnerAccess(accountId)` → zod → user-scoped mutation, then check the error and revalidate:
   - **`addTask`:** title, frequency, an optional `nextDueOn` (required unless `as_needed`; defaults to today), and an optional owner partner (must be an active partner of the same account).
   - **`updateTask`**, and **`removeTask`** (sets `active = false`).
   - **`markTaskDone(taskId)`:** loads the task through the user-scoped client, sets `last_done_on = today` and `next_due_on = nextDueAfter(...)`. The trigger sets the "done by".
   - **`addCommonTasks(accountId)`:** inserts the §3.4 list in **one** insert, skipping any title that already exists for the account (case-insensitive). Due dates start from today (monthly: the 1st of next month; yearly: Jan 31 of next year; as-needed: null). No owners are set.
3. **`owner-wallet-home.ts`:** add `myTasksDueCount`, from `countMyDueTasks`, run in parallel with the other loads. **No more than 2 extra queries**, and keep the 225 critical path: run it in the existing `Promise.all`.

### 3.3 UI (Wallet look, phone first)
1. **Money page:** when a single LLC is selected (the same condition as the Partners card), show a **Tasks** card under Partners. Each row has:
   - the title;
   - a muted line: "<Monthly | Every 3 months | Yearly | As needed> · <Owner name or 'Anyone'> · Due <Mon D>". The "Due" part is omitted for as-needed; when overdue it reads "Overdue since <Mon D>" in the warning color;
   - a **Done** button (44px), plus a ⋯ menu with Edit and Remove.
   - After Done, the row shows "Done <today>" muted until the page refreshes.
2. **Add a task:** a sheet with Title, How often (Monthly / Every 3 months / Yearly / As needed), "Next due" date (hidden for As needed), "Who does it" (Anyone or each active partner), and Save.
3. **Empty state:** "No shared tasks yet." with **Add common tasks** (primary) and **Add a task**.
4. **Home "Needs you":** add the row "<n> tasks due" (`/owner/money?property=<an LLC home id>` is acceptable; prefer the Money page of the LLC that has the earliest due task). Place it after bank items, when `myTasksDueCount > 0`.

### 3.4 Starter list
From the sister's sheet. Titles are verbatim except plain-language tweaks:

| Task | How often |
|---|---|
| Manage the tenant's mortgage payment | Monthly |
| Manage the tenant's utility payments | Monthly |
| Pay the mortgage | Monthly |
| Pay vendors | As needed |
| Schedule repairs | As needed |
| Keep records | Monthly |
| Prepare the lease | Yearly |
| Send rent increase letters | Yearly |
| Talk through rent increases | Yearly |
| Request tax documents from PFFCU | Yearly |
| Prepare tax documents | Yearly |
| Shop for homeowners insurance | As needed |

## 4. Out of scope
- Notifications, emails and reminders (no sending until launch).
- Personal-account tasks (LLC only).
- Recurring "skip" options.
- History of every completion (only the last one is kept).
- Manager access.

## 5. Exact files expected to change
- `supabase/migrations/20261016_sprint223_account_tasks.sql` (new)
- `apps/web/lib/account-tasks.ts`, `apps/web/app/actions/account-tasks.ts` (new)
- `apps/web/components/home-money/tasks-card.tsx`, `task-sheet.tsx` (new, each ≤ 200 lines)
- `apps/web/app/owner/money/page.tsx`, `apps/web/components/home-money/home-money-page.tsx` (mount only)
- `apps/web/lib/owner-wallet-home.ts`, `apps/web/components/dashboard/owner-home/needs-you-list.tsx`, `wallet-home.tsx` (the count and row)
- `apps/web/lib/validations.ts` (the task schemas)
- Tests for all of the above.

## 6. Implementation requirements
- Lines ≤ 140 characters; new files ≤ 200 lines.
- Check every Supabase error. No query inside a loop.
- Actions follow AGENTS.md §3, and partner/task writes use the **user-scoped** client.
- 44px targets; tokens only; contrast ≥ 4.5:1 in light and dark.
- Copy, exactly:
  - "Tasks"
  - "Monthly"
  - "Every 3 months"
  - "Yearly"
  - "As needed"
  - "Anyone"
  - "Due <Mon D>"
  - "Overdue since <Mon D>"
  - "Done"
  - "Done <Mon D>"
  - "Edit"
  - "Remove"
  - "Add a task"
  - "Title"
  - "How often"
  - "Next due"
  - "Who does it"
  - "Save"
  - "No shared tasks yet."
  - "Add common tasks"
  - "<n> tasks due"
  - the §3.4 titles
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer.

## 7. Validation commands to run
- `npm run lint:web`
- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `cd apps/web && npx vitest run`
- `npm run build --workspace @domus/web`
- Don't apply the migration or run `gate:web`.

## 8. Acceptance criteria (binary; named tests that call real code)
1. **`nextDueAfter`:**
   - (a) monthly from a past date jumps past today;
   - (b) Jan 31 + 1 month → Feb 28 (and Feb 29 in a leap year);
   - (c) quarterly and yearly;
   - (d) as-needed → null.
2. **Actions:**
   - (a) a non-member, a tenant, a manager or a personal account is rejected;
   - (b) validation: title 1–80 characters; a due date is required unless as-needed; the owner must be an active partner of the account;
   - (c) `markTaskDone` sets `last_done_on` and advances `next_due_on`, and doesn't write `last_done_by_profile_id`;
   - (d) `addCommonTasks` makes one insert with the 12 tasks, skips existing titles case-insensitively, and sets the expected due dates;
   - (e) `removeTask` sets `active = false`;
   - (f) every error is checked.
3. **`countMyDueTasks`:** counts only tasks owned by the user's partner rows, active, due within 7 days or overdue, across the user's LLCs; other people's tasks aren't counted.
4. **UI:**
   - the Tasks card shows its rows with the exact copy, including overdue styling;
   - the empty state's buttons work;
   - the sheet hides "Next due" for As needed;
   - Done updates the row;
   - the Home row appears only when the count is > 0.
5. **Migration text test:**
   - RLS is enabled;
   - revoke comes before grants;
   - the column-level update grant excludes `last_done_by_profile_id`;
   - the trigger exists;
   - there's no `is_creator_of_account`;
   - the composite FK is present;
   - the frequency/due-date check is present.
6. Lint, typecheck, the full suite and the build are green.

**Claude will run live SQL (rolled back)** proving:
- a manager and an unrelated owner can't read or write tasks;
- an individual-account owner can't insert;
- `last_done_by_profile_id` can't be set directly, and the trigger sets it to the caller;
- `created_by` can't be spoofed;
- a cross-LLC owner partner is rejected by the FK.

## 9. Report format
JSON per `docs/codex-report-schema.json`, with the test names mapped to §8. Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
- Don't apply the migration or touch the live DB.
- No deploy, commit or push. Don't run `gate:web`.
- Don't touch `.claude/launch.json`, `apps/ios`, `apps/mobile`, `docs/`, or "* 2.*" files.
- Don't invent copy beyond what's specified here.
