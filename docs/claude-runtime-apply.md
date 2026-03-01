# Claude Runtime Apply Packet (Phase 9 Delta)

## Purpose
Use this packet to finish live Phase 9 runtime rollout in Supabase when columns/functions are partially applied.

## SQL To Execute
Run this file in Supabase SQL editor (single execution):

- `/Users/courtneysmith/Documents/Codex/Rental Properties/supabase/migrations/20260301_phase9_owner_account_columns_delta.sql`

## Expected SQL Outcome
1. `properties.owner_account_id` exists.
2. `invitations.ownership_account_id` exists.
3. `properties.owner_account_id` is fully backfilled and set `NOT NULL`.
4. Permission helper functions are available:
   1. `can_administer_property(target_property_id uuid)`
   2. `can_view_property(target_property_id uuid)`
   3. `can_access_property(target_property_id uuid)`

## Post-Apply Verification Commands
Run from repo root:

```bash
npm run verify:phase9-runtime
```

Expected high-level result in JSON:

1. `ok: true`
2. `summary.columnsReady: true`
3. `summary.functionsReady: true`
4. `summary.bucketsReady: true`
5. `summary.ownerAccountBackfillReady: true`

Additional SQL spot checks:

```sql
select count(*) from properties where owner_account_id is null;
```
Expected: `0`

```sql
select column_name from information_schema.columns where table_name='properties' and column_name='owner_account_id';
```
Expected: 1 row

```sql
select column_name from information_schema.columns where table_name='invitations' and column_name='ownership_account_id';
```
Expected: 1 row

## Failure Handling
1. If SQL execution fails, stop immediately.
2. Capture exact SQL error text and statement section.
3. Do not improvise schema edits in dashboard UI.
4. Log failure details in `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/agent-handoff.md`.
5. Re-run only after the failing statement is corrected in migration SQL.

## Proof Logging Requirements
Record the following in `/Users/courtneysmith/Documents/Codex/Rental Properties/docs/agent-handoff.md`:

1. UTC timestamp of SQL execution.
2. Runtime script JSON summary (or key fields).
3. Column check results.
4. Function availability results.
5. Bucket privacy results.
6. Any mismatch or residual blocker.
