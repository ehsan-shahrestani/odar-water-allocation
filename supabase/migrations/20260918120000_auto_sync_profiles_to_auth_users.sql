-- Migration: Auto-sync profiles to auth.users
-- Ensures that any user created or updated in the Admin panel (public.profiles)
-- is automatically provisioned in auth.users and auth.identities with verified phone,
-- so that phone OTP login (signInWithOtp) works seamlessly even when signups are disabled.

CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_phone text;
  v_e164_phone text;
  v_identity_id uuid;
BEGIN
  -- 1. Normalize phone to E.164 digits without '+' (e.g. 989153779757)
  IF NEW.phone IS NULL OR trim(NEW.phone) = '' THEN
    RETURN NEW;
  END IF;

  v_clean_phone := regexp_replace(trim(NEW.phone), '[^\d]', '', 'g');

  IF v_clean_phone LIKE '09%' AND length(v_clean_phone) = 11 THEN
    v_e164_phone := '98' || substring(v_clean_phone from 2);
  ELSIF v_clean_phone LIKE '98%' AND length(v_clean_phone) = 12 THEN
    v_e164_phone := v_clean_phone;
  ELSIF v_clean_phone LIKE '9%' AND length(v_clean_phone) = 10 THEN
    v_e164_phone := '98' || v_clean_phone;
  ELSE
    v_e164_phone := v_clean_phone;
  END IF;

  IF length(v_e164_phone) < 10 THEN
    RETURN NEW;
  END IF;

  -- 2. If user does NOT exist in auth.users, provision them automatically
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id OR phone = v_e164_phone) THEN
    v_identity_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      phone,
      phone_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      NEW.id,
      'authenticated',
      'authenticated',
      v_e164_phone,
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"phone","providers":["phone"]}'::jsonb,
      jsonb_build_object('sub', NEW.id, 'phone_verified', true, 'full_name', NEW.full_name),
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_identity_id,
      NEW.id,
      jsonb_build_object('sub', NEW.id, 'phone_verified', true),
      'phone',
      NEW.id::text,
      now(),
      now(),
      now()
    );
  ELSE
    -- 3. If user exists with this ID, keep phone and metadata in sync
    UPDATE auth.users
    SET 
      phone = v_e164_phone,
      phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', NEW.full_name),
      updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_sync_to_auth_user ON public.profiles;

CREATE TRIGGER on_profile_sync_to_auth_user
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_auth_user();
