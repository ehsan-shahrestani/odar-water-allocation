import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface KavenegarResponse {
  return?: {
    status?: number;
    message?: string;
  };
  entries?: Array<{
    messageid?: number;
    receptor?: string;
    status?: number;
    statustext?: string;
    sender?: string;
    message?: string;
    cost?: number;
  }>;
}

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("KAVENEGAR_API_KEY")?.trim();
  const configuredSender = Deno.env.get("KAVENEGAR_SENDER")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey) {
    console.error("KAVENEGAR_API_KEY is not configured");
    return jsonResponse({ error: "کلید وب‌سرویس پیامک کاوه‌نگار تنظیم نشده است." }, 500);
  }

  try {
    const body = await req.json();

    const wellId = body.wellId ? String(body.wellId).trim() : null;
    const wellName = body.wellName ? String(body.wellName).trim() : "کشاورزی";
    const repId = body.representativeId ? String(body.representativeId).trim() : null;
    let receptor = body.phone ? normalizeIranianMobile(String(body.phone)) : null;
    let repName = body.fullName ? String(body.fullName).trim() : null;
    const sender = body.sender || configuredSender;

    if (!wellId || !repId) {
      return jsonResponse({ error: "شناسه چاه و نماینده الزامی است." }, 400);
    }

    // Lookup missing phone or name from profiles using service role key
    if ((!receptor || !repName) && supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", repId)
        .maybeSingle();

      if (!profileErr && profile) {
        if (!repName) repName = profile.full_name;
        if (!receptor && profile.phone) receptor = normalizeIranianMobile(profile.phone);
      }
    }

    if (!receptor) {
      return jsonResponse({ error: "شماره همراه نماینده یافت نشد یا نامعتبر است." }, 400);
    }

    // Message requested by user:
    // کاربر گرامی
    // پنل کاربری شما برای مدیریت چاه .... ایجاد شد.  سامانه اودار
    const message = [
      "کاربر گرامی",
      `پنل کاربری شما برای مدیریت چاه ${wellName} ایجاد شد.  سامانه اودار`,
    ].join("\n");

    const form = new URLSearchParams({
      receptor,
      message,
    });

    if (sender) {
      form.set("sender", sender);
    }

    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    let kavenegarData: KavenegarResponse | null = null;
    try {
      kavenegarData = (await response.json()) as KavenegarResponse;
    } catch {
      // ignore
    }

    const status = kavenegarData?.return?.status;
    if (!response.ok || (status !== 200 && status !== 201)) {
      console.error("Kavenegar SMS send failed", {
        httpStatus: response.status,
        kavenegarStatus: status,
        message: kavenegarData?.return?.message,
      });
      return jsonResponse({
        error: `خطا در ارسال پیامک: ${kavenegarData?.return?.message || "خطای نامشخص سرویس پیامک"}`,
        kavenegarStatus: status,
      }, 502);
    }

    const entry = kavenegarData?.entries?.[0];
    const entryStatus = entry?.status;

    if (entryStatus === 14) {
      return jsonResponse({
        success: false,
        blocked: true,
        error: "پیامک ارسال نشد: شماره گیرنده در لیست سیاه تبلیغاتی مخابرات قرار دارد.",
        entry,
        smsText: message,
      }, 200);
    }

    if (entryStatus === 13) {
      return jsonResponse({
        success: false,
        blocked: true,
        error: "پیامک توسط اپراتور لغو شد (احتمالاً به دلیل قرار داشتن خط گیرنده در بلک‌لیست).",
        entry,
        smsText: message,
      }, 200);
    }

    // Extract cost in Rials from Kavenegar entry
    const cost = typeof entry?.cost === "number" ? entry.cost : Number(entry?.cost || 0);
    const messageId = entry?.messageid ? String(entry.messageid) : null;

    // Record SMS expense for the well
    let expenseRecorded = false;
    if (wellId && supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { error: expenseError } = await supabaseAdmin
          .from("well_expenses")
          .insert({
            well_id: wellId,
            title: "هزینه سرویس پیامکی",
            cost: cost,
            expense_type: "sms",
            recipient_phone: receptor,
            recipient_name: repName || "نماینده مسئول",
            message_id: messageId,
            description: `پیامک ایجاد پنل کاربری مدیریت چاه «${wellName}» برای نماینده`,
          });

        if (expenseError) {
          console.error("Failed to record well expense for representative SMS:", expenseError);
        } else {
          expenseRecorded = true;
        }
      } catch (expErr) {
        console.error("Error inserting well expense:", expErr);
      }
    }

    return jsonResponse({
      success: true,
      message: "پیامک ایجاد پنل با موفقیت به نماینده ارسال شد.",
      messageId: entry?.messageid,
      cost,
      expenseRecorded,
      entry,
      smsText: message,
    });
  } catch (err: unknown) {
    console.error("Error processing send-representative-sms", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "خطای ناشناخته در ارسال پیامک",
    }, 500);
  }
});
