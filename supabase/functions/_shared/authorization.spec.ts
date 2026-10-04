import { describe, expect, it, vi } from 'vitest';
import { authorizeCaller, authorizeWell } from './authorization';

const repId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;
const request = () =>
  new Request('https://example.test', { headers: { Authorization: `Bearer ${token}` } });
function client(role = 'representative', active = true, owner = repId, mfa = true, valid = true) {
  const getUser = vi.fn(async () => ({
    data: { user: valid ? { id: repId } : null },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    const value =
      table === 'profiles'
        ? { id: repId, role, is_active: active }
        : table === 'wells'
          ? { id: 'well', name: 'Well', representative_id: owner }
          : mfa
            ? { session_id: sessionId }
            : null;
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: value, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gt.mockReturnValue(query);
    return query;
  });
  return { auth: { getUser }, from } as unknown as Parameters<typeof authorizeCaller>[1];
}
describe('Privileged function authorization', () => {
  it('rejects unauthenticated calls before accessing the database', async () => {
    const db = client();
    await expect(authorizeCaller(new Request('https://example.test'), db)).rejects.toMatchObject({
      status: 401,
    });
    expect(db.from).not.toHaveBeenCalled();
  });
  it('rejects invalid tokens, farmer accounts and inactive representatives', async () => {
    await expect(
      authorizeCaller(request(), client('representative', true, repId, true, false)),
    ).rejects.toMatchObject({ status: 401 });
    await expect(authorizeCaller(request(), client('farmer'))).rejects.toMatchObject({
      status: 403,
    });
    await expect(authorizeCaller(request(), client('representative', false))).rejects.toMatchObject(
      { status: 403 },
    );
  });
  it('rejects another well and permits the assigned representative', async () => {
    await expect(
      authorizeWell(request(), client('representative', true, 'other'), 'well'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(authorizeWell(request(), client(), 'well')).resolves.toMatchObject({
      well: { representative_id: repId },
    });
  });
  it('requires an admin and the MFA proof attached to the current session', async () => {
    await expect(authorizeWell(request(), client(), 'well', true)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      authorizeWell(request(), client('admin', true, 'other', false), 'well', true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeWell(request(), client('admin', true, 'other'), 'well', true),
    ).resolves.toMatchObject({ caller: { role: 'admin' } });
  });
});
