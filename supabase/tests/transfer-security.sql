\set ON_ERROR_STOP on
-- The helper runs as the caller, so the function's GRANT and identity checks are exercised.
create function public.expect_transfer_denied(year_id uuid, from_id uuid, to_id uuid, hours numeric, expected text)
returns void language plpgsql security invoker as $$
begin
  begin
    perform public.transfer_water(year_id, from_id, to_id, hours, 'loan', null);
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'Unexpected rejection: %', sqlerrm;
  end;
  raise exception 'Transfer unexpectedly allowed';
end $$;

set role anon;
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'فقط نماینده مجاز است');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'فقط نماینده مجاز است');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'اطلاعات انتقال معتبر نیست');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'فقط نماینده مجاز است');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'فقط نماینده مجاز است');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',1,'هر دو کشاورز باید عضو همین چاه باشند');
select public.expect_transfer_denied('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',8,'مقدار انتقال بیشتر از مانده فرستنده است');
reset role;
do $$ begin
  if (select count(*) from public.water_transfers) <> 0 or
     (select count(*) from public.water_allocations) <> 1 or
     (select allocated_hours from public.water_allocations limit 1) <> 10 then
    raise exception 'A rejected transfer changed data';
  end if;
end $$;
set role authenticated;
select public.transfer_water('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',4,'loan',null);
reset role;
do $$ begin
  if (select count(*) from public.water_transfers) <> 1 or
     (select allocated_hours from public.water_allocations where well_farmer_id='30000000-0000-4000-8000-000000000001') <> 6 or
     (select allocated_hours from public.water_allocations where well_farmer_id='30000000-0000-4000-8000-000000000002') <> 4 then
    raise exception 'Authorized transfer failed';
  end if;
end $$;
