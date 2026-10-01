-- Allow representatives to update farmers in their own wells
-- and to update the name/details of wells they manage.

-- 1. well_farmers: representative can UPDATE display_name on farmers in their well
drop policy if exists well_farmers_update_by_rep on public.well_farmers;
create policy well_farmers_update_by_rep on public.well_farmers
for update
to authenticated
using (private.can_manage_well(well_id))
with check (private.can_manage_well(well_id));

-- 2. wells: representative can UPDATE their own well (e.g. name, description)
drop policy if exists wells_update_by_rep on public.wells;
create policy wells_update_by_rep on public.wells
for update
to authenticated
using (
  representative_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role = 'representative'
  )
)
with check (
  representative_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role = 'representative'
  )
);
