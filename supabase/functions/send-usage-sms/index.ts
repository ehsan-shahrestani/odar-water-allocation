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

function toPersianDigits(value: number | string): string {
  const str = String(value);
  return str.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[parseInt(d, 10)] ?? d);
}

function formatShamsiDateTime(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(",", " -");
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
  const configuredTemplate = Deno.env.get("KAVENEGAR_TEMPLATE_USAGE")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!apiKey) {
    console.error("KAVENEGAR_API_KEY is not configured");
    return jsonResponse({ error: "کلید وب‌سرویس پیامک کاوه‌نگار تنظیم نشده است." }, 500);
  }

  try {
    const body = await req.json();

    // Diagnostics: Check message status
    if (body.checkMessageId) {
      const statusRes = await fetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/status.json?messageid=${encodeURIComponent(body.checkMessageId)}`
      );
      const statusJson = await statusRes.json();
      return jsonResponse({ statusCheck: statusJson });
    }

    // Diagnostics: Check account config
    if (body.getAccountInfo) {
      const infoRes = await fetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/account/config.json`
      );
      const infoJson = await infoRes.json();
      return jsonResponse({ accountConfig: infoJson });
    }

    // Diagnostics: Check outbox
    if (body.getOutbox) {
      const outboxRes = await fetch(
        `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/latestoutbox.json?pagesize=10`
      );
      const outboxJson = await outboxRes.json();
      return jsonResponse({ outbox: outboxJson });
    }

    let receptor = body.phone ? normalizeIranianMobile(String(body.phone)) : null;
    let wellId = body.wellId ? String(body.wellId).trim() : null;
    let farmerName: string | null = body.farmerName ? String(body.farmerName).trim() : null;
    const consumedHours = typeof body.consumedHours === "number" ? body.consumedHours : parseFloat(body.consumedHours || "0");
    let remainingHours = typeof body.remainingHours === "number" ? body.remainingHours : parseFloat(body.remainingHours || "0");
    const sender = body.sender || configuredSender;
    const template = body.template || configuredTemplate;

    // Lookup missing wellId, phone, farmerName, or remainingHours from database using allocationId
    if ((!wellId || !receptor || isNaN(remainingHours) || !farmerName) && body.allocationId && supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      const { data: alloc, error: allocError } = await supabaseAdmin
        .from("water_allocations")
        .select(`
          id,
          allocated_hours,
          water_years(well_id),
          well_farmers(
            well_id,
            profiles(phone, full_name)
          ),
          water_usages(consumed_hours)
        `)
        .eq("id", body.allocationId)
        .single();

      if (!allocError && alloc) {
        const rawWf = alloc.well_farmers as unknown as { well_id?: string; profiles?: { phone?: string; full_name?: string } } | null;
        const rawWy = alloc.water_years as unknown as { well_id?: string } | null;

        if (!wellId) {
          wellId = rawWy?.well_id || rawWf?.well_id || null;
        }

        const farmerProfile = rawWf?.profiles;
        if (!farmerName && farmerProfile?.full_name) {
          farmerName = farmerProfile.full_name;
        }
        if (!receptor && farmerProfile?.phone) {
          receptor = normalizeIranianMobile(farmerProfile.phone);
        }

        if (isNaN(remainingHours)) {
          const totalQuota = alloc.allocated_hours || 0;
          const usages = (alloc.water_usages as Array<{ consumed_hours: number }>) || [];
          const totalUsed = usages.reduce((sum, u) => sum + (u.consumed_hours || 0), 0);
          remainingHours = Math.max(0, totalQuota - totalUsed);
        }
      }
    }

    if (!receptor) {
      return jsonResponse({ error: "شماره موبایل گیرنده پیامک نامعتبر یا یافت نشد." }, 400);
    }

    if (isNaN(consumedHours) || consumedHours <= 0) {
      return jsonResponse({ error: "میزان ساعت مصرف نامعتبر است." }, 400);
    }

    const shamsiDate = formatShamsiDateTime(new Date());

    // Standard SMS send via Kavenegar REST API (sms/send.json)
    // Format:
    // سامانه اودار
    // -10 ساعت
    // مانده  120
    // تاریخ و ساعت شمسی
    const message = [
      "سامانه اودار",
      `-${toPersianDigits(consumedHours)} ساعت`,
      `مانده  ${toPersianDigits(remainingHours)}`,
      shamsiDate,
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

    // Check delivery rejection due to blacklist
    if (entryStatus === 14) {
      return jsonResponse({
        success: false,
        blocked: true,
        error: "پیامک ارسال نشد: شماره گیرنده در لیست سیاه مخابراتی (عدم تمایل به دریافت پیامک‌های تبلیغاتی) قرار دارد. برای این شماره‌ها باید از خط خدماتی استفاده شود.",
        entry,
        smsText: message,
      }, 200);
    }

    if (entryStatus === 13) {
      return jsonResponse({
        success: false,
        blocked: true,
        error: "پیامک توسط اپراتور لغو شد (احتمالاً به دلیل قرار داشتن خط گیرنده در بلک‌لیست پیامک تبلیغاتی).",
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
            recipient_name: farmerName,
            message_id: messageId,
            description: `پیامک کسر ${toPersianDigits(consumedHours)} ساعت مصرف آب (مانده: ${toPersianDigits(remainingHours)} ساعت)`,
          });

        if (expenseError) {
          console.error("Failed to record well expense for SMS:", expenseError);
        } else {
          expenseRecorded = true;
        }
      } catch (expErr) {
        console.error("Error inserting well expense:", expErr);
      }
    }

    return jsonResponse({
      success: true,
      message: "پیامک با موفقیت به مخابرات ارسال شد.",
      messageId: entry?.messageid,
      cost,
      expenseRecorded,
      entry,
      smsText: message,
    });
  } catch (err: unknown) {
    console.error("Error processing send-usage-sms", err);
    return jsonResponse({
      error: err instanceof Error ? err.message : "خطای ناشناخته در ارسال پیامک",
    }, 500);
  }
});
