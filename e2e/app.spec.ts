import { expect, Page, test } from '@playwright/test';
import axe from 'axe-core';

async function audit(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{
            violations: { id: string; nodes: { html: string }[] }[];
          }>;
        };
      }
    ).axe.run();
    return result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.html),
    }));
  });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function mockAdminBackend(page: Page) {
  const now = new Date().toISOString();
  const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${jwtPart({ alg: 'none', typ: 'JWT' })}.${jwtPart({
    sub: 'admin-id',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.signature`;
  const user = {
    id: 'admin-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@example.com',
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
  };

  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user,
      }),
    }),
  );
  await page.route('**/rest/v1/profiles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: user.id,
        full_name: 'مدیر سامانه',
        phone: '',
        role: 'admin',
        is_active: true,
      }),
    }),
  );
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('admin authentication', () => {
  test.use({ serviceWorkers: 'block' });

  test('admin login form is RTL, accessible and validates locally', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'ورود مدیر سامانه' })).toBeFocused();
    await expect(page.getByLabel('ایمیل')).toBeVisible();
    await expect(page.getByLabel('رمز عبور')).toBeVisible();
    await audit(page);
    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'ایمیل و رمز عبور را کامل و صحیح وارد کنید.',
    );
  });

  test('invalid Supabase credentials show only the generic Persian error', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      }),
    );
    await page.goto('/login');
    await page.getByLabel('ایمیل').fill('admin@example.com');
    await page.getByLabel('رمز عبور').fill('wrong-password');
    await page.getByRole('button', { name: 'ورود' }).click();

    await expect(page.getByRole('alert')).toHaveText('ایمیل یا رمز عبور صحیح نیست.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('active admin session survives reload and logout returns to login', async ({ page }) => {
    await mockAdminBackend(page);
    await page.goto('/login');
    await page.getByLabel('ایمیل').fill('admin@example.com');
    await page.getByLabel('رمز عبور').fill('correct-password');
    await page.getByRole('button', { name: 'ورود' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'مدیریت سامانه' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'مدیریت سامانه' })).toBeVisible();
    await audit(page);

    await page.getByRole('button', { name: 'خروج' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('anonymous visitors cannot open the admin route', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'ورود مدیر سامانه' })).toBeVisible();
  });
});

test('PWA manifest and offline app shell', async ({ page, context }) => {
  await page.goto('/login');
  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return (await response.json()) as {
      name: string;
      short_name: string;
      lang: string;
      dir: string;
      start_url: string;
      icons: unknown[];
    };
  });
  expect(manifest).toMatchObject({
    name: 'اُدار | مدیریت سهم آب',
    short_name: 'اُدار',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/login',
  });
  expect(manifest.icons).toHaveLength(8);

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'ورود مدیر سامانه' })).toBeVisible();
  await context.setOffline(false);
});
