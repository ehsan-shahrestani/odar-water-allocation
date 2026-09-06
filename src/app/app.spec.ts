import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { UserProfile } from './core/auth.model';
import { AuthService } from './core/auth.service';
import { Role } from './core/mock-data';

describe('Portal route access', () => {
  const profile = signal<UserProfile | null>(null);
  const userRole = signal<Role | null>(null);
  const authenticated = signal(false);

  const authStub = {
    currentProfile: profile.asReadonly(),
    userRole: userRole.asReadonly(),
    isAuthenticated: authenticated.asReadonly(),
    isLoading: signal(false).asReadonly(),
    initializeSession: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    profile.set(null);
    userRole.set(null);
    authenticated.set(false);
    authStub.initializeSession.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: authStub }],
    });
  });

  it('redirects unauthenticated visitors to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/farmer');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('allows access to farmer routes for farmer role', async () => {
    userRole.set('farmer');
    authenticated.set(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/farmer');

    expect(TestBed.inject(Router).url).toBe('/farmer');
  });

  it('allows access to representative routes for representative role', async () => {
    userRole.set('representative');
    authenticated.set(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/representative');

    expect(TestBed.inject(Router).url).toBe('/representative');
  });

  it('redirects unknown paths to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/unknown');

    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
