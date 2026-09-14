-- Store a farmer's representative-assigned name on the well membership itself.
-- The same profile can therefore have a different display name in another well.
alter table public.well_farmers
add column if not exists display_name text;

comment on column public.well_farmers.display_name is
  'نام مستعار کشاورز در همین چاه؛ مستقل از نام سراسری پروفایل';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'well_farmers_display_name_length'
      and conrelid = 'public.well_farmers'::regclass
  ) then
    alter table public.well_farmers
    add constraint well_farmers_display_name_length
    check (
      display_name is null
      or char_length(btrim(display_name)) between 1 and 120
    );
  end if;
end
$$;

-- Representatives no longer need directory-wide visibility of every farmer.
-- They can only read their own profile, administrators, or farmers already linked
-- to a well they manage.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
  or exists (
    select 1
    from public.well_farmers wf
    where wf.farmer_id = profiles.id
      and private.can_manage_well(wf.well_id)
  )
);

-- Called only by the authenticated Edge Function through the service role.
-- Keeping membership and the optional first allocation in one function makes
-- the database operation atomic.
create or replace function public.attach_farmer_to_well(
  p_well_id uuid,
  p_farmer_id uuid,
  p_display_name text,
  p_water_year_id uuid default null,
  p_allocated_hours numeric default null
)
returns table (
  well_farmer_id uuid,
  allocation_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_well_farmer_id uuid;
  inserted_allocation_id uuid;
  clean_display_name text := btrim(p_display_name);
begin
  if clean_display_name = '' or char_length(clean_display_name) > 120 then
    raise exception using
      errcode = '22023',
      message = 'invalid_display_name';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_farmer_id
      and p.is_active = true
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_farmer_profile';
  end if;

  if p_allocated_hours is not null and p_allocated_hours < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_allocated_hours';
  end if;

  if p_water_year_id is not null and not exists (
    select 1
    from public.water_years wy
    where wy.id = p_water_year_id
      and wy.well_id = p_well_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'water_year_does_not_belong_to_well';
  end if;

  if p_water_year_id is null and p_allocated_hours is not null then
    raise exception using
      errcode = '22023',
      message = 'water_year_required_for_allocation';
  end if;

  insert into public.well_farmers (well_id, farmer_id, display_name)
  values (p_well_id, p_farmer_id, clean_display_name)
  returning id into inserted_well_farmer_id;

  if p_water_year_id is not null and p_allocated_hours is not null then
    insert into public.water_allocations (
      water_year_id,
      well_farmer_id,
      allocated_hours
    )
    values (
      p_water_year_id,
      inserted_well_farmer_id,
      p_allocated_hours
    )
    returning id into inserted_allocation_id;
  end if;

  return query
  select inserted_well_farmer_id, inserted_allocation_id;
end;
$$;

revoke all on function public.attach_farmer_to_well(uuid, uuid, text, uuid, numeric)
from public, anon, authenticated;
grant execute on function public.attach_farmer_to_well(uuid, uuid, text, uuid, numeric)
to service_role;

-- Authorization roles must never be copied from user-editable Auth metadata.
-- New phone users always start as farmers; administrators can promote accounts
-- later through the protected admin workflow.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_profile_id uuid;
  norm_phone text;
begin
  if exists (
    select 1
    from public.profiles
    where id = new.id
      and role = 'admin'
  ) then
    return new;
  end if;

  if new.phone is not null and length(new.phone) >= 10 then
    norm_phone := right(regexp_replace(new.phone, '\D', '', 'g'), 10);
  end if;

  if norm_phone is not null then
    select id into existing_profile_id
    from public.profiles
    where right(regexp_replace(phone, '\D', '', 'g'), 10) = norm_phone
      and role <> 'admin'
    limit 1;
  end if;

  if existing_profile_id is not null then
    if existing_profile_id <> new.id then
      update public.profiles
      set id = new.id
      where id = existing_profile_id;
    end if;
  elsif not exists (
    select 1
    from public.profiles
    where id = new.id
  ) and norm_phone is not null then
    insert into public.profiles (id, full_name, phone, role, is_active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'کاربر ' || right(norm_phone, 4)),
      coalesce(new.phone, norm_phone),
      'farmer',
      true
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()
from public, anon, authenticated;
