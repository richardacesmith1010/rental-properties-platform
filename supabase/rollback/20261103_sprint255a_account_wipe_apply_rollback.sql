-- Rollback for 20261103_sprint255a_account_wipe_apply.sql.
-- Deploy the previous app revision (per-operation wipe) BEFORE running this, or wipes will fail closed.
drop function if exists public.account_wipe_apply(jsonb);
