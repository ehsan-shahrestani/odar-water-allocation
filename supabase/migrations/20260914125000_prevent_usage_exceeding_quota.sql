-- Enforce that water_usages cannot exceed the allocation's allocated_hours
create or replace function public.check_water_usage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocated_hours numeric;
  v_total_consumed numeric;
  v_remaining numeric;
begin
  select allocated_hours into v_allocated_hours
  from public.water_allocations
  where id = NEW.allocation_id;

  if v_allocated_hours is null then
    raise exception using
      errcode = '22023',
      message = 'سهمیه‌ای برای این رکورد یافت نشد.';
  end if;

  select coalesce(sum(consumed_hours), 0) into v_total_consumed
  from public.water_usages
  where allocation_id = NEW.allocation_id
    and (TG_OP = 'INSERT' or id <> NEW.id);

  v_remaining := v_allocated_hours - v_total_consumed;

  if (v_total_consumed + NEW.consumed_hours) > v_allocated_hours then
    raise exception using
      errcode = '22023',
      message = format('میزان مصرف نمی‌تواند بیشتر از سهمیه باقیمانده (%s ساعت) باشد.', v_remaining);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_water_usage_quota on public.water_usages;
create trigger trg_check_water_usage_quota
before insert or update on public.water_usages
for each row
execute function public.check_water_usage_quota();

