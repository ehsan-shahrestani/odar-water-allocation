import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { maskIranianMobile, normalizeIranianMobile, phoneStorageVariants } from './farmer-input.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  wellId?: unknown;
  waterYearId?: unknown;
  displayName?: unknown;
  phone?: unknown;
  allocatedHours?: unknown;
}

interface FarmerProfile {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
}

interface CallerProfile {
  id: string;
  role: string;
  is_active: boolean;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const hours = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(hours) ? hours : Number.NaN;
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get('Authorization')?.trim() ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function databaseErrorMessage(message: string): { status: number; message: string } {
  if (message.includes('well_farmer_unique') || message.includes('duplicate key')) {
    return { status: 409, message: 'این کشاورز قبلاً به همین چاه افزوده شده است.' };
  }
  if (message.includes('water_year_does_not_belong_to_well')) {
    return { status: 400, message: 'سال آبی انتخاب‌شده متعلق به این چاه نیست.' };
  }
  if (message.includes('invalid_farmer_profile')) {
    return { status: 400, message: 'پروفایل کشاورز معتبر یا فعال نیست.' };
  }
  return { status: 500, message: 'ثبت کشاورز در چاه انجام نشد.' };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: JSON_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('representative-add-farmer configuration missing');
    return jsonResponse({ error: 'تنظیمات سرویس افزودن کشاورز کامل نیست.' }, 500);
  }

  const accessToken = bearerToken(req);
  if (!accessToken) {
    return jsonResponse({ error: 'برای افزودن کشاورز باید وارد حساب نماینده شوید.' }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'بدنه درخواست معتبر نیست.' }, 400);
  }

  const wellId = readTrimmedString(body.wellId);
  const waterYearId = readTrimmedString(body.waterYearId) || null;
  const displayName = readTrimmedString(body.displayName);
  const phone = normalizeIranianMobile(readTrimmedString(body.phone));
  const allocatedHours = readOptionalHours(body.allocatedHours);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(wellId)) {
    return jsonResponse({ error: 'شناسه چاه نامعتبر است.' }, 400);
  }
  if (
    waterYearId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(waterYearId)
  ) {
    return jsonResponse({ error: 'شناسه سال آبی نامعتبر است.' }, 400);
  }
  if (!displayName || displayName.length > 120) {
    return jsonResponse({ error: 'نام کشاورز باید بین ۱ تا ۱۲۰ نویسه باشد.' }, 400);
  }
  if (!phone) {
    return jsonResponse({ error: 'شماره موبایل کشاورز نامعتبر است.' }, 400);
  }
  if (Number.isNaN(allocatedHours) || (allocatedHours !== null && allocatedHours < 0)) {
    return jsonResponse({ error: 'سهمیه اولیه نمی‌تواند منفی یا نامعتبر باشد.' }, 400);
  }
  if (allocatedHours !== null && !waterYearId) {
    return jsonResponse({ error: 'برای ثبت سهمیه، ابتدا باید سال آبی تعریف شود.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userResult.user) {
      return jsonResponse({ error: 'نشست کاربری معتبر نیست؛ لطفاً دوباره وارد شوید.' }, 401);
    }

    const callerId = userResult.user.id;
    const { data: caller, error: callerError } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', callerId)
      .maybeSingle<CallerProfile>();

    if (callerError || !caller?.is_active || !['representative', 'admin'].includes(caller.role)) {
      return jsonResponse({ error: 'شما اجازه افزودن کشاورز ندارید.' }, 403);
    }

    const { data: well, error: wellError } = await admin
      .from('wells')
      .select('id, representative_id')
      .eq('id', wellId)
      .maybeSingle<{ id: string; representative_id: string | null }>();

    if (wellError || !well) {
      return jsonResponse({ error: 'چاه مورد نظر یافت نشد.' }, 404);
    }
    if (caller.role === 'representative' && well.representative_id !== callerId) {
      return jsonResponse({ error: 'شما نماینده این چاه نیستید.' }, 403);
    }

    let { data: matchingProfiles, error: profileSearchError } = await admin
      .from('profiles')
      .select('id, full_name, phone, role, is_active')
      .in('phone', phoneStorageVariants(phone))
      .limit(2);

    if (profileSearchError) {
      console.error('representative-add-farmer profile lookup failed', {
        code: profileSearchError.code,
        phone: maskIranianMobile(phone),
      });
      return jsonResponse({ error: 'بررسی حساب کشاورز انجام نشد.' }, 500);
    }

    if (!matchingProfiles || matchingProfiles.length === 0) {
      const normalizedPhone10 = phone.slice(-10);
      const { data: fallbackProfiles } = await admin
        .from('profiles')
        .select('id, full_name, phone, role, is_active')
        .like('phone', `%${normalizedPhone10}`)
        .limit(2);
      if (fallbackProfiles && fallbackProfiles.length === 1) {
        matchingProfiles = fallbackProfiles;
      }
    }

    if ((matchingProfiles?.length ?? 0) > 1) {
      console.error('representative-add-farmer duplicate normalized profiles', {
        phone: maskIranianMobile(phone),
        count: matchingProfiles?.length,
      });
      return jsonResponse(
        { error: 'برای این شماره بیش از یک حساب یافت شد؛ با مدیر تماس بگیرید.' },
        409,
      );
    }

    let farmer = matchingProfiles?.[0] as FarmerProfile | undefined;
    if (farmer && !farmer.is_active) {
      // Reactivate profile if it was inactive
      await admin.from('profiles').update({ is_active: true }).eq('id', farmer.id);
      farmer.is_active = true;
    }

    let farmerId = farmer?.id ?? '';
    let createdUser = false;
    let authUserExists = false;

    if (farmer) {
      const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(
        farmer.id,
      );
      if (!existingAuthError && existingAuth.user) {
        authUserExists = true;
      } else {
        const status = (existingAuthError as { status?: number } | null)?.status;
        if (status && status !== 404) {
          console.error('representative-add-farmer auth lookup failed', { status });
          return jsonResponse({ error: 'بررسی حساب ورود کشاورز انجام نشد.' }, 502);
        }
      }
    }

    if (!farmer || !authUserExists) {
      const e164Phone = `+98${phone.slice(1)}`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        phone: e164Phone,
        phone_confirm: true,
        user_metadata: { full_name: displayName },
      });

      if (createError || !created.user) {
        const isAlreadyRegistered =
          createError?.message?.toLowerCase().includes('already') ||
          (createError as { status?: number } | null)?.status === 422;

        if (isAlreadyRegistered) {
          console.info('representative-add-farmer user already registered, fetching list', {
            phone: maskIranianMobile(phone),
          });
          const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
          const existingAuthUser = listData?.users?.find(
            (u) =>
              u.phone === e164Phone ||
              u.phone === phone ||
              (u.phone && u.phone.endsWith(phone.slice(-10))),
          );

          if (existingAuthUser) {
            farmerId = existingAuthUser.id;
            const { data: ensuredProfile } = await admin
              .from('profiles')
              .upsert(
                {
                  id: farmerId,
                  phone: phone,
                  full_name: displayName,
                  role: 'farmer',
                  is_active: true,
                },
                { onConflict: 'id' },
              )
              .select('id, full_name, phone, role, is_active')
              .single();

            if (ensuredProfile) {
              farmer = ensuredProfile;
            }
          } else {
            return jsonResponse(
              { error: 'ساخت حساب ورود کشاورز انجام نشد یا این شماره قبلاً ثبت شده است.' },
              409,
            );
          }
        } else {
          console.error('representative-add-farmer auth creation failed', {
            status: (createError as { status?: number } | null)?.status,
            message: createError?.message,
            phone: maskIranianMobile(phone),
          });
          return jsonResponse(
            { error: 'ساخت حساب ورود کشاورز انجام نشد یا این شماره قبلاً ثبت شده است.' },
            409,
          );
        }
      } else {
        farmerId = created.user.id;
        createdUser = true;

        const { data: createdProfile, error: createdProfileError } = await admin
          .from('profiles')
          .select('id, full_name, phone, role, is_active')
          .eq('id', farmerId)
          .maybeSingle<FarmerProfile>();

        if (createdProfileError || !createdProfile) {
          const { data: manualProfile } = await admin
            .from('profiles')
            .upsert(
              {
                id: farmerId,
                phone: phone,
                full_name: displayName,
                role: 'farmer',
                is_active: true,
              },
              { onConflict: 'id' },
            )
            .select('id, full_name, phone, role, is_active')
            .maybeSingle<FarmerProfile>();

          farmer = manualProfile ?? undefined;
        } else {
          farmer = createdProfile;
        }
      }
    }

    const { data: attachment, error: attachmentError } = await admin.rpc('attach_farmer_to_well', {
      p_well_id: wellId,
      p_farmer_id: farmerId,
      p_display_name: displayName,
      p_water_year_id: waterYearId,
      p_allocated_hours: allocatedHours,
    });

    if (attachmentError || !attachment?.[0]) {
      const mapped = databaseErrorMessage(attachmentError?.message ?? 'unknown');
      console.error('representative-add-farmer attachment failed', {
        code: attachmentError?.code,
        message: attachmentError?.message,
        wellId,
        userId: callerId,
        phone: maskIranianMobile(phone),
      });
      return jsonResponse({ error: mapped.message }, mapped.status);
    }

    // Send Welcome SMS when user was newly created for the first time
    let welcomeSmsSent = false;
    if (createdUser) {
      const apiKey = Deno.env.get('KAVENEGAR_API_KEY')?.trim();
      const configuredSender = Deno.env.get('KAVENEGAR_SENDER')?.trim();

      if (apiKey) {
        const welcomeText = 'پنل کاربری شما در اودار ایجاد شد\nodar.ir';
        try {
          const form = new URLSearchParams({
            receptor: phone,
            message: welcomeText,
          });
          if (configuredSender) {
            form.set('sender', configuredSender);
          }

          const kavenegarResponse = await fetch(
            `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: form,
              signal: AbortSignal.timeout(10_000),
            },
          );

          if (kavenegarResponse.ok) {
            const kavenegarData = await kavenegarResponse.json();
            const entry = kavenegarData?.entries?.[0];
            const cost = typeof entry?.cost === 'number' ? entry.cost : Number(entry?.cost || 0);
            const messageId = entry?.messageid ? String(entry.messageid) : null;
            welcomeSmsSent = true;

            // Record expense in well_expenses if possible
            if (wellId && supabaseUrl && serviceRoleKey) {
              await admin.from('well_expenses').insert({
                well_id: wellId,
                title: 'هزینه سرویس پیامکی',
                cost: cost,
                expense_type: 'sms',
                recipient_phone: phone,
                recipient_name: displayName,
                message_id: messageId,
                description: `پیامک ایجاد حساب کاربری کشاورز برای ${displayName}`,
              });
            }
          } else {
            console.warn('Welcome SMS send failed with status:', kavenegarResponse.status);
          }
        } catch (smsErr) {
          console.error('Welcome SMS delivery error:', smsErr);
        }
      }
    }

    console.info('representative-add-farmer succeeded', {
      wellId,
      userId: callerId,
      farmerId,
      phone: maskIranianMobile(phone),
      createdUser,
      welcomeSmsSent,
      allocationCreated: Boolean(attachment[0].allocation_id),
    });

    return jsonResponse({
      success: true,
      farmerId,
      wellFarmerId: attachment[0].well_farmer_id,
      allocationId: attachment[0].allocation_id,
      phone,
      displayName,
      createdUser,
      welcomeSmsSent,
    });
  } catch (error: unknown) {
    console.error('representative-add-farmer unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
      wellId,
      phone: maskIranianMobile(phone),
    });
    return jsonResponse({ error: 'خطای پیش‌بینی‌نشده در افزودن کشاورز رخ داد.' }, 500);
  }
});
