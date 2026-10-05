-- Sprint 168: let Undo reverse the "Always do this" rule an answer created or changed.
-- (No check ties these to rule_id: rule_id is ON DELETE SET NULL, and cascades must never fail.)
-- rule_created: this bank item's answer inserted rule_id.
-- rule_snapshot: this bank item's answer overwrote an existing rule; holds the rule's previous
--   {action, lease_id, property_id, expense_category, label} so Undo can restore it.
alter table public.bank_transactions
  add column if not exists rule_created boolean not null default false,
  add column if not exists rule_snapshot jsonb;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_rule_undo_shape;
alter table public.bank_transactions
  add constraint bank_transactions_rule_undo_shape check (
    rule_snapshot is null or (rule_created = false and jsonb_typeof(rule_snapshot) = 'object')
  );
