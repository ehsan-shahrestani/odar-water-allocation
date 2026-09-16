import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { UserProfile } from '@core/auth.model';
import { SupabaseService } from '@core/supabase.service';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  const user = { id: 'admin-id' } as User;
  const profile: UserProfile = {
    id: user.id,
    full_name: 'مدیر سامانه',
    phone: '09120000000',
    role: 'admin',
    is_active: true,
  };

  let storedUser: User | null;
  let serverMfaVerified: boolean;
  let auth: AdminAuthService;
  let getUser: ReturnType<typeof vi.fn>;
  let invoke: ReturnType<typeof vi.fn>;
  let onAuthStateChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    storedUser = null;
    serverMfaVerified = false;
    getUser = vi.fn(async () => ({ data: { user: storedUser }, error: null }));
    onAuthStateChange = vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    invoke = vi.fn(async (_name: string, options: { body: { action: string } }) => {
      if (options.body.action === 'status') {
        return {
          data: {
            success: true,
            verified: serverMfaVerified,
            expiresAt: serverMfaVerified
              ? new Date(Date.now() + 60_000).toISOString()
              : undefined,
          },
          error: null,
        };
      }
      if (options.body.action === 'verify') {
        return {
          data: {
            success: true,
            verified: true,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          error: null,
        };
      }
      return {
        data: { success: true, maskedPhone: '0912***0000', expiresIn: 180 },
        error: null,
      };
    });

    const maybeSingle = vi.fn(async () => ({ data: profile, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    const signInWithPassword = vi.fn(async () => ({ data: { user }, error: null }));
    const signOut = vi.fn(async () => ({ error: null }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AdminAuthService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              auth: { getUser, onAuthStateChange, signInWithPassword, signOut },
              functions: { invoke },
              from,
            },
          },
        },
      ],
    });
    auth = TestBed.inject(AdminAuthService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('does not trust the legacy browser 2FA flag', async () => {
    sessionStorage.setItem('odar_admin_2fa_verified', 'true');
    storedUser = user;

    await auth.initializeSession();

    expect(auth.currentStep()).toBe('OTP');
    expect(auth.isFullyAuthenticated()).toBe(false);
    expect(invoke).toHaveBeenCalledWith('admin-otp', { body: { action: 'status' } });
  });

  it('restores authentication only from a server-side session proof', async () => {
    storedUser = user;
    serverMfaVerified = true;

    await auth.initializeSession();

    expect(auth.currentStep()).toBe('AUTHENTICATED');
    expect(auth.isFullyAuthenticated()).toBe(true);
  });

  it('requires password and OTP before authenticating', async () => {
    await auth.initializeSession();
    await auth.loginWithPassword('admin@example.com', 'password');

    expect(auth.currentStep()).toBe('OTP');
    expect(auth.isFullyAuthenticated()).toBe(false);
    expect(invoke).toHaveBeenCalledWith('admin-otp', { body: { action: 'send' } });

    await auth.verifyOtp('۱۲۳۴۵۶');

    expect(invoke).toHaveBeenCalledWith('admin-otp', {
      body: { action: 'verify', code: '123456' },
    });
    expect(auth.isFullyAuthenticated()).toBe(true);
  });
});
