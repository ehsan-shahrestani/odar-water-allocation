import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const KAVENEGAR_TEMPLATE = "verification";
const OTP_EXPIRES_IN_SECONDS = 180;
const OTP_RESEND_INTERVAL_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const MFA_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  action?: "send" | "verify" | "status" | "revoke";
  code?: string;
}

interface JwtPayload {
  session_id?: unknown;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normalizeIranianMobile(phone: string): string | null {
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

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getSessionId(token: string): string | null {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as JwtPayload;
    return typeof payload.session_id === "string" && UUID_PATTERN.test(payload.session_id)
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
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
  const kavenegarApiKey = Deno.env.get("KAVENEGAR_API_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Server misconfigured: missing environment variables");
    return jsonResponse({ error: "خطای پیکربندی سرور" }, 500);
  }

  const token = getBearerToken(req);
  if (!token) {
    return jsonResponse({ error: "نشست نامعتبر است. لطفاً ابتدا وارد شوید." }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const sessionId = getSessionId(token);
  if (userError || !userData.user || !sessionId) {
    return jsonResponse({ error: "نشست نامعتبر یا منقضی شده است." }, 401);
  }

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, phone, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
    return jsonResponse({ error: "شما دسترسی ادمین ندارید یا حساب شما غیرفعال است." }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonResponse({ error: "قالب داده ارسالی نامعتبر است." }, 400);
  }

  if (body.action === "status") {
    const now = new Date().toISOString();
    const { data: proof, error } = await supabaseAdmin
      .from("admin_mfa_sessions")
      .select("expires_at")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .gt("expires_at", now)
      .maybeSingle();

    if (error) {
      console.error("Failed to read admin MFA status", error);
      return jsonResponse({ error: "بررسی مرحله دوم ورود ممکن نشد." }, 500);
    }
    if (!proof) {
      await supabaseAdmin
        .from("admin_mfa_sessions")
        .delete()
        .eq("user_id", userId)
        .lte("expires_at", now);
    }
    return jsonResponse({ success: true, verified: Boolean(proof), expiresAt: proof?.expires_at });
  }

  if (body.action === "revoke") {
    const { error } = await supabaseAdmin
      .from("admin_mfa_sessions")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", userId);
    if (error) {
      console.error("Failed to revoke admin MFA proof", error);
      return jsonResponse({ error: "خروج امن کامل نشد." }, 500);
    }
    return jsonResponse({ success: true });
  }

  const receptor = typeof profile.phone === "string"
    ? normalizeIranianMobile(profile.phone)
    : null;
  if (!receptor) {
    return jsonResponse({ error: "شماره موبایل معتبر برای این حساب ادمین یافت نشد." }, 400);
  }

  if (body.action === "send") {
    if (!kavenegarApiKey) {
      console.error("Server misconfigured: missing KAVENEGAR_API_KEY");
      return jsonResponse({ error: "خطای پیکربندی سرویس پیامک" }, 500);
    }

    await supabaseAdmin
      .from("admin_otp_codes")
      .delete()
      .eq("user_id", userId)
      .lt("expires_at", new Date().toISOString());

    const { data: latestCode, error: latestCodeError } = await supabaseAdmin
      .from("admin_otp_codes")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCodeError) {
      console.error("Failed to check OTP rate limit", latestCodeError);
      return jsonResponse({ error: "ارسال کد تایید ممکن نشد." }, 500);
    }
    if (
      latestCode &&
      Date.now() - new Date(latestCode.created_at).getTime() < OTP_RESEND_INTERVAL_SECONDS * 1000
    ) {
      return jsonResponse({ error: "برای ارسال مجدد کد کمی صبر کنید." }, 429);
    }

    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const otp = (100000 + (random[0] % 900000)).toString();
    const codeHash = await sha256(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_SECONDS * 1000).toISOString();

    await supabaseAdmin
      .from("admin_otp_codes")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", sessionId);

    const { data: insertedCode, error: insertError } = await supabaseAdmin
      .from("admin_otp_codes")
      .insert({ user_id: userId, session_id: sessionId, code_hash: codeHash, expires_at: expiresAt })
      .select("id")
      .single();

    if (insertError || !insertedCode) {
      console.error("Failed to store OTP code", insertError);
      return jsonResponse({ error: "خطا در ثبت کد تایید" }, 500);
    }

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
        await supabaseAdmin.from("admin_otp_codes").delete().eq("id", insertedCode.id);
        console.error("Kavenegar SMS delivery failed", smsResponse.status);
        return jsonResponse({ error: "ارسال پیامک از طریق کاوه‌نگار با خطا مواجه شد." }, 502);
      }
    } catch (error: unknown) {
      await supabaseAdmin.from("admin_otp_codes").delete().eq("id", insertedCode.id);
      console.error("Kavenegar SMS request failed", error);
      return jsonResponse({ error: "ارتباط با سرویس پیامک ممکن نشد." }, 502);
    }

    return jsonResponse({
      success: true,
      maskedPhone: maskPhone(receptor),
      expiresIn: OTP_EXPIRES_IN_SECONDS,
    });
  }

  if (body.action === "verify") {
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return jsonResponse({ error: "کد تایید باید ۶ رقمی باشد." }, 400);
    }

    const { data: record, error: findError } = await supabaseAdmin
      .from("admin_otp_codes")
      .select("id, code_hash, expires_at, failed_attempts")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error("Failed to read OTP code", findError);
      return jsonResponse({ error: "بررسی کد تایید ممکن نشد." }, 500);
    }
    if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید." }, 400);
    }
    if (record.failed_attempts >= MAX_VERIFY_ATTEMPTS) {
      return jsonResponse({ error: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید." }, 429);
    }

    const codeHash = await sha256(code);
    if (codeHash !== record.code_hash) {
      const failedAttempts = record.failed_attempts + 1;
      await supabaseAdmin
        .from("admin_otp_codes")
        .update({ failed_attempts: failedAttempts })
        .eq("id", record.id)
        .is("used_at", null);
      const error = failedAttempts >= MAX_VERIFY_ATTEMPTS
        ? "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید دریافت کنید."
        : "کد تایید وارد شده اشتباه است.";
      return jsonResponse({ error }, failedAttempts >= MAX_VERIFY_ATTEMPTS ? 429 : 400);
    }

    const usedAt = new Date().toISOString();
    const { data: usedCode, error: updateError } = await supabaseAdmin
      .from("admin_otp_codes")
      .update({ used_at: usedAt })
      .eq("id", record.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (updateError || !usedCode) {
      return jsonResponse({ error: "این کد قبلاً استفاده شده است." }, 409);
    }

    const mfaExpiresAt = new Date(Date.now() + MFA_SESSION_LIFETIME_MS).toISOString();
    const { error: proofError } = await supabaseAdmin
      .from("admin_mfa_sessions")
      .upsert({
        session_id: sessionId,
        user_id: userId,
        verified_at: usedAt,
        expires_at: mfaExpiresAt,
      }, { onConflict: "session_id" });

    if (proofError) {
      console.error("Failed to store admin MFA proof", proofError);
      return jsonResponse({ error: "ثبت مرحله دوم ورود ممکن نشد. کد جدید دریافت کنید." }, 500);
    }

    return jsonResponse({ success: true, verified: true, expiresAt: mfaExpiresAt });
  }

  return jsonResponse({ error: "عملیات نامعتبر است." }, 400);
});
