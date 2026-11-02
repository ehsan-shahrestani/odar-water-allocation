import { expect, Page, test } from '@playwright/test';
import axe from 'axe-core';

test.use({ serviceWorkers: 'block' });

async function mockRepresentative(page: Page, usedHours = 30) {
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
      well_farmers: url.searchParams.has('limit')
        ? { id: 'wf-id', farmer_id: 'farmer-id', display_name: 'علی رضایی', profiles: { id: 'farmer-id', full_name: 'علی رضایی', phone: '09905913852' } }
        : [{ id: 'wf-id', farmer_id: 'farmer-id', display_name: 'علی رضایی', profiles: { id: 'farmer-id', full_name: 'علی رضایی', phone: '09905913852' } }],
      water_allocations: { id: 'allocation-id', allocated_hours: 120 },
      water_usages: [{ id: 'usage-id', used_at: '2026-10-01T12:00:00Z', consumed_hours: usedHours }],
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
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)));
  });
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
    await expect(page.locator('.stat-num')).toHaveText(['۱', '۱۲۰ ساعت', '۳۰ ساعت', '۹۰ ساعت']);
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


test('brand colors follow the shared theme variables', async ({ page }) => {
  await mockRepresentative(page);
  await page.goto('/representative');
  const action = page.locator('.quick-action-primary');
  await expect(action).toHaveCSS('background-color', 'rgb(8, 99, 63)');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--forest-700', '#245390');
    const sample = document.createElement('span');
    sample.className = 'text-primary bg-brand-soft border-line';
    sample.textContent = 'theme sample';
    document.body.appendChild(sample);
  });
  await expect(action).toHaveCSS('background-color', 'rgb(36, 83, 144)');
  const sample = page.getByText('theme sample');
  await expect(sample).toHaveCSS('color', 'rgb(36, 83, 144)');
  await expect(sample).toHaveCSS('background-color', 'rgb(229, 245, 235)');
  await expect(sample).toHaveCSS('border-top-color', 'rgb(215, 229, 220)');
});

test('water-year and farmer cards use the green theme', async ({ page }) => {
  await mockRepresentative(page);
  await page.goto('/representative/water-years');
  const currentYear = page.locator('.status-badge.active:visible');
  await expect(currentYear).toHaveCSS('background-color', 'rgb(242, 250, 245)');
  await expect(currentYear).toHaveCSS('color', 'rgb(6, 78, 50)');
  await page.goto('/representative/farmers');
  const balance = page.locator('.remaining-tag.positive:visible').first();
  await expect(page.locator('.fmc-balance:visible').first()).toHaveCSS('background-color', 'rgb(242, 250, 245)');
  await expect(balance).toHaveCSS('color', 'rgb(6, 78, 50)');
  const nav = page.getByRole('navigation', { name: 'ناوبری موبایل' });
  await expect(nav.getByRole('link', { name: 'کشاورزان' })).toHaveCSS('color', 'rgb(8, 99, 63)');
  await audit(page);
});


for (const scenario of [
  { hours: 90, label: 'مصرف بالا', barColor: 'rgb(180, 83, 9)' },
  { hours: 110, label: 'نزدیک به پایان', barColor: 'rgb(220, 38, 38)' },
]) {
  test(`mobile quota shows ${scenario.label} with a visible progress bar`, async ({ page }) => {
    await mockRepresentative(page, scenario.hours);
    await page.goto('/representative/farmers');
    const card = page.locator('.farmer-mobile-card:visible').first();
    await expect(card.getByText(scenario.label)).toBeVisible();
    await expect(card.locator('.fmc-bar-fill')).toHaveCSS('background-color', scenario.barColor);
    await audit(page);
  });
}


for (const width of [320, 390]) {
  test(`farmer list supports clear mobile actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockRepresentative(page);
    await page.goto('/representative/farmers');
    const card = page.locator('.farmer-mobile-card:visible').first();
    await expect(card.getByText('علی رضایی')).toBeVisible();
    await expect(card.getByText('باقی‌مانده آب')).toBeVisible();
    for (const control of [
      page.getByRole('button', { name: 'افزودن کشاورز', exact: true }),
      page.getByRole('button', { name: 'ثبت مصرف', exact: true }),
      card.getByRole('button', { name: 'ثبت مصرف برای علی رضایی' }),
      card.getByRole('link', { name: 'مشاهده پرونده علی رضایی' }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    const search = page.getByRole('searchbox', { name: 'جستجوی کشاورزان' });
    await search.fill('ناشناس');
    await expect(page.getByText(/یافت نشد/)).toBeVisible();
    await page.getByRole('button', { name: 'پاک کردن جستجو' }).click();
    await expect(card).toBeVisible();
    const trigger = card.getByRole('button', { name: 'ثبت مصرف برای علی رضایی' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'ثبت کارکرد آب' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'بستن', exact: true })).toBeFocused();
    await expect(dialog.getByLabel('انتخاب کشاورز')).toHaveValue('farmer-id');
    await audit(page);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test('dashboard presents fractional water hours in hours and minutes', async ({ page }) => {
  await mockRepresentative(page, 30.5);
  await page.goto('/representative');
  await expect(page.locator('.stat-num')).toHaveText(['۱', '۱۲۰ ساعت', '۳۰ ساعت و ۳۰ دقیقه', '۸۹ ساعت و ۳۰ دقیقه']);
  await audit(page);
});

test('dashboard and water-year dialogs manage focus and require explicit dates', async ({ page }) => {
  await mockRepresentative(page);
  await page.goto('/representative');
  const usageTrigger = page.getByRole('button', { name: 'ثبت آبیاری جدید' });
  await usageTrigger.click();
  const usage = page.getByRole('dialog', { name: 'ثبت کارکرد آب' });
  await expect(usage.getByRole('button', { name: 'بستن', exact: true })).toBeFocused();
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(usage).not.toBeVisible();
  await expect(usageTrigger).toBeFocused();
  await page.goto('/representative/water-years');
  const yearTrigger = page.getByRole('button', { name: 'تعریف دوره جدید' });
  await yearTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'تعریف دوره جدید سال آبی' });
  await expect(dialog.getByRole('button', { name: 'بستن', exact: true })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'تاریخ شروع' })).toContainText('1404/07/01');
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(yearTrigger).toBeFocused();
});

test('login is readable and rejects an invalid number without sending SMS', async ({ page }) => {
  let requests = 0;
  await page.route('**/functions/v1/**', (route) => { requests++; return route.abort(); });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'ورود به حساب' })).toBeVisible();
  await audit(page);
  await page.getByLabel('شماره موبایل').fill('123');
  await page.getByRole('button', { name: 'دریافت کد تایید پیامکی' }).click();
  await expect(page.getByRole('alert')).toContainText('شماره موبایل معتبر نیست');
  expect(requests).toBe(0);
});


test('farmer detail is accessible and its modal supports keyboard navigation', async ({ page }) => {
  await mockRepresentative(page);
  await page.goto('/representative/farmers/farmer-id');
  await expect(page.getByRole('heading', { name: 'علی رضایی' })).toBeVisible();
  await audit(page);
  const trigger = page.getByRole('button', { name: 'ثبت مصرف آب' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'ثبت مصرف آب' });
  await expect(dialog.getByRole('button', { name: 'بستن', exact: true })).toBeFocused();
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

async function mockFarmer(page: Page) {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const user = { id: 'farmer-id', aud: 'authenticated', role: 'authenticated', phone: '989152404098', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: expiry })}.signature`, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user };
  await page.addInitScript((value) => localStorage.setItem('odar-client-auth-v1', JSON.stringify(value)), session);
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }));
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const fixtures: Record<string, unknown> = {
      profiles: { id: user.id, full_name: 'علی رضایی', phone: '09152404098', role: 'farmer', is_active: true },
      well_farmers: url.searchParams.has('farmer_id')
        ? { id: 'wf-id', well_id: 'well-id', wells: { id: 'well-id', name: 'چاه دشت', description: null } }
        : [{ id: 'wf-id', display_name: 'علی رضایی', profiles: { full_name: 'علی رضایی' } }],
      water_years: { id: 'year-id', description: '۱۴۰۵–۱۴۰۶', start_date: '2026-09-23', end_date: '2027-09-22' },
      water_allocations: { id: 'allocation-id', allocated_hours: 120 },
      water_usages: [{ id: 'usage-id', consumed_hours: 30.5, used_at: '2026-10-01T12:00:00Z', description: null }],
      water_transfers: [],
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[table || ''] ?? []) });
  });
  await page.route('**/functions/v1/**', (route) => route.abort());
}

test('farmer dashboard displays balance and usage accessibly', async ({ page }) => {
  await mockFarmer(page);
  await page.goto('/farmer');
  await expect(page.getByText('۸۹ ساعت و ۳۰ دقیقه')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'گزارش مصرف‌های اخیر' })).toBeVisible();
  await audit(page);
});


test('farmer dashboard reports unavailable data instead of a misleading balance', async ({ page }) => {
  await mockFarmer(page);
  await page.route('**/rest/v1/water_usages**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) }));
  await page.goto('/farmer');
  await expect(page.getByText('دریافت مصرف آب ناموفق بود. دوباره تلاش کنید.').first()).toBeVisible();
  await expect(page.getByText('مانده سهمیه آب شما')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'تلاش مجدد' })).toBeVisible();
});

test('farmer without an allocation sees that quota has not been assigned', async ({ page }) => {
  await mockFarmer(page);
  await page.route('**/rest/v1/water_allocations**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.goto('/farmer');
  await expect(page.getByRole('heading', { name: 'سهمیه آب ثبت نشده است' })).toBeVisible();
  await expect(page.getByText('مانده سهمیه آب شما')).toHaveCount(0);
  await audit(page);
});

test('representative dashboard reports a usage loading error instead of zero consumption', async ({ page }) => {
  await mockRepresentative(page);
  await page.route('**/rest/v1/water_usages**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) }));
  await page.goto('/representative');
  await expect(page.getByRole('alert').filter({ hasText: 'دریافت مصرف آب ناموفق بود' })).toBeVisible();
  await expect(page.locator('.stat-num')).toHaveCount(0);
});

test('farmer can retry when transfer history fails to load', async ({ page }) => {
  await mockFarmer(page);
  await page.route('**/rest/v1/water_transfers**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) }));
  await page.goto('/farmer');
  const transferSection = page.getByRole('region', { name: 'انتقال‌های آب' });
  await expect(transferSection.getByRole('alert')).toContainText('دریافت انتقال‌ها ناموفق بود');
  await expect(transferSection.getByRole('button', { name: 'تلاش مجدد' })).toBeVisible();
  await expect(transferSection.getByText('انتقالی ثبت نشده است.')).toHaveCount(0);
});

test('representative can retry transfer history on farmer detail', async ({ page }) => {
  await mockRepresentative(page);
  await page.route('**/rest/v1/water_transfers**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) }));
  await page.goto('/representative/farmers/farmer-id');
  const transferSection = page.getByRole('region', { name: 'تاریخچه انتقال آب' });
  await expect(transferSection.getByRole('alert')).toContainText('دریافت انتقال‌ها ناموفق بود');
  await expect(transferSection.getByRole('button', { name: 'تلاش مجدد' })).toBeVisible();
  await expect(transferSection.getByText('انتقالی ثبت نشده است.')).toHaveCount(0);
});
