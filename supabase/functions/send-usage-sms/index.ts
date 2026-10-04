import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  authorizeCaller,
  authorizeWell,
  requestBody,
  RequestError,
  requireId,
} from '../_shared/authorization.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function toPersianDigits(value: number | string): string {
  const str = String(value);
  return str.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)] ?? d);
}

function formatShamsiDateTime(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date).replace(',', ' -');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: JSON_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('KAVENEGAR_API_KEY')?.trim();
  const configuredSender = Deno.env.get('KAVENEGAR_SENDER')?.trim();
  const configuredTemplate = Deno.env.get('KAVENEGAR_TEMPLATE_USAGE')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    console.error('KAVENEGAR_API_KEY is not configured');
    return jsonResponse({ error: 'کلید وب‌سرویس پیامک کاوه‌نگار تنظیم نشده است.' }, 500);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await authorizeCaller(req, admin, false);
    const body = requestBody(await req.json());

    if (body.getOutbox || body.getAccountInfo || body.checkMessageId) {
      throw new RequestError(403, 'این عملیات در دسترس نیست.');
    }
    const allocationId = requireId(body.allocationId);
    const { data: alloc, error: allocError } = await admin
      .from('water_allocations')
      .select(
        'id, allocated_hours, water_years(well_id), well_farmers(well_id, display_name, profiles(phone, full_name, is_active)), water_usages(consumed_hours)',
      )
      .eq('id', allocationId)
      .maybeSingle();
    if (allocError || !alloc) throw new RequestError(404, 'سهمیه یافت نشد.');
    const record = alloc as unknown as {
      allocated_hours: number;
      water_years: { well_id: string };
      well_farmers: {
        well_id: string;
        display_name: string;
        profiles: { phone: string; full_name: string; is_active: boolean };
      };
      water_usages: { consumed_hours: number }[];
    };
    const wellId = record.water_years.well_id;
    await authorizeWell(req, admin, wellId);
    if (record.well_farmers.well_id !== wellId || !record.well_farmers.profiles?.is_active) {
      throw new RequestError(400, 'اطلاعات کشاورز معتبر نیست.');
    }
    const receptor = normalizeIranianMobile(record.well_farmers.profiles.phone);
    const farmerName = record.well_farmers.display_name || record.well_farmers.profiles.full_name;
    const consumedHours = Number(body.consumedHours);
    if (!receptor || !Number.isFinite(consumedHours) || consumedHours <= 0) {
      throw new RequestError(400, 'اطلاعات مصرف یا شماره موبایل معتبر نیست.');
    }
    const totalUsed = record.water_usages.reduce(
      (sum, usage) => sum + Number(usage.consumed_hours),
      0,
    );
    if (!record.water_usages.some((usage) => Number(usage.consumed_hours) === consumedHours)) {
      throw new RequestError(400, 'مصرف ثبت‌شده یافت نشد.');
    }
    const remainingHours = Math.max(0, Number(record.allocated_hours) - totalUsed);
    const sender = configuredSender;

    const shamsiDate = formatShamsiDateTime(new Date());

    // Standard SMS send via Kavenegar REST API (sms/send.json)
    // Format:
    // سامانه اودار
    // -10 ساعت
    // مانده  120
    // تاریخ و ساعت شمسی
    const message = [
      'سامانه اودار',
      `-${toPersianDigits(consumedHours)} ساعت`,
      `مانده  ${toPersianDigits(remainingHours)}`,
      shamsiDate,
    ].join('\n');

    const form = new URLSearchParams({
      receptor,
      message,
    });

    if (sender) {
      form.set('sender', sender);
    }

    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
      console.error('Kavenegar SMS send failed', {
        httpStatus: response.status,
        kavenegarStatus: status,
        message: kavenegarData?.return?.message,
      });
      return jsonResponse(
        {
          error: `خطا در ارسال پیامک: ${kavenegarData?.return?.message || 'خطای نامشخص سرویس پیامک'}`,
          kavenegarStatus: status,
        },
        502,
      );
    }

    const entry = kavenegarData?.entries?.[0];
    const entryStatus = entry?.status;

    // Check delivery rejection due to blacklist
    if (entryStatus === 14) {
      return jsonResponse(
        {
          success: false,
          blocked: true,
          error:
            'پیامک ارسال نشد: شماره گیرنده در لیست سیاه مخابراتی (عدم تمایل به دریافت پیامک‌های تبلیغاتی) قرار دارد. برای این شماره‌ها باید از خط خدماتی استفاده شود.',
          entry,
          smsText: message,
        },
        200,
      );
    }

    if (entryStatus === 13) {
      return jsonResponse(
        {
          success: false,
          blocked: true,
          error:
            'پیامک توسط اپراتور لغو شد (احتمالاً به دلیل قرار داشتن خط گیرنده در بلک‌لیست پیامک تبلیغاتی).',
          entry,
          smsText: message,
        },
        200,
      );
    }

    // Extract cost in Rials from Kavenegar entry
    const cost = typeof entry?.cost === 'number' ? entry.cost : Number(entry?.cost || 0);
    const messageId = entry?.messageid ? String(entry.messageid) : null;

    // Record SMS expense for the well
    let expenseRecorded = false;
    if (wellId && supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const { error: expenseError } = await supabaseAdmin.from('well_expenses').insert({
          well_id: wellId,
          title: 'هزینه سرویس پیامکی',
          cost: cost,
          expense_type: 'sms',
          recipient_phone: receptor,
          recipient_name: farmerName,
          message_id: messageId,
          description: `پیامک کسر ${toPersianDigits(consumedHours)} ساعت مصرف آب (مانده: ${toPersianDigits(remainingHours)} ساعت)`,
        });

        if (expenseError) {
          console.error('Failed to record well expense for SMS:', expenseError);
        } else {
          expenseRecorded = true;
        }
      } catch (expErr) {
        console.error('Error inserting well expense:', expErr);
      }
    }

    return jsonResponse({
      success: true,
      message: 'پیامک با موفقیت به مخابرات ارسال شد.',
      messageId: entry?.messageid,
      cost,
      expenseRecorded,
      entry,
      smsText: message,
    });
  } catch (err: unknown) {
    if (err instanceof RequestError) return jsonResponse({ error: err.message }, err.status);
    console.error('Error processing send-usage-sms', err);
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'خطای ناشناخته در ارسال پیامک',
      },
      500,
    );
  }
});
