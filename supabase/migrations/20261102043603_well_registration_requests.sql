create table public.well_registration_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  well_name text not null check (char_length(trim(well_name)) between 2 and 120),
  farmer_count integer not null check (farmer_count between 1 and 100000),
  created_at timestamptz not null default now()
);
alter table public.well_registration_requests enable row level security;
revoke all on public.well_registration_requests from public, anon, authenticated;
grant select on public.well_registration_requests to authenticated;
grant insert on public.well_registration_requests to service_role;
create policy "verified admins can read registration requests"
  on public.well_registration_requests for select to authenticated
  using ((select private.is_admin()));
create index well_registration_requests_created_at_idx on public.well_registration_requests(created_at desc);
