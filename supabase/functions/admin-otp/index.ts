import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const KAVENEGAR_TEMPLATE = "verification";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
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
  if (phone.length === 11) {
    return `${phone.slice(0, 4)}***${phone.slice(7)}`;
  }
  return phone;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const kavenegarApiKey = Deno.env.get("KAVENEGAR_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !kavenegarApiKey) {
    console.error("Server misconfigured: missing environment variables");
    return jsonResponse({ error: "خطای پیکربندی سرور" }, 500);
  }

  // Verify caller's JWT token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "نشست نامعتبر است. لطفاً ابتدا با ایمیل و رمز عبور وارد شوید." }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return jsonResponse({ error: "نشست نامعتبر یا منقضی شده است." }, 401);
  }

  const userId = userData.user.id;

  // Verify Admin Role and get phone
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, phone, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
    return jsonResponse({ error: "شما دسترسی ادمین ندارید یا حساب شما غیرفعال است." }, 403);
  }

  const rawPhone = profile.phone;
  const receptor = rawPhone ? normalizeIranianMobile(rawPhone) : null;

  if (!receptor) {
    return jsonResponse({ error: "شماره موبایل معتبر برای این حساب ادمین یافت نشد." }, 400);
  }

  let body: { action?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "قالب داده ارسالی نامعتبر است." }, 400);
  }

  if (body.action === "send") {
    // Generate secure 6-digit OTP
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otp = (100000 + (array[0] % 900000)).toString();
    const codeHash = await sha256(otp);
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 minutes

    // Invalidate existing unused codes for this admin
    await supabaseAdmin
      .from("admin_otp_codes")
      .delete()
      .eq("user_id", userId);

    // Save hash in database
    const { error: insertError } = await supabaseAdmin
      .from("admin_otp_codes")
      .insert({
        user_id: userId,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Failed to store OTP code", insertError);
      return jsonResponse({ error: "خطا در ثبت کد تایید" }, 500);
    }

    // Call Kavenegar verify lookup API
    const form = new URLSearchParams({
      receptor,
      token: otp,
      template: KAVENEGAR_TEMPLATE,
      type: "sms",
    });

    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(kavenegarApiKey)}/verify/lookup.json`;
    const smsResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    if (!smsResponse.ok) {
      console.error("Kavenegar SMS delivery failed", smsResponse.status);
      return jsonResponse({ error: "ارسال پیامک از طریق کاوه‌نگار با خطا مواجه شد." }, 502);
    }

    return jsonResponse({
      success: true,
      maskedPhone: maskPhone(receptor),
      expiresIn: 180,
    });
  }

  if (body.action === "verify") {
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return jsonResponse({ error: "کد تایید باید ۶ رقمی باشد." }, 400);
    }

    const codeHash = await sha256(code);

    const { data: record, error: findError } = await supabaseAdmin
      .from("admin_otp_codes")
      .select("id, expires_at, used_at")
      .eq("user_id", userId)
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !record) {
      return jsonResponse({ error: "کد تایید وارد شده اشتباه است." }, 400);
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید." }, 400);
    }

    // Mark code as used
    await supabaseAdmin
      .from("admin_otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", record.id);

    return jsonResponse({
      success: true,
      verified: true,
      message: "احراز هویت دو مرحله‌ای با موفقیت انجام شد.",
    });
  }

  return jsonResponse({ error: "عملیات نامعتبر است." }, 400);
});
