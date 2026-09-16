-- Bind custom admin OTP verification to the exact Supabase Auth session.
-- Existing pending codes predate session binding and must not remain usable.
delete from public.admin_otp_codes;

alter table public.admin_otp_codes
add column if not exists session_id uuid;

alter table public.admin_otp_codes
add column if not exists failed_attempts integer not null default 0;

alter table public.admin_otp_codes
alter column session_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_otp_codes_failed_attempts_check'
      and conrelid = 'public.admin_otp_codes'::regclass
  ) then
    alter table public.admin_otp_codes
    add constraint admin_otp_codes_failed_attempts_check
    check (failed_attempts between 0 and 5);
  end if;
end
$$;

create unique index if not exists admin_otp_codes_active_session_idx
on public.admin_otp_codes (user_id, session_id, created_at desc)
where used_at is null;

revoke all on table public.admin_otp_codes from anon, authenticated;
grant select, insert, update, delete on table public.admin_otp_codes to service_role;

drop policy if exists admin_otp_codes_deny_direct_access on public.admin_otp_codes;
create policy admin_otp_codes_deny_direct_access
on public.admin_otp_codes
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.admin_mfa_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint admin_mfa_sessions_expiry_check check (expires_at > verified_at)
);

create index if not exists admin_mfa_sessions_user_id_idx
on public.admin_mfa_sessions (user_id);

alter table public.admin_mfa_sessions enable row level security;
revoke all on table public.admin_mfa_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_mfa_sessions to service_role;

drop policy if exists admin_mfa_sessions_deny_direct_access on public.admin_mfa_sessions;
create policy admin_mfa_sessions_deny_direct_access
on public.admin_mfa_sessions
for all
to anon, authenticated
using (false)
with check (false);

create or replace function private.has_admin_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_mfa_sessions mfa
    where mfa.user_id = (select auth.uid())
      and mfa.session_id = nullif((select auth.jwt()->>'session_id'), '')::uuid
      and mfa.expires_at > now()
  );
$$;

revoke all on function private.has_admin_mfa() from public, anon, authenticated, service_role;
grant execute on function private.has_admin_mfa() to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.is_active = true
      and (select private.has_admin_mfa())
  );
$$;

create or replace function private.can_manage_well(target_well_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and (
        (p.role = 'admin' and (select private.has_admin_mfa()))
        or (
          p.role = 'representative'
          and exists (
            select 1
            from public.wells w
            where w.id = target_well_id
              and w.representative_id = p.id
          )
        )
      )
  );
$$;

create or replace function private.can_view_well(target_well_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and (
        (p.role = 'admin' and (select private.has_admin_mfa()))
        or (
          p.role = 'representative'
          and exists (
            select 1
            from public.wells w
            where w.id = target_well_id
              and w.representative_id = p.id
          )
        )
        or (
          p.role = 'farmer'
          and exists (
            select 1
            from public.well_farmers wf
            where wf.well_id = target_well_id
              and wf.farmer_id = p.id
          )
        )
      )
  );
$$;

revoke all on function private.is_admin() from public, anon, authenticated, service_role;
revoke all on function private.can_manage_well(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_view_well(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_manage_well(uuid) to authenticated;
grant execute on function private.can_view_well(uuid) to authenticated;

-- Trigger functions are not public RPC endpoints.
revoke execute on function public.check_water_usage_quota() from public, anon, authenticated;
