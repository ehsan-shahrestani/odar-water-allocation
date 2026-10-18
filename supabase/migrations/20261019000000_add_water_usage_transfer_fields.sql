-- Migration: Add water transfer and pump status fields to water_usages
-- Allows recording who the water was received from (or if the well pump was turned on)
-- and who the water was handed over to (or if the well pump was turned off).

alter table public.water_usages
  add column if not exists turned_on_pump boolean not null default false,
  add column if not exists received_from_well_farmer_id uuid references public.well_farmers(id) on delete set null,
  add column if not exists turned_off_pump boolean not null default false,
  add column if not exists delivered_to_well_farmer_id uuid references public.well_farmers(id) on delete set null;

comment on column public.water_usages.turned_on_pump is
  'نشان‌دهنده اینکه در شروع این نوبت، چاه توسط کشاورز روشن شده است';

comment on column public.water_usages.received_from_well_farmer_id is
  'شناسه عضویت کشاورزی که آب از او تحویل گرفته شده است (در صورت عدم روشن کردن اولیه چاه)';

comment on column public.water_usages.turned_off_pump is
  'نشان‌دهنده اینکه در پایان این نوبت، چاه توسط کشاورز خاموش شده است';

comment on column public.water_usages.delivered_to_well_farmer_id is
  'شناسه عضویت کشاورزی که آب به او تحویل داده شده است (در صورت عدم خاموش کردن نهایی چاه)';

-- Check constraints to prevent ambiguous states (cannot both turn on pump and receive from a farmer)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'check_water_usage_source'
  ) then
    alter table public.water_usages
    add constraint check_water_usage_source
    check (turned_on_pump = false or received_from_well_farmer_id is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'check_water_usage_destination'
  ) then
    alter table public.water_usages
    add constraint check_water_usage_destination
    check (turned_off_pump = false or delivered_to_well_farmer_id is null);
  end if;
end $$;

-- Indexes on foreign keys for fast joins and cascades
create index if not exists water_usages_received_from_idx
  on public.water_usages (received_from_well_farmer_id);

create index if not exists water_usages_delivered_to_idx
  on public.water_usages (delivered_to_well_farmer_id);
