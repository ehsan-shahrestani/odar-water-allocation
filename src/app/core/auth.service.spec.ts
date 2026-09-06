import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { UserProfile } from './auth.model';
import { AdminAuthError, AuthService } from './auth.service';
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
  let auth: AuthService;
  let getSession: ReturnType<typeof vi.fn>;
  let signInWithPassword: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;
  let onAuthStateChange: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  let eq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    profile = activeAdmin;
    credentialError = false;
    profileQueryError = false;
    getSession = vi.fn(async () => ({ data: { session: null }, error: null }));
    signInWithPassword = vi.fn(async () => ({
      data: { user: credentialError ? null : user, session: null },
      error: credentialError ? new Error('invalid credentials') : null,
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
        auth: { getSession, signInWithPassword, signOut, onAuthStateChange },
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

    expect(getSession).toHaveBeenCalledOnce();
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
