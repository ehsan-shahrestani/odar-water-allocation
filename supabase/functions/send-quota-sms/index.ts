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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: JSON_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('KAVENEGAR_API_KEY')?.trim();
  const configuredSender = Deno.env.get('KAVENEGAR_SENDER')?.trim();
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

    const wellId = requireId(body.wellId);
    const farmerId = requireId(body.farmerId);
    const waterYearId = requireId(body.waterYearId);
    const { well } = await authorizeWell(req, admin, wellId);
    const { data: membership, error: membershipError } = await admin
      .from('well_farmers')
      .select('id, display_name, profiles(phone, full_name, is_active)')
      .eq('well_id', wellId)
      .eq('farmer_id', farmerId)
      .maybeSingle();
    if (membershipError || !membership) throw new RequestError(404, 'کشاورز این چاه یافت نشد.');
    const member = membership as unknown as {
      id: string;
      display_name: string;
      profiles: { phone: string; full_name: string; is_active: boolean };
    };
    if (!member.profiles?.is_active) throw new RequestError(403, 'حساب کشاورز غیرفعال است.');
    const { data: year, error: yearError } = await admin
      .from('water_years')
      .select('hours_per_share')
      .eq('id', waterYearId)
      .eq('well_id', wellId)
      .maybeSingle();
    const { data: allocation, error: allocationError } = await admin
      .from('water_allocations')
      .select('allocated_hours')
      .eq('well_farmer_id', member.id)
      .eq('water_year_id', waterYearId)
      .maybeSingle();
    if (yearError || !year || allocationError || !allocation)
      throw new RequestError(404, 'سهمیه یا سال آبی یافت نشد.');
    const receptor = normalizeIranianMobile(member.profiles.phone);
    if (!receptor) throw new RequestError(400, 'شماره موبایل معتبر نیست.');
    const farmerName = member.display_name || member.profiles.full_name;
    const wellName = well.name;
    const allocatedHours = Number(allocation.allocated_hours);
    const hoursPerShare = year.hours_per_share === null ? null : Number(year.hours_per_share);
    const sender = configuredSender;

    const includeHoursPerShare =
      body.includeHoursPerShare !== false && String(body.includeHoursPerShare) !== 'false';

    // Format numbers to Persian digits for clean SMS presentation
    const toPersianDigits = (val: number | string): string =>
      String(val).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)] ?? d);

    // User requested format:
    // کشاورز گرامی
    // سهمیه امسال شما در چاه ..... ثبت شد :  ۱۴۰ ساعت
    // هرساعت مالکیت مساوی با ۱۶ ساعت
    // سامانه اودار
    const wellDisplay = wellName ? ` ${wellName}` : '';
    const messageLines = [
      'کشاورز گرامی',
      `سهمیه امسال شما در چاه${wellDisplay} ثبت شد :  ${toPersianDigits(allocatedHours)} ساعت`,
    ];

    if (includeHoursPerShare && hoursPerShare !== null && !isNaN(hoursPerShare)) {
      messageLines.push(`هرساعت مالکیت مساوی با ${toPersianDigits(hoursPerShare)} ساعت`);
    }

    messageLines.push('سامانه اودار');

    const message = messageLines.join('\n');

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
      console.error('Kavenegar Quota SMS send failed', {
        httpStatus: response.status,
        kavenegarStatus: status,
        message: kavenegarData?.return?.message,
      });
      return jsonResponse(
        {
          error: `خطا در ارسال پیامک سهمیه: ${kavenegarData?.return?.message || 'خطای نامشخص سرویس پیامک'}`,
          kavenegarStatus: status,
        },
        502,
      );
    }

    const entry = kavenegarData?.entries?.[0];
    const entryStatus = entry?.status;

    if (entryStatus === 14) {
      return jsonResponse(
        {
          success: false,
          blocked: true,
          error: 'پیامک ارسال نشد: شماره گیرنده در لیست سیاه تبلیغاتی مخابرات قرار دارد.',
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
          error: 'پیامک توسط اپراتور لغو شد (احتمالاً به دلیل قرار داشتن خط گیرنده در بلک‌لیست).',
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
          recipient_name: farmerName || 'کشاورز',
          message_id: messageId,
          description: `پیامک تخصیص سهمیه آب سالانه (${allocatedHours} ساعت) به ${farmerName || 'کشاورز'}`,
        });

        if (expenseError) {
          console.error('Failed to record well expense for quota SMS:', expenseError);
        } else {
          expenseRecorded = true;
        }
      } catch (expErr) {
        console.error('Error inserting well expense:', expErr);
      }
    }

    return jsonResponse({
      success: true,
      message: 'پیامک تخصیص سهمیه آب با موفقیت به کشاورز ارسال شد.',
      messageId: entry?.messageid,
      cost,
      expenseRecorded,
      entry,
      smsText: message,
    });
  } catch (err: unknown) {
    if (err instanceof RequestError) return jsonResponse({ error: err.message }, err.status);
    console.error('Error processing send-quota-sms', err);
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'خطای ناشناخته در ارسال پیامک',
      },
      500,
    );
  }
});
