-- Phase 5: Stripe payment tracking fields + manager-aware payment visibility

alter table payments add column if not exists stripe_checkout_session_id text;
alter table payments add column if not exists stripe_payment_intent_id text;

create unique index if not exists payments_stripe_checkout_session_id_key
  on payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

drop policy if exists "payments_select_accessible" on payments;
create policy "payments_select_accessible" on payments
for select using (
  exists (
    select 1
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    join units u on u.id = l.unit_id
    where rc.id = payments.rent_charge_id
      and public.can_access_property(u.property_id)
  )
);

drop policy if exists "payments_insert_accessible" on payments;
create policy "payments_insert_accessible" on payments
for insert with check (
  exists (
    select 1
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    join units u on u.id = l.unit_id
    where rc.id = payments.rent_charge_id
      and (
        public.can_access_property(u.property_id)
        or l.tenant_profile_id = auth.uid()
      )
  )
);
