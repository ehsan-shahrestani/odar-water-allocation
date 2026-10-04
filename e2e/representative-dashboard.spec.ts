import { expect, Page, test } from '@playwright/test';
import axe from 'axe-core';

test.use({ serviceWorkers: 'block' });

async function mockRepresentative(page: Page) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const user = {
    id: 'rep-id',
    aud: 'authenticated',
    role: 'authenticated',
    phone: '989152404098',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: expiresAt })}.signature`,
    refresh_token: 'mock-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  };
  await page.addInitScript((value) => {
    localStorage.setItem('odar-client-auth-v1', JSON.stringify(value));
  }, session);
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: route.request().url().includes('/logout') ? 204 : 200,
      contentType: 'application/json',
      body: route.request().url().includes('/logout') ? '' : JSON.stringify(user),
    }),
  );
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const year = {
      id: 'year-id',
      description: '۱۴۰۵–۱۴۰۶',
      start_date: '2026-09-23',
      end_date: '2027-09-22',
      hours_per_share: 12,
    };
    const fixtures: Record<string, unknown> = {
      profiles: {
        id: user.id,
        full_name: 'احسان محمدی',
        phone: '09152404098',
        role: 'representative',
        is_active: true,
      },
      wells: { id: 'well-id', name: 'چاه دشت اُدار', description: '' },
      water_years: url.searchParams.has('limit') ? year : [year],
      well_farmers: [
        {
          id: 'wf-id',
          farmer_id: 'farmer-id',
          display_name: 'علی رضایی',
          profiles: { id: 'farmer-id', full_name: 'علی رضایی', phone: '09905913852' },
        },
      ],
      water_allocations: { id: 'allocation-id', allocated_hours: 120 },
      water_usages: [{ consumed_hours: 30 }],
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures[table || ''] ?? []),
    });
  });
  // No SMS or writes are allowed in these UI checks.
  await page.route('**/functions/v1/**', (route) => route.abort());
}

async function audit(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: () => Promise<{
            violations: { id: string; nodes: { html: string; failureSummary: string }[] }[];
          }>;
        };
      }
    ).axe.run();
    return result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ html, failureSummary }) => ({ html, failureSummary })),
    }));
  });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [360, 390, 1280]) {
  test(`representative dashboard and confirmed logout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockRepresentative(page);
    let logoutRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/logout')) logoutRequests++;
    });
    await page.goto('/representative');
    await expect(page.getByRole('heading', { name: 'چاه دشت اُدار' })).toBeVisible();
    await expect(page.locator('.representative-name')).toContainText('احسان محمدی');
    await expect(page.locator('.stat-num')).toHaveText(['۱', '۱۲۰', '۳۰', '۹۰']);
    await expect(page.getByText('بیشترین سهم مصرف')).toHaveCount(0);
    await expect(page.locator('.mobile-bottom-nav').getByText('خروج')).toHaveCount(0);
    await audit(page);
    await page.screenshot({ path: `/tmp/representative-dashboard-${width}.png`, fullPage: true });
    if (width < 768) {
      const actions = await page.locator('.quick-actions-grid').boundingBox();
      const navigation = await page.locator('.mobile-bottom-nav').boundingBox();
      if (!actions || !navigation) throw new Error('Dashboard controls are missing');
      expect(actions.y + actions.height).toBeLessThanOrEqual(navigation.y);
    }

    await page.getByRole('button', { name: 'افزودن کشاورز' }).click();
    await expect(page.getByRole('dialog', { name: 'افزودن کشاورز به چاه' })).toBeVisible();
    await page.getByRole('button', { name: 'بستن', exact: true }).click();
    await page.getByRole('button', { name: 'ثبت آبیاری جدید' }).click();
    await expect(page.getByRole('dialog', { name: 'ثبت کارکرد آب' })).toBeVisible();
    await page.getByRole('button', { name: 'بستن', exact: true }).click();

    const trigger = page.locator('.logout-trigger:visible');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'تأیید خروج از حساب' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused();
    await audit(page);
    await dialog.getByRole('button', { name: 'انصراف' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(logoutRequests).toBe(0);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    expect(logoutRequests).toBe(0);
    await trigger.click();
    await dialog.getByRole('button', { name: 'خروج از حساب', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(logoutRequests).toBe(1);
  });
}
