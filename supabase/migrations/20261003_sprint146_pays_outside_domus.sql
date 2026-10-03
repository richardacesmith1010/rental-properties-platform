alter table public.leases
  add column if not exists collects_outside_domus boolean not null default false;

comment on column public.leases.collects_outside_domus is
  'When true, rent remains collectible but Domus does not mark it late or add late fees.';
