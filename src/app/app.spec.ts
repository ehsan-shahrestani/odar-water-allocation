import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { UserProfile } from './core/auth.model';
import { AuthService } from './core/auth.service';

describe('Admin route access', () => {
  const profile = signal<UserProfile | null>(null);
  const authenticated = signal(false);
  const authStub = {
    currentProfile: profile.asReadonly(),
    isAuthenticated: authenticated.asReadonly(),
    isLoading: signal(false).asReadonly(),
    initializeSession: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    profile.set(null);
    authenticated.set(false);
    authStub.initializeSession.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: authStub }],
    });
  });

  it('waits for initialization and redirects anonymous visitors to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');

    expect(authStub.initializeSession).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('allows an active admin profile', async () => {
    profile.set({
      id: 'admin-id',
      full_name: 'مدیر سامانه',
      phone: '',
      role: 'admin',
      is_active: true,
    });
    authenticated.set(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');

    expect(TestBed.inject(Router).url).toBe('/admin');
    expect(harness.routeNativeElement?.textContent).toContain('مدیریت سامانه');
  });

  it.each([
    { role: 'farmer' as const, is_active: true },
    { role: 'admin' as const, is_active: false },
  ])('rejects profile access for $role with active=$is_active', async (access) => {
    profile.set({
      id: 'blocked-id',
      full_name: 'کاربر بدون دسترسی',
      phone: '',
      ...access,
    });
    authenticated.set(false);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');

    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
