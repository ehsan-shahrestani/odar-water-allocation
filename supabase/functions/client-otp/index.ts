import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const KAVENEGAR_TEMPLATE = "verification";
const OTP_EXPIRES_IN_SECONDS = 180;
const OTP_RESEND_INTERVAL_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  action?: "send" | "verify";
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
  const compact = phone.replace(/[\s\-()]/g, "");
  let localPhone = compact;

  if (compact.startsWith("+98")) {
    localPhone = `0${compact.slice(3)}`;
  } else if (compact.startsWith("0098")) {
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
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const kavenegarApiKey = Deno.env.get("KAVENEGAR_API_KEY")?.trim();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("Server misconfigured: missing environment variables");
    return jsonResponse({ error: "خطای پیکربندی سرور" }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "قالب داده ارسالی نامعتبر است." }, 400);
  }

  const rawPhone = body.phone?.trim() ?? "";
  const receptor = normalizeIranianMobile(rawPhone);
  if (!receptor) {
    return jsonResponse({ error: "شماره موبایل وارد شده معتبر نیست. لطفاً شماره ۱۱ رقمی وارد کنید." }, 400);
  }

  const cleanDigits = receptor.slice(1); // 9xxxxxxxxx
  const e164 = `+98${cleanDigits}`;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Find user profile in public.profiles
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .or(`phone.eq.${receptor},phone.eq.+98${cleanDigits},phone.eq.98${cleanDigits},phone.eq.${cleanDigits}`)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to query profile", profileError);
    return jsonResponse({ error: "خطا در بررسی اطلاعات کاربری" }, 500);
  }

  if (!profile || !profile.is_active) {
    return jsonResponse(
      { error: "حساب کاربری فعالی با این شماره موبایل یافت نشد. لطفاً با مدیر سامانه یا نماینده چاه تماس بگیرید." },
      404,
    );
  }

  if (profile.role === "admin") {
    return jsonResponse({ error: "ورود مدیران باید از پنل مدیریت انجام شود." }, 403);
  }

  // ACTION: SEND
  if (body.action === "send") {
    if (!kavenegarApiKey) {
      console.error("Server misconfigured: missing KAVENEGAR_API_KEY");
      return jsonResponse({ error: "خطای پیکربندی سرویس پیامک" }, 500);
    }

    // Rate limit check: wait OTP_RESEND_INTERVAL_SECONDS between requests
    const { data: latestCode, error: latestCodeError } = await supabaseAdmin
      .from("client_otp_codes")
      .select("created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCodeError) {
      console.error("Failed to check client OTP rate limit", latestCodeError);
      return jsonResponse({ error: "ارسال کد تایید ممکن نشد." }, 500);
    }

    if (
      latestCode &&
      Date.now() - new Date(latestCode.created_at).getTime() < OTP_RESEND_INTERVAL_SECONDS * 1000
    ) {
      return jsonResponse({ error: "برای ارسال مجدد کد کمی صبر کنید." }, 429);
    }

    // Generate strict 4-digit OTP: 1000..9999
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const otp = (1000 + (random[0] % 9000)).toString();
    const codeHash = await sha256(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_SECONDS * 1000).toISOString();

    // Clean up only expired codes for this user, keeping recent valid codes active
    await supabaseAdmin
      .from("client_otp_codes")
      .delete()
      .eq("user_id", profile.id)
      .lt("expires_at", new Date().toISOString());

    const { data: insertedCode, error: insertError } = await supabaseAdmin
      .from("client_otp_codes")
      .insert({
        user_id: profile.id,
        phone: receptor,
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertError || !insertedCode) {
      console.error("Failed to store client OTP", insertError);
      return jsonResponse({ error: "خطا در ثبت کد تایید" }, 500);
    }

    // Send via Kavenegar template: verification
    const form = new URLSearchParams({
      receptor,
      token: otp,
      template: KAVENEGAR_TEMPLATE,
      type: "sms",
    });
    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(kavenegarApiKey)}/verify/lookup.json`;

    try {
      const smsResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });

      if (!smsResponse.ok) {
        await supabaseAdmin.from("client_otp_codes").delete().eq("id", insertedCode.id);
        const errorText = await smsResponse.text();
        console.error("Kavenegar SMS delivery failed", smsResponse.status, errorText);
        return jsonResponse({ error: "ارسال پیامک از طریق کاوه‌نگار با خطا مواجه شد." }, 502);
      }
    } catch (error: unknown) {
      await supabaseAdmin.from("client_otp_codes").delete().eq("id", insertedCode.id);
      console.error("Kavenegar SMS request failed", error);
      return jsonResponse({ error: "ارتباط با سرویس پیامک ممکن نشد." }, 502);
    }

    return jsonResponse({
      success: true,
      maskedPhone: maskPhone(receptor),
      expiresIn: OTP_EXPIRES_IN_SECONDS,
    });
  }

  // ACTION: VERIFY
  if (body.action === "verify") {
    const code = body.code?.toString().trim();
    if (!code || !/^\d{4}$/.test(code)) {
      return jsonResponse({ error: "کد تایید باید ۴ رقم باشد." }, 400);
    }

    const codeHash = await sha256(code);
    const nowIso = new Date().toISOString();

    // 1. Look for matching unexpired, unused code for this user
    const { data: matchedRecord, error: matchError } = await supabaseAdmin
      .from("client_otp_codes")
      .select("id, user_id, code_hash, expires_at, failed_attempts")
      .eq("user_id", profile.id)
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matchError) {
      console.error("Failed to query matched client OTP", matchError);
      return jsonResponse({ error: "بررسی کد تایید ممکن نشد." }, 500);
    }

    if (!matchedRecord) {
      // No match found — check latest code to give exact reason (expired or wrong code)
      const { data: latestRecord } = await supabaseAdmin
        .from("client_otp_codes")
        .select("id, expires_at, failed_attempts")
        .eq("user_id", profile.id)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRecord || new Date(latestRecord.expires_at).getTime() <= Date.now()) {
        return jsonResponse({ error: "کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید." }, 400);
      }

      if (latestRecord.failed_attempts >= MAX_VERIFY_ATTEMPTS) {
        return jsonResponse({ error: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید." }, 429);
      }

      const failedAttempts = latestRecord.failed_attempts + 1;
      await supabaseAdmin
        .from("client_otp_codes")
        .update({ failed_attempts: failedAttempts })
        .eq("id", latestRecord.id);

      const errorMessage =
        failedAttempts >= MAX_VERIFY_ATTEMPTS
          ? "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید."
          : "کد تایید وارد شده اشتباه است.";

      return jsonResponse({ error: errorMessage }, failedAttempts >= MAX_VERIFY_ATTEMPTS ? 429 : 400);
    }

    // Mark matched record as used
    await supabaseAdmin
      .from("client_otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", matchedRecord.id);

    // Clean up other unused codes for this user
    await supabaseAdmin
      .from("client_otp_codes")
      .delete()
      .eq("user_id", profile.id)
      .is("used_at", null);

    // Issue Supabase session for this user
    const internalEmail = `user_${profile.id.replace(/-/g, "")}@odar.internal`;
    const tempPassword = crypto.randomUUID() + "-" + crypto.randomUUID();

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
        console.error("Failed to provision auth user", createError);
        return jsonResponse({ error: "خطا در ایجاد نشست ورود: " + (createError.message || "") }, 500);
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
        console.error("Failed to update user credentials", updateError);
        return jsonResponse({ error: "خطا در آماده‌سازی ورود: " + (updateError.message || "") }, 500);
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
        console.error("Failed to sign in in client-otp", {
          phoneErr: phoneRes.error?.message,
          emailErr: emailRes.error?.message,
        });
        return jsonResponse(
          { error: "ایجاد نشست با خطا مواجه شد: " + (phoneRes.error?.message || emailRes.error?.message || "") },
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

  return jsonResponse({ error: "عملیات نامعتبر است." }, 400);
});
