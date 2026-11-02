-- Minimal isolated schema for exercising the actual transfer migration.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.profiles(id uuid primary key, role text, is_active boolean);
create table public.wells(id uuid primary key, representative_id uuid);
create table public.water_years(id uuid primary key, well_id uuid references public.wells);
create table public.well_farmers(id uuid primary key, well_id uuid references public.wells, farmer_id uuid);
create table public.water_allocations(
  id uuid primary key default gen_random_uuid(), water_year_id uuid references public.water_years,
  well_farmer_id uuid references public.well_farmers, allocated_hours numeric not null,
  unique(water_year_id, well_farmer_id)
);
create table public.water_usages(id uuid primary key default gen_random_uuid(), allocation_id uuid references public.water_allocations, consumed_hours numeric);

insert into public.profiles values
 ('00000000-0000-4000-8000-000000000001','representative',true),
 ('00000000-0000-4000-8000-000000000002','farmer',true),
 ('00000000-0000-4000-8000-000000000003','representative',true),
 ('00000000-0000-4000-8000-000000000004','representative',false),
 ('00000000-0000-4000-8000-000000000005','admin',true);
insert into public.wells values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
insert into public.water_years values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');
insert into public.well_farmers values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',null),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',null);
insert into public.water_allocations(water_year_id, well_farmer_id, allocated_hours) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',10);
insert into public.water_usages(allocation_id,consumed_hours) select id, 3 from public.water_allocations;
