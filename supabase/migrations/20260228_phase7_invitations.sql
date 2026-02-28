-- Phase 7: Tenant & Manager Onboarding via Invitations
-- Applied to live database via Supabase MCP on 2026-02-28

-- ─── 1. Invitations table ───
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role text not null check (role in ('tenant', 'manager')),
  property_id uuid references properties(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  status text not null check (status in ('pending', 'accepted', 'expired')) default 'pending',
  invited_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(email, role, invited_by)
);

-- ─── 2. Updated handle_new_user() trigger ───
-- Reads role from auth metadata instead of hardcoding 'tenant'.
-- Also auto-accepts pending invitations when the invited user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _role text;
begin
  _role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'tenant');
  if _role not in ('owner', 'manager', 'tenant') then _role := 'tenant'; end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    _role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  -- Auto-accept pending invitations for this email
  update public.invitations
  set status = 'accepted', accepted_at = now(), invited_profile_id = new.id
  where lower(email) = lower(new.email) and status = 'pending';

  return new;
end; $$;

-- ─── 3. RLS policies ───
alter table invitations enable row level security;

-- Owners see their own invitations
create policy "invitations_select_owner" on invitations
  for select using (invited_by = auth.uid());

-- Owners can create invitations
create policy "invitations_insert_owner" on invitations
  for insert with check (
    invited_by = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and role = 'owner')
  );

-- Owners can update their own invitations (resend)
create policy "invitations_update_owner" on invitations
  for update using (invited_by = auth.uid());
