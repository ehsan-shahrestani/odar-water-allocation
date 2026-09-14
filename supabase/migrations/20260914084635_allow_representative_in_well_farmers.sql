-- Allow any active profile (farmers, representatives, admins) to be attached to well_farmers
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

  -- Allow any active profile (representatives are often farmers too)
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
