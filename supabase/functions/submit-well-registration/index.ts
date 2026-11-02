import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : { success: true }), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return respond(405, 'درخواست نامعتبر است.');
  try {
    const raw = await req.text();
    if (raw.length > 8192) return respond(400, 'اطلاعات نامعتبر است.');
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond(400, 'اطلاعات نامعتبر است.');
    const data = body as Record<string, unknown>;
    const name = typeof data.fullName === 'string' ? data.fullName.trim() : '';
    const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
    const well = typeof data.wellName === 'string' ? data.wellName.trim() : '';
    const count = data.farmerCount;
    const token = typeof data.captchaToken === 'string' ? data.captchaToken : '';
    if (name.length < 2 || name.length > 120 || well.length < 2 || well.length > 120 || !/^09\d{9}$/.test(phone) || typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 100000 || !token || token.length > 4096) return respond(400, 'اطلاعات فرم یا تأیید امنیتی معتبر نیست.');
    const siteKey = Deno.env.get('ARCAPTCHA_SITE_KEY');
    const secret = Deno.env.get('ARCAPTCHA_SECRET_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!siteKey || !secret || !url || !key) throw new Error('Service configuration missing');
    const verification = await fetch('https://api.arcaptcha.ir/arcaptcha/api/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_key: siteKey, secret_key: secret, challenge_id: token }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await verification.json();
    if (!verification.ok || result.success !== true) return respond(400, 'تأیید امنیتی ناموفق بود. دوباره تلاش کنید.');
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from('well_registration_requests').insert({ full_name: name, phone, well_name: well, farmer_count: count });
    if (error) throw error;
    return respond(200);
  } catch {
    return respond(500, 'ثبت درخواست انجام نشد. دوباره تلاش کنید.');
  }
});
