import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { authorizeWell, requestBody, requireId, RequestError } from '../_shared/authorization.ts';
import { transferMessage } from './message.ts';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
function normalizePhone(phone: string): string | null {
  const compact = phone.replace(/[\s\-()]/g, '');
  let local = compact;
  if (compact.startsWith('+98')) local = `0${compact.slice(3)}`;
  else if (compact.startsWith('0098')) local = `0${compact.slice(4)}`;
  else if (/^98\d{10}$/.test(compact)) local = `0${compact.slice(2)}`;
  else if (/^9\d{9}$/.test(compact)) local = `0${compact}`;
  return /^09\d{9}$/.test(local) ? local : null;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = Deno.env.get('KAVENEGAR_API_KEY')?.trim();
    if (!url || !key || !apiKey) throw new Error('سرویس پیامک در دسترس نیست.');
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = requireId(requestBody(await req.json()).transferId);
    const { data: transfer, error } = await admin.from('water_transfers').select('id, water_year_id, from_well_farmer_id, to_well_farmer_id, hours, kind, created_at, water_years(well_id)').eq('id', id).maybeSingle();
    if (error || !transfer) throw new RequestError(404, 'انتقال یافت نشد.');
    const year = transfer.water_years as unknown as { well_id: string };
    await authorizeWell(req, admin, year.well_id);
    const ids = [transfer.from_well_farmer_id, transfer.to_well_farmer_id];
    const { data: farmers, error: farmerError } = await admin.from('well_farmers').select('id, well_id, display_name, profiles(phone, full_name, is_active)').in('id', ids);
    if (farmerError || !farmers || farmers.length !== 2) throw new Error('اطلاعات کشاورزان یافت نشد.');
    const { data: allocations, error: allocationError } = await admin.from('water_allocations')
      .select('well_farmer_id, allocated_hours, water_usages(consumed_hours)')
      .eq('water_year_id', transfer.water_year_id).in('well_farmer_id', ids);
    if (allocationError || !allocations || allocations.length !== 2) throw new Error('مانده سهمیه کشاورزان یافت نشد.');
    const balances = new Map(allocations.map(allocation => [allocation.well_farmer_id,
      Math.max(0, Number(allocation.allocated_hours) - allocation.water_usages.reduce((sum, usage) => sum + Number(usage.consumed_hours), 0)),
    ]));
    const date = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }).format(new Date(transfer.created_at));
    const results = await Promise.all(farmers.map(async farmer => {
      const profile = farmer.profiles as unknown as { phone: string; full_name: string; is_active: boolean } | null;
      const phone = profile?.phone ? normalizePhone(profile.phone) : null;
      if (farmer.well_id !== year.well_id || !profile?.is_active || !phone) return false;
      const outgoing = farmer.id === transfer.from_well_farmer_id;
      const remaining = balances.get(farmer.id);
      if (remaining === undefined) return false;
      const message = transferMessage(outgoing, Number(transfer.hours), remaining, transfer.kind, date);
      const form = new URLSearchParams({ receptor: phone, message });
      const sender = Deno.env.get('KAVENEGAR_SENDER')?.trim();
      if (sender) form.set('sender', sender);
      try {
        const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`, { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
        const result = await response.json();
        const entry = result.entries?.[0];
        if (!response.ok || ![200, 201].includes(result.return?.status) || !entry || ![1, 4, 5, 10].includes(entry.status)) return false;
        await admin.from('well_expenses').insert({ well_id: year.well_id, title: 'هزینه سرویس پیامکی', cost: Number(entry.cost || 0), expense_type: 'sms', recipient_phone: phone, recipient_name: farmer.display_name || profile.full_name, message_id: entry.messageid ? String(entry.messageid) : null, description: 'پیامک انتقال سهمیه آب' });
        return true;
      } catch { return false; }
    }));
    return json({ success: results.every(Boolean), sent: results.filter(Boolean).length });
  } catch (err: unknown) {
    if (err instanceof RequestError) return json({ error: err.message }, err.status);
    console.error('Transfer SMS failed', err);
    return json({ error: 'ارسال پیامک انتقال ناموفق بود.' }, 500);
  }
});
