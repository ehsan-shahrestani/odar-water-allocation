import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as authorization from './authorization';
import * as kavenegar from '../send-sms-kavenegar/kavenegar';

const repId = '11111111-1111-4111-8111-111111111111';
const wellId = '22222222-2222-4222-8222-222222222222';
const farmerId = '33333333-3333-4333-8333-333333333333';
const yearId = '44444444-4444-4444-8444-444444444444';
function load(slug: string, db: object, provider = vi.fn()) {
  let handler: (request: Request) => Promise<Response> = async () => {
    throw new Error('No handler');
  };
  const source = readFileSync(resolve('supabase/functions', slug, 'index.ts'), 'utf8')
    .replace(/^import ['"]jsr:[^\n]+\n/gm, '')
    .replace(/^import \{ createClient \} from ['"]https:[^\n]+\n/gm, '');
  const code = transpileModule(source, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.CommonJS },
  }).outputText;
  const requireMock = (name: string) => {
    if (name.includes('authorization')) return authorization;
    if (name.includes('kavenegar.ts')) return kavenegar;
    throw new Error('Unexpected dependency: ' + name);
  };
  const deno = {
    env: { get: () => 'mock-value' },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  };
  new Function('Deno', 'createClient', 'fetch', 'require', 'exports', code)(
    deno,
    () => db,
    provider,
    requireMock,
    {},
  );
  return {
    invoke: (body: object, authenticated = true) =>
      handler(
        new Request('https://example.test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authenticated ? { Authorization: 'Bearer mock-token' } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    provider,
  };
}
function database(
  role = 'representative',
  active = true,
  owner = repId,
  verification = 'verified',
) {
  const from = vi.fn((table: string) => {
    const fixtures: Record<string, unknown> = {
      profiles: { id: repId, full_name: 'Test', phone: '09152404098', role, is_active: active },
      wells: { id: wellId, representative_id: owner, name: 'Stored well' },
      well_farmers: {
        id: farmerId,
        display_name: 'Stored farmer',
        profiles: { phone: '09905913852', full_name: 'Farmer', is_active: true },
      },
      water_years: { hours_per_share: 12 },
      water_allocations: { allocated_hours: 120 },
    };
    const query: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'or',
      'gt',
      'is',
      'order',
      'limit',
      'insert',
      'delete',
      'update',
    ])
      query[method] = vi.fn(() => query);
    query['maybeSingle'] = vi.fn(async () => ({ data: fixtures[table] ?? null, error: null }));
    query['single'] = query['maybeSingle'];
    query['then'] = (resolve: (value: object) => void) => resolve({ data: null, error: null });
    return query;
  });
  const signIn = vi.fn(async () => ({ data: { session: { access_token: 'mock-session' } } }));
  return {
    from,
    rpc: vi.fn(async () => ({
      data: verification,
      error: verification === 'db-error' ? { message: 'failed' } : null,
    })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: repId } }, error: null })),
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: { id: repId } } })),
        updateUserById: vi.fn(async () => ({ error: null })),
      },
      signInWithPassword: signIn,
    },
    signIn,
  };
}
describe('Function security regressions (provider is always mocked)', () => {
  for (const slug of ['send-representative-sms', 'send-quota-sms', 'send-usage-sms']) {
    it(`${slug} rejects unauthenticated requests without sending`, async () => {
      const fn = load(slug, database());
      expect((await fn.invoke({}, false)).status).toBe(401);
      expect(fn.provider).not.toHaveBeenCalled();
    });
    it(`${slug} rejects farmer accounts without sending`, async () => {
      const fn = load(slug, database('farmer'));
      expect((await fn.invoke({})).status).toBe(403);
      expect(fn.provider).not.toHaveBeenCalled();
    });
  }
  it('usage SMS does not expose provider diagnostics', async () => {
    const fn = load('send-usage-sms', database());
    expect((await fn.invoke({ getOutbox: true })).status).toBe(403);
    expect(fn.provider).not.toHaveBeenCalled();
  });
  it('quota SMS rejects another well and ignores a caller-supplied recipient or quota', async () => {
    const forbidden = load('send-quota-sms', database('representative', true, 'another-rep'));
    expect((await forbidden.invoke({ wellId, farmerId, waterYearId: yearId })).status).toBe(403);
    expect(forbidden.provider).not.toHaveBeenCalled();
    const provider = vi.fn(async (_url: string, _options: RequestInit) =>
      Response.json({ return: { status: 200 }, entries: [{ status: 5, messageid: 1, cost: 10 }] }),
    );
    const allowed = load('send-quota-sms', database(), provider);
    expect(
      (
        await allowed.invoke({
          wellId,
          farmerId,
          waterYearId: yearId,
          farmerPhone: '09152404098',
          allocatedHours: 9999,
        })
      ).status,
    ).toBe(200);
    const form = provider.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(form.get('receptor')).toBe('09905913852');
    expect(form.get('message')).toContain('۱۲۰');
    expect(form.get('message')).not.toContain('۹۹۹۹');
  });
  for (const outcome of ['locked', 'used', 'expired', 'db-error']) {
    it(`client OTP ${outcome} never creates an auth session`, async () => {
      const db = database('representative', true, repId, outcome);
      const fn = load('client-otp', db);
      const result = await fn.invoke(
        { action: 'verify', phone: '09152404098', code: '1234' },
        false,
      );
      expect((await result.json()).success).not.toBe(true);
      expect(db.signIn).not.toHaveBeenCalled();
      expect(db.auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(fn.provider).not.toHaveBeenCalled();
    });
  }
});
