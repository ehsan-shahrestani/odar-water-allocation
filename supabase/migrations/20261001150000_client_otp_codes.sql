-- Migration: Client 4-digit OTP codes table
-- Allows client mobile numbers (farmers & representatives) to log in with secure 4-digit SMS OTPs.

create table if not exists public.client_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_otp_codes_phone_idx
on public.client_otp_codes (phone, created_at desc);

create index if not exists client_otp_codes_user_id_idx
on public.client_otp_codes (user_id);

alter table public.client_otp_codes enable row level security;
revoke all on table public.client_otp_codes from anon, authenticated;
grant select, insert, update, delete on table public.client_otp_codes to service_role;

drop policy if exists client_otp_codes_deny_direct_access on public.client_otp_codes;
create policy client_otp_codes_deny_direct_access
on public.client_otp_codes
for all
to anon, authenticated
using (false)
with check (false);
