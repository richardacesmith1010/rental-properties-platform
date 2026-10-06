-- Sprint 179 (Speed): index foreign-key lookup columns used by owner/tenant loaders and RLS helpers.
-- Additive only; verified 2026-10-06 that none of these existed.
create index if not exists property_expenses_property_date_idx on public.property_expenses (property_id, expense_date desc);
create index if not exists maintenance_tickets_property_created_idx on public.maintenance_tickets (property_id, created_at desc);
create index if not exists payments_rent_charge_paid_idx on public.payments (rent_charge_id, paid_at desc);
create index if not exists leases_unit_id_idx on public.leases (unit_id);
create index if not exists leases_tenant_profile_id_idx on public.leases (tenant_profile_id);
create index if not exists property_managers_manager_profile_id_idx on public.property_managers (manager_profile_id);
create index if not exists invitations_property_id_idx on public.invitations (property_id);
