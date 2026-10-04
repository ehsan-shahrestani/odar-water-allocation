#!/usr/bin/env python3
"""Exercise OTP concurrency and permissions in a disposable local Postgres."""
import concurrent.futures
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = 'odar-otp-test-' + uuid.uuid4().hex[:10]
USER = '11111111-1111-4111-8111-111111111111'
ADMIN = '22222222-2222-4222-8222-222222222222'
SESSION = '33333333-3333-4333-8333-333333333333'
HASH = 'a' * 64
WRONG = 'b' * 64

def sql(statement, check=True):
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result

def parallel(statement, count=12):
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
        return list(pool.map(lambda _: sql(statement).stdout.strip(), range(count)))

def main():
    subprocess.run(['docker', 'run', '--detach', '--name', CONTAINER, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'], check=True, capture_output=True)
    try:
        for _ in range(100):
            if sql('select 1;', False).returncode == 0:
                break
            time.sleep(.2)
        else:
            raise RuntimeError('Test database did not start')
        sql(f"""
          create role anon; create role authenticated; create role service_role;
          create table public.profiles(id uuid primary key, role text, is_active boolean);
          create table public.client_otp_codes(id uuid primary key default gen_random_uuid(), user_id uuid, phone text, code_hash text, failed_attempts integer default 0 check(failed_attempts between 0 and 5), expires_at timestamptz, used_at timestamptz, created_at timestamptz default now());
          create table public.admin_otp_codes(like public.client_otp_codes including all);
          alter table public.admin_otp_codes add column session_id uuid;
          create function public.sync_profile_to_auth_user() returns trigger language plpgsql as $$ begin return new; end; $$;
          insert into public.profiles values('{USER}', 'representative', true), ('{ADMIN}', 'admin', true);
          grant select on public.profiles to service_role;
          grant select, insert, update, delete on public.client_otp_codes, public.admin_otp_codes to service_role;
        """)
        migration = next((ROOT / 'supabase/migrations').glob('*_secure_function_authorization_and_otp.sql'))
        sql(migration.read_text())
        sql(f"select * from public.reserve_client_otp('{USER}', '09152404098', '{HASH}');")
        results = parallel(f"select public.consume_client_otp('{USER}', '{WRONG}');")
        assert results.count('invalid') == 4 and results.count('locked') == 8, results
        assert sql(f"select public.consume_client_otp('{USER}', '{HASH}');").stdout.strip() == 'locked'
        assert sql('select failed_attempts from public.client_otp_codes;').stdout.strip() == '5'
        sql("update public.client_otp_codes set failed_attempts = 0;")
        results = parallel(f"select public.consume_client_otp('{USER}', '{HASH}');")
        assert results.count('verified') == 1 and results.count('used') == 11, results
        sql("update public.client_otp_codes set created_at=now()-interval '10 minutes';")
        results = parallel(f"select status from public.reserve_client_otp('{USER}', '09152404098', '{HASH}');")
        assert results.count('reserved') == 1 and results.count('rate_limited') == 11, results
        sql(f"insert into public.admin_otp_codes(user_id, session_id, code_hash, expires_at) values('{ADMIN}', '{SESSION}', '{HASH}', now()+interval '3 minutes');")
        results = parallel(f"select public.consume_admin_otp('{ADMIN}', '{SESSION}', '{WRONG}');")
        assert results.count('invalid') == 4 and results.count('locked') == 8, results
        assert sql(f"select public.consume_admin_otp('{ADMIN}', '{SESSION}', '{HASH}');").stdout.strip() == 'locked'
        for role in ['anon', 'authenticated']:
            assert sql(f"set role {role}; select public.consume_client_otp('{USER}', '{HASH}');", False).returncode != 0
        sql(f"update public.profiles set is_active=false where id='{USER}';")
        assert sql(f"select public.consume_client_otp('{USER}', '{HASH}');").stdout.strip() == 'inactive'
        print('OTP concurrency, replay, lockout, resend, inactive accounts and RPC permissions passed.')
    finally:
        subprocess.run(['docker', 'rm', '--force', '--volumes', CONTAINER], check=True, capture_output=True)

if __name__ == '__main__':
    main()
