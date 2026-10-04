-- Only the Edge Function service role can reserve or consume OTPs.
-- Advisory locks serialize attempts for a user; provider calls happen after commit.
create or replace function public.reserve_client_otp(p_user_id uuid, p_phone text, p_code_hash text)
returns table(code_id uuid, status text)
language plpgsql security invoker set search_path = '' as $$
declare
  last_created timestamptz;
  inserted_id uuid;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' or p_phone !~ '^09[0-9]{9}$' then
    raise exception 'invalid_otp_parameters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.profiles where id = p_user_id and is_active and role in ('farmer', 'representative')) then
    return query select null::uuid, 'inactive'::text;
    return;
  end if;
  select created_at into last_created from public.client_otp_codes
    where user_id = p_user_id order by created_at desc limit 1;
  if last_created > pg_catalog.clock_timestamp() - interval '60 seconds' then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;
  insert into public.client_otp_codes(user_id, phone, code_hash, expires_at)
    values (p_user_id, p_phone, p_code_hash, pg_catalog.clock_timestamp() + interval '180 seconds')
    returning id into inserted_id;
  return query select inserted_id, 'reserved'::text;
end;
$$;

create or replace function public.consume_client_otp(p_user_id uuid, p_code_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  code public.client_otp_codes%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.profiles where id = p_user_id and is_active and role in ('farmer', 'representative')) then
    return 'inactive';
  end if;
  select * into code from public.client_otp_codes
    where user_id = p_user_id order by created_at desc limit 1 for update;
  if not found or code.expires_at <= pg_catalog.clock_timestamp() then return 'expired'; end if;
  if code.used_at is not null then return 'used'; end if;
  if code.failed_attempts >= 5 then return 'locked'; end if;
  if code.code_hash <> p_code_hash then
    update public.client_otp_codes set failed_attempts = failed_attempts + 1 where id = code.id;
    return case when code.failed_attempts + 1 >= 5 then 'locked' else 'invalid' end;
  end if;
  update public.client_otp_codes set used_at = pg_catalog.clock_timestamp() where id = code.id;
  return 'verified';
end;
$$;

create or replace function public.consume_admin_otp(p_user_id uuid, p_session_id uuid, p_code_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  code public.admin_otp_codes%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || p_session_id::text, 0));
  if not exists (select 1 from public.profiles where id = p_user_id and is_active and role = 'admin') then return 'inactive'; end if;
  select * into code from public.admin_otp_codes
    where user_id = p_user_id and session_id = p_session_id order by created_at desc limit 1 for update;
  if not found or code.expires_at <= pg_catalog.clock_timestamp() then return 'expired'; end if;
  if code.used_at is not null then return 'used'; end if;
  if code.failed_attempts >= 5 then return 'locked'; end if;
  if code.code_hash <> p_code_hash then
    update public.admin_otp_codes set failed_attempts = failed_attempts + 1 where id = code.id;
    return case when code.failed_attempts + 1 >= 5 then 'locked' else 'invalid' end;
  end if;
  update public.admin_otp_codes set used_at = pg_catalog.clock_timestamp() where id = code.id;
  return 'verified';
end;
$$;

revoke all on function public.reserve_client_otp(uuid, text, text) from public, anon, authenticated;
revoke all on function public.consume_client_otp(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_admin_otp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_client_otp(uuid, text, text) to service_role;
grant execute on function public.consume_client_otp(uuid, text) to service_role;
grant execute on function public.consume_admin_otp(uuid, uuid, text) to service_role;
-- Trigger functions do not need to be callable through the Data API.
revoke execute on function public.sync_profile_to_auth_user() from public, anon, authenticated;
