import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
export function requestBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(400, 'بدنه درخواست معتبر نیست.');
  }
  return value as Record<string, unknown>;
}
export function requireId(value: unknown): string {
  const id = readString(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new RequestError(400, 'شناسه نامعتبر است.');
  }
  return id;
}
export async function authorizeCaller(req: Request, admin: SupabaseClient, adminOnly = false) {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RequestError(401, 'ابتدا وارد حساب خود شوید.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new RequestError(401, 'نشست کاربری معتبر نیست.');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile?.is_active ||
    !['admin', 'representative'].includes(profile.role) ||
    (adminOnly && profile.role !== 'admin')
  ) {
    throw new RequestError(403, 'شما اجازه انجام این عملیات را ندارید.');
  }
  if (profile.role === 'admin') {
    let sessionId: string;
    try {
      const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(
        atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '=')),
      ) as Record<string, unknown>;
      sessionId = requireId(claims['session_id']);
    } catch {
      throw new RequestError(401, 'نشست کاربری معتبر نیست.');
    }
    const { data: proof, error: proofError } = await admin
      .from('admin_mfa_sessions')
      .select('session_id')
      .eq('user_id', profile.id)
      .eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (proofError || !proof) throw new RequestError(403, 'مرحله دوم ورود مدیر را تکمیل کنید.');
  }
  return profile as { id: string; role: 'admin' | 'representative'; is_active: boolean };
}
export async function authorizeWell(
  req: Request,
  admin: SupabaseClient,
  wellId: string,
  adminOnly = false,
) {
  const caller = await authorizeCaller(req, admin, adminOnly);
  const { data: well, error } = await admin
    .from('wells')
    .select('id, name, representative_id')
    .eq('id', wellId)
    .maybeSingle();
  if (error || !well) throw new RequestError(404, 'چاه یافت نشد.');
  if (caller.role !== 'admin' && well.representative_id !== caller.id) {
    throw new RequestError(403, 'شما نماینده این چاه نیستید.');
  }
  return { caller, well: well as { id: string; name: string; representative_id: string | null } };
}
