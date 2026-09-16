import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { UserProfile } from './auth.model';
import {
  AdminAuthError,
  AuthService,
  getPhoneOtpErrorMessage,
  normalizeIranianMobile,
} from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  const user = { id: 'admin-id' } as User;
  const activeAdmin: UserProfile = {
    id: user.id,
    full_name: 'مدیر سامانه',
    phone: '',
    role: 'admin',
    is_active: true,
  };
  let profile: UserProfile | null;
  let credentialError: boolean;
  let profileQueryError: boolean;
  let phoneOtpError: { code?: string; message: string; status?: number } | null;
  let auth: AuthService;
  let getUser: ReturnType<typeof vi.fn>;
  let signInWithPassword: ReturnType<typeof vi.fn>;
  let signInWithOtp: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;
  let onAuthStateChange: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  let eq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    profile = activeAdmin;
    credentialError = false;
    profileQueryError = false;
    phoneOtpError = null;
    getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    signInWithPassword = vi.fn(async () => ({
      data: { user: credentialError ? null : user, session: null },
      error: credentialError ? new Error('invalid credentials') : null,
    }));
    signInWithOtp = vi.fn(async () => ({
      data: { messageId: null, user: null, session: null },
      error: phoneOtpError,
    }));
    signOut = vi.fn(async () => ({ error: null }));
    unsubscribe = vi.fn();
    onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));
    const maybeSingle = vi.fn(async () => ({
      data: profile,
      error: profileQueryError ? new Error('profile query failed') : null,
    }));
    eq = vi.fn(() => ({ maybeSingle }));
    from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    const supabaseStub = {
      client: {
        auth: { getUser, signInWithOtp, signInWithPassword, signOut, onAuthStateChange },
        from,
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AuthService,
        { provide: SupabaseService, useValue: supabaseStub },
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  it('initializes the stored session and listener only once', async () => {
    await Promise.all([auth.initializeSession(), auth.initializeSession()]);

    expect(getUser).toHaveBeenCalledOnce();
    expect(onAuthStateChange).toHaveBeenCalledOnce();
    expect(auth.isLoading()).toBe(false);
  });

  it('authenticates only after loading an active admin profile', async () => {
    await auth.initializeSession();
    await auth.loginAdmin('admin@example.com', 'password');

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'password',
    });
    expect(auth.currentUser()?.id).toBe(user.id);
    expect(auth.currentProfile()).toEqual(activeAdmin);
    expect(auth.isAuthenticated()).toBe(true);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(eq).toHaveBeenCalledWith('id', user.id);
  });

  it('uses the generic Persian message for invalid credentials', async () => {
    credentialError = true;
    await auth.initializeSession();

    await expect(auth.loginAdmin('admin@example.com', 'wrong')).rejects.toMatchObject({
      userMessage: 'ایمیل یا رمز عبور صحیح نیست.',
    } satisfies Partial<AdminAuthError>);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('normalizes the phone before requesting an OTP', async () => {
    await auth.loginPhone('۰۹۹۰۵۹۱۳۸۵۲');

    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: '+989905913852',
    });
  });

  it('keeps provider failures private and returns an actionable Persian message', async () => {
    phoneOtpError = {
      code: 'unexpected_failure',
      message: 'SMS provider rejected the message',
      status: 500,
    };

    await expect(auth.loginPhone('09905913852')).rejects.toMatchObject({
      userMessage: 'ارسال پیامک توسط سرویس پیامک انجام نشد. لطفاً دوباره تلاش کنید.',
    } satisfies Partial<AdminAuthError>);
  });

  it.each([
    {
      deniedProfile: { ...activeAdmin, role: 'farmer' as const },
      message: 'این حساب اجازه ورود به پنل مدیریت را ندارد.',
    },
    {
      deniedProfile: { ...activeAdmin, is_active: false },
      message: 'حساب کاربری شما غیرفعال است.',
    },
    { deniedProfile: null, message: 'پروفایل کاربری شما پیدا نشد.' },
  ])('signs out when the profile is not allowed', async ({ deniedProfile, message }) => {
    profile = deniedProfile;
    await auth.initializeSession();

    await expect(auth.loginAdmin('admin@example.com', 'password')).rejects.toMatchObject({
      userMessage: message,
    });
    expect(signOut).toHaveBeenCalledOnce();
    expect(auth.currentUser()).toBeNull();
    expect(auth.currentProfile()).toBeNull();
  });

  it('does not expose a raw profile query error', async () => {
    profileQueryError = true;
    await auth.initializeSession();

    await expect(auth.loginAdmin('admin@example.com', 'password')).rejects.toMatchObject({
      userMessage: 'دریافت اطلاعات حساب ممکن نشد. دوباره تلاش کنید.',
    });
  });

  it('clears signals and navigates to login after logout', async () => {
    await auth.initializeSession();
    await auth.loginAdmin('admin@example.com', 'password');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await auth.logout();

    expect(signOut).toHaveBeenCalledOnce();
    expect(auth.currentUser()).toBeNull();
    expect(auth.currentProfile()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('unsubscribes the auth listener when the service is destroyed', async () => {
    await auth.initializeSession();

    TestBed.resetTestingModule();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('normalizeIranianMobile', () => {
  it('normalizes standard 11-digit Iranian mobile numbers', () => {
    expect(normalizeIranianMobile('09123456789')).toBe('09123456789');
  });

  it('normalizes Persian and Arabic digits', () => {
    expect(normalizeIranianMobile('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(normalizeIranianMobile('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
  });

  it('normalizes +98 and 0098 prefixes', () => {
    expect(normalizeIranianMobile('+989123456789')).toBe('09123456789');
    expect(normalizeIranianMobile('00989123456789')).toBe('09123456789');
    expect(normalizeIranianMobile('989123456789')).toBe('09123456789');
  });

  it('normalizes numbers without leading zero', () => {
    expect(normalizeIranianMobile('9123456789')).toBe('09123456789');
  });

  it('handles invisible unicode marks, spaces, dashes and parentheses', () => {
    expect(normalizeIranianMobile('\u200E09123456789')).toBe('09123456789');
    expect(normalizeIranianMobile('\u200F09123456789\u200E')).toBe('09123456789');
    expect(normalizeIranianMobile('0912-345-6789')).toBe('09123456789');
    expect(normalizeIranianMobile('(+98) 912 345 6789')).toBe('09123456789');
  });

  it('returns null for invalid numbers or empty strings', () => {
    expect(normalizeIranianMobile('')).toBeNull();
    expect(normalizeIranianMobile('08123456789')).toBeNull();
    expect(normalizeIranianMobile('0912345')).toBeNull();
  });
});

describe('getPhoneOtpErrorMessage', () => {
  it('returns specific messages for timeout and rate limiting', () => {
    expect(getPhoneOtpErrorMessage({ code: 'hook_timeout', status: 500 })).toContain('به‌موقع پاسخ نداد');
    expect(getPhoneOtpErrorMessage({ code: 'over_request_rate_limit', status: 429 })).toContain('بیش از حد مجاز');
  });

  it('does not expose unknown server messages', () => {
    expect(getPhoneOtpErrorMessage({ message: 'internal provider secret' })).not.toContain('internal provider secret');
  });
});
