import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { evaluateKavenegarLookupResponse } from '../send-sms-kavenegar/kavenegar.ts';

const KAVENEGAR_TEMPLATE = 'verification';
const OTP_EXPIRES_IN_SECONDS = 180;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  action?: 'send' | 'verify';
  phone?: string;
  code?: string;
}

function jsonResponse(data: unknown, _status = 200): Response {
  // Always return HTTP 200 so supabase-js functions.invoke parses `data` correctly.
  // Non-2xx causes supabase-js to set data=null and error=FunctionsHttpError,
  // losing the structured error body.
  return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
}

function normalizeIranianMobile(phone: string): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[\s\-()]/g, '');
  let localPhone = compact;

  if (compact.startsWith('+98')) {
    localPhone = `0${compact.slice(3)}`;
  } else if (compact.startsWith('0098')) {
    localPhone = `0${compact.slice(4)}`;
  } else if (/^98\d{10}$/.test(compact)) {
    localPhone = `0${compact.slice(2)}`;
  } else if (/^9\d{9}$/.test(compact)) {
    localPhone = `0${compact}`;
  }

  return /^09\d{9}$/.test(localPhone) ? localPhone : null;
}

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 4)}***${phone.slice(7)}` : phone;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function generateSecurePassword(): string {
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specials = '!@#$%^&*';
  const all = lowers + uppers + numbers + specials;

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Guarantee at least one of each required category
  const chars = [
    lowers[randomBytes[0] % lowers.length],
    uppers[randomBytes[1] % uppers.length],
    numbers[randomBytes[2] % numbers.length],
    specials[randomBytes[3] % specials.length],
  ];

  for (let i = 4; i < 32; i++) {
    chars.push(all[randomBytes[i] % all.length]);
  }

  // In-place shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: JSON_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  const kavenegarApiKey = Deno.env.get('KAVENEGAR_API_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('Server misconfigured: missing environment variables');
    return jsonResponse({ error: 'خطای پیکربندی سرور' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'قالب داده ارسالی نامعتبر است.' }, 400);
  }

  if (!body || typeof body !== 'object' || typeof body.phone !== 'string')
    return jsonResponse({ error: 'شماره موبایل معتبر نیست.' }, 400);
  const rawPhone = body.phone.trim();
  const receptor = normalizeIranianMobile(rawPhone);
  if (!receptor) {
    return jsonResponse(
      { error: 'شماره موبایل وارد شده معتبر نیست. لطفاً شماره ۱۱ رقمی وارد کنید.' },
      400,
    );
  }

  const cleanDigits = receptor.slice(1); // 9xxxxxxxxx
  const e164 = `+98${cleanDigits}`;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Find user profile in public.profiles
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone, role, is_active')
    .or(
      `phone.eq.${receptor},phone.eq.+98${cleanDigits},phone.eq.98${cleanDigits},phone.eq.${cleanDigits}`,
    )
    .maybeSingle();

  if (profileError) {
    console.error('Failed to query profile', profileError);
    return jsonResponse({ error: 'خطا در بررسی اطلاعات کاربری' }, 500);
  }

  if (!profile || !profile.is_active) {
    return jsonResponse(
      {
        error:
          'حساب کاربری فعالی با این شماره موبایل یافت نشد. لطفاً با مدیر سامانه یا نماینده چاه تماس بگیرید.',
      },
      404,
    );
  }

  if (!['farmer', 'representative'].includes(profile.role)) {
    return jsonResponse({ error: 'ورود مدیران باید از پنل مدیریت انجام شود.' }, 403);
  }

  // ACTION: SEND
  if (body.action === 'send') {
    if (!kavenegarApiKey) {
      console.error('Server misconfigured: missing KAVENEGAR_API_KEY');
      return jsonResponse({ error: 'خطای پیکربندی سرویس پیامک' }, 500);
    }

    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const otp = (1000 + (random[0] % 9000)).toString();
    const { data: reservation, error: reserveError } = await supabaseAdmin.rpc(
      'reserve_client_otp',
      {
        p_user_id: profile.id,
        p_phone: receptor,
        p_code_hash: await sha256(otp),
      },
    );
    if (reserveError || !reservation?.[0])
      return jsonResponse({ error: 'ارسال کد تایید ممکن نشد.' }, 500);
    if (reservation[0].status !== 'reserved') {
      return jsonResponse(
        {
          error:
            reservation[0].status === 'rate_limited'
              ? 'برای ارسال مجدد کد کمی صبر کنید.'
              : 'حساب کاربری غیرفعال است.',
        },
        429,
      );
    }
    const insertedCode = { id: reservation[0].code_id };

    // Send via Kavenegar template: verification
    const form = new URLSearchParams({
      receptor,
      token: otp,
      template: KAVENEGAR_TEMPLATE,
      type: 'sms',
    });
    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(kavenegarApiKey)}/verify/lookup.json`;

    try {
      const smsResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });

      const providerResult = evaluateKavenegarLookupResponse(await smsResponse.json());
      if (!smsResponse.ok || !providerResult.ok) {
        await supabaseAdmin.from('client_otp_codes').delete().eq('id', insertedCode.id);
        console.error('Kavenegar SMS delivery failed', smsResponse.status);
        return jsonResponse({ error: 'ارسال پیامک از طریق کاوه‌نگار با خطا مواجه شد.' }, 502);
      }
    } catch (error: unknown) {
      await supabaseAdmin.from('client_otp_codes').delete().eq('id', insertedCode.id);
      console.error('Kavenegar SMS request failed', error);
      return jsonResponse({ error: 'ارتباط با سرویس پیامک ممکن نشد.' }, 502);
    }

    return jsonResponse({
      success: true,
      maskedPhone: maskPhone(receptor),
      expiresIn: OTP_EXPIRES_IN_SECONDS,
    });
  }

  // ACTION: VERIFY
  if (body.action === 'verify') {
    const code = body.code?.toString().trim();
    if (!code || !/^\d{4}$/.test(code)) {
      return jsonResponse({ error: 'کد تایید باید ۴ رقم باشد.' }, 400);
    }

    const { data: verification, error: verifyError } = await supabaseAdmin.rpc(
      'consume_client_otp',
      {
        p_user_id: profile.id,
        p_code_hash: await sha256(code),
      },
    );
    if (verifyError) return jsonResponse({ error: 'بررسی کد تایید ممکن نشد.' }, 500);
    if (verification !== 'verified') {
      const messages: Record<string, string> = {
        locked: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید.',
        used: 'این کد قبلاً استفاده شده است.',
        expired: 'کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید.',
        inactive: 'حساب کاربری غیرفعال است.',
      };
      return jsonResponse(
        { error: messages[String(verification)] || 'کد تایید وارد شده اشتباه است.' },
        verification === 'locked' ? 429 : 400,
      );
    }

    // Issue Supabase session for this user (must satisfy complexity and <= 72 characters)
    const internalEmail = `user_${profile.id.replace(/-/g, '')}@odar.internal`;
    const tempPassword = generateSecurePassword();

    // Check if auth user exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);

    if (!existingUser?.user) {
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        id: profile.id,
        phone: e164,
        phone_confirm: true,
        email: internalEmail,
        email_confirm: true,
        password: tempPassword,
        user_metadata: { full_name: profile.full_name },
      });
      if (createError) {
        console.error('Failed to provision auth user', createError);
        return jsonResponse(
          { error: 'خطا در ایجاد نشست ورود: ' + (createError.message || '') },
          500,
        );
      }
    } else {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
        phone: e164,
        phone_confirm: true,
        password: tempPassword,
        email: internalEmail,
        email_confirm: true,
      });
      if (updateError) {
        console.error('Failed to update user credentials', updateError);
        return jsonResponse(
          { error: 'خطا در آماده‌سازی ورود: ' + (updateError.message || '') },
          500,
        );
      }
    }

    // Sign in using anon client to generate real JWT session
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    let authSession = null;

    // Try signing in with phone first
    const phoneRes = await supabaseAnon.auth.signInWithPassword({
      phone: e164,
      password: tempPassword,
    });

    if (phoneRes.data?.session) {
      authSession = phoneRes.data.session;
    } else {
      // Fallback to internal email
      const emailRes = await supabaseAnon.auth.signInWithPassword({
        email: internalEmail,
        password: tempPassword,
      });

      if (emailRes.data?.session) {
        authSession = emailRes.data.session;
      } else {
        console.error('Failed to sign in in client-otp', {
          phoneErr: phoneRes.error?.message,
          emailErr: emailRes.error?.message,
        });
        return jsonResponse(
          {
            error:
              'ایجاد نشست با خطا مواجه شد: ' +
              (phoneRes.error?.message || emailRes.error?.message || ''),
          },
          500,
        );
      }
    }

    return jsonResponse({
      success: true,
      session: authSession,
      profile,
    });
  }

  return jsonResponse({ error: 'عملیات نامعتبر است.' }, 400);
});
