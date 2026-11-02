-- Transfers change the usable allocation atomically and retain an immutable record.
create table public.water_transfers (
  id uuid primary key default gen_random_uuid(),
  water_year_id uuid not null references public.water_years(id) on delete restrict,
  from_well_farmer_id uuid not null references public.well_farmers(id) on delete restrict,
  to_well_farmer_id uuid not null references public.well_farmers(id) on delete restrict,
  hours numeric not null check (hours > 0 and hours::text not in ('NaN', 'Infinity', '-Infinity')),
  kind text not null check (kind in ('sale', 'loan', 'return', 'correction')),
  description text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (from_well_farmer_id <> to_well_farmer_id)
);
create index water_transfers_year_from_idx on public.water_transfers (water_year_id, from_well_farmer_id);
create index water_transfers_year_to_idx on public.water_transfers (water_year_id, to_well_farmer_id);
alter table public.water_transfers enable row level security;
grant select on public.water_transfers to authenticated;
create policy "participants and well representative can read transfers" on public.water_transfers
for select to authenticated using (
  exists (select 1 from public.water_years y join public.wells w on w.id = y.well_id
    where y.id = water_year_id and w.representative_id = (select auth.uid()))
  or exists (select 1 from public.well_farmers f where f.id in (from_well_farmer_id, to_well_farmer_id) and f.farmer_id = (select auth.uid()))
);

create function public.transfer_water(p_year uuid, p_from uuid, p_to uuid, p_hours numeric, p_kind text, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_well uuid; v_from_alloc uuid; v_to_alloc uuid; v_quota numeric; v_used numeric; v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'representative' and p.is_active) then
    raise exception 'فقط نماینده مجاز است.';
  end if;
  select y.well_id into v_well from public.water_years y join public.wells w on w.id = y.well_id
    where y.id = p_year and w.representative_id = auth.uid();
  if v_well is null or p_from = p_to or p_hours is null or p_hours <= 0 or p_hours::text in ('NaN', 'Infinity', '-Infinity')
    or p_kind not in ('sale', 'loan', 'return', 'correction') then raise exception 'اطلاعات انتقال معتبر نیست.'; end if;
  if not exists (select 1 from public.well_farmers where id = p_from and well_id = v_well)
    or not exists (select 1 from public.well_farmers where id = p_to and well_id = v_well) then
    raise exception 'هر دو کشاورز باید عضو همین چاه باشند.';
  end if;
  -- Serialize transfers and consumption checks for this year, including allocation creation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_year::text, 0));
  select id into v_from_alloc from public.water_allocations where water_year_id = p_year and well_farmer_id = p_from;
  if v_from_alloc is null then raise exception 'سهمیه فرستنده یافت نشد.'; end if;
  insert into public.water_allocations (water_year_id, well_farmer_id, allocated_hours)
    values (p_year, p_to, 0) on conflict (water_year_id, well_farmer_id) do nothing;
  select id into v_to_alloc from public.water_allocations where water_year_id = p_year and well_farmer_id = p_to;
  perform 1 from public.water_allocations where id in (v_from_alloc, v_to_alloc) order by id for update;
  select allocated_hours into v_quota from public.water_allocations where id = v_from_alloc;
  select coalesce(sum(consumed_hours), 0) into v_used from public.water_usages where allocation_id = v_from_alloc;
  if p_hours > v_quota - v_used then raise exception 'مقدار انتقال بیشتر از مانده فرستنده است.'; end if;
  update public.water_allocations set allocated_hours = allocated_hours - p_hours where id = v_from_alloc;
  update public.water_allocations set allocated_hours = allocated_hours + p_hours where id = v_to_alloc;
  insert into public.water_transfers(water_year_id, from_well_farmer_id, to_well_farmer_id, hours, kind, description, created_by)
    values (p_year, p_from, p_to, p_hours, p_kind, nullif(trim(p_description), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.transfer_water(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.transfer_water(uuid, uuid, uuid, numeric, text, text) to authenticated;

-- Lock the allocation row so concurrent usage and transfers cannot overspend.
create or replace function public.check_water_usage_quota() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_allocated_hours numeric; v_total_consumed numeric;
begin
  select allocated_hours into v_allocated_hours from public.water_allocations where id = new.allocation_id for update;
  if v_allocated_hours is null then raise exception 'سهمیه‌ای برای این رکورد یافت نشد.'; end if;
  select coalesce(sum(consumed_hours), 0) into v_total_consumed from public.water_usages
    where allocation_id = new.allocation_id and (tg_op = 'INSERT' or id <> new.id);
  if v_total_consumed + new.consumed_hours > v_allocated_hours then
    raise exception 'میزان مصرف نمی‌تواند بیشتر از سهمیه باقیمانده (% ساعت) باشد.', v_allocated_hours - v_total_consumed;
  end if;
  return new;
end $$;
