import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session, Subscription, User } from '@supabase/supabase-js';
import { UserProfile } from './auth.model';
import { SupabaseService } from './supabase.service';
import { demoAccounts, normalizeDigits, Role } from './mock-data';

export class AdminAuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdminAuthError';
  }
}

export function normalizeIranianMobile(phone: string): string | null {
  const compact = phone.replace(/[\s\-()]/g, '');
  const digits = normalizeDigits(compact);

  let local = digits;
  if (digits.startsWith('+98')) {
    local = `0${digits.slice(3)}`;
  } else if (digits.startsWith('0098')) {
    local = `0${digits.slice(4)}`;
  } else if (/^98\d{10}$/.test(digits)) {
    local = `0${digits.slice(2)}`;
  } else if (/^9\d{9}$/.test(digits)) {
    local = `0${digits}`;
  }

  return /^09\d{9}$/.test(local) ? local : null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUserState = signal<User | null>(null);
  private readonly currentProfileState = signal<UserProfile | null>(null);
  private readonly demoRoleState = signal<Role | null>(null);
  private readonly loadingState = signal(false);
  private initializationPromise: Promise<void> | null = null;
  private authSubscription: Subscription | null = null;
  private activeProfileLoad: { userId: string; request: Promise<UserProfile> } | null = null;

  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentProfile = this.currentProfileState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();

  readonly userRole = computed<Role | null>(() => {
    const profile = this.currentProfileState();
    if (profile?.role === 'admin' || profile?.role === 'representative' || profile?.role === 'farmer') {
      return profile.role as Role;
    }
    return this.demoRoleState();
  });

  readonly isAuthenticated = computed(() => {
    const user = this.currentUserState();
    const profile = this.currentProfileState();
    const demo = this.demoRoleState();
    if (demo !== null) return true;
    return user !== null && profile?.id === user.id && profile.is_active;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.authSubscription?.unsubscribe());
  }

  initializeSession(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.loadingState.set(true);
    this.registerAuthListener();
    this.initializationPromise = this.restoreSession().finally(() => this.loadingState.set(false));
    return this.initializationPromise;
  }

  async loginPhone(rawPhone: string): Promise<{ isDemo: boolean }> {
    if (this.loadingState()) return { isDemo: false };

    const normalized = normalizeIranianMobile(rawPhone);
    if (!normalized) {
      throw new AdminAuthError('شماره موبایل نامعتبر است. لطفاً شماره ۱۱ رقمی وارد کنید.');
    }

    // Check demo accounts
    if (demoAccounts[normalized]) {
      return { isDemo: true };
    }

    this.loadingState.set(true);
    try {
      const e164 = `+98${normalized.slice(1)}`;
      const { error } = await this.supabase.auth.signInWithOtp({
        phone: e164,
      });

      if (error) {
        if (
          error.message?.includes('Unsupported phone provider') ||
          (error as { code?: string }).code === 'phone_provider_disabled'
        ) {
          throw new AdminAuthError(
            'ارائه‌دهنده پیامک در پنل سوپابیس فعال نشده است. لطفاً در داشبورد سوپابیس وارد بخش Authentication > Providers شده و گزینه Phone را فعال کنید (و در بخش Hooks هوک send-sms-kavenegar را متصل کنید).'
          );
        }
        throw new AdminAuthError(error.message || 'خطا در ارسال کد تایید پیامکی.');
      }

      return { isDemo: false };
    } finally {
      this.loadingState.set(false);
    }
  }

  async verifyPhoneOtp(rawPhone: string, rawOtp: string): Promise<UserProfile | { role: Role }> {
    if (this.loadingState()) throw new AdminAuthError('در حال پردازش…');

    const normalizedPhone = normalizeIranianMobile(rawPhone);
    const otp = normalizeDigits(rawOtp);

    if (!normalizedPhone || !/^\d{6}$/.test(otp)) {
      throw new AdminAuthError('شماره موبایل یا کد تایید ۶ رقمی نامعتبر است.');
    }

    // Demo account handling
    const demoRole = demoAccounts[normalizedPhone];
    if (demoRole && otp === '123456') {
      this.demoRoleState.set(demoRole);
      return { role: demoRole };
    }

    this.loadingState.set(true);
    try {
      const e164 = `+98${normalizedPhone.slice(1)}`;
      const { data, error } = await this.supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: 'sms',
      });

      if (error || !data.user) {
        throw new AdminAuthError('کد تایید اشتباه یا منقضی شده است.');
      }

      this.currentUserState.set(data.user);
      const profile = await this.loadCurrentProfile();
      return profile;
    } finally {
      this.loadingState.set(false);
    }
  }

  async loginAdmin(email: string, password: string): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    this.currentProfileState.set(null);

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        throw new AdminAuthError('ایمیل یا رمز عبور صحیح نیست.');
      }

      this.currentUserState.set(data.user);
      try {
        const profile = await this.loadCurrentProfile();
        if (profile.role !== 'admin') {
          throw new AdminAuthError('این حساب اجازه ورود به پنل مدیریت را ندارد.');
        }
      } catch (profileError: unknown) {
        await this.signOutAndClear();
        throw profileError;
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  loadCurrentProfile(): Promise<UserProfile> {
    const user = this.currentUserState();
    if (!user) {
      return Promise.reject(new AdminAuthError('نشست شما معتبر نیست. دوباره وارد شوید.'));
    }

    const currentProfile = this.currentProfileState();
    if (currentProfile?.id === user.id) return Promise.resolve(currentProfile);
    if (this.activeProfileLoad?.userId === user.id) return this.activeProfileLoad.request;

    const request = this.fetchAndValidateProfile(user.id).finally(() => {
      if (this.activeProfileLoad?.userId === user.id) this.activeProfileLoad = null;
    });
    this.activeProfileLoad = { userId: user.id, request };
    return request;
  }

  async logout(): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.clearAuthState();
      this.loadingState.set(false);
      await this.router.navigateByUrl('/login');
    }
  }

  private registerAuthListener(): void {
    if (this.authSubscription) return;

    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (!session?.user) {
        this.clearAuthState();
        return;
      }

      this.currentUserState.set(session.user);
      this.currentProfileState.set(null);
      setTimeout(() => void this.handleAuthenticatedSession(session));
    });
    this.authSubscription = data.subscription;
  }

  private async restoreSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error || !data.session?.user) {
      this.clearAuthState();
      return;
    }

    this.currentUserState.set(data.session.user);
    try {
      await this.loadCurrentProfile();
    } catch {
      await this.signOutAndClear();
    }
  }

  private async handleAuthenticatedSession(session: Session): Promise<void> {
    this.loadingState.set(true);
    try {
      this.currentUserState.set(session.user);
      await this.loadCurrentProfile();
    } catch {
      await this.signOutAndClear();
    } finally {
      this.loadingState.set(false);
    }
  }

  private async fetchAndValidateProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, phone, role, is_active')
      .eq('id', userId)
      .maybeSingle<UserProfile>();

    if (error) {
      throw new AdminAuthError('دریافت اطلاعات حساب ممکن نشد. دوباره تلاش کنید.');
    }
    if (!data) {
      throw new AdminAuthError('پروفایل کاربری شما پیدا نشد.');
    }
    if (!data.is_active) {
      throw new AdminAuthError('حساب کاربری شما غیرفعال است.');
    }

    this.currentProfileState.set(data);
    return data;
  }

  private async signOutAndClear(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.clearAuthState();
    }
  }

  private clearAuthState(): void {
    this.currentUserState.set(null);
    this.currentProfileState.set(null);
    this.demoRoleState.set(null);
    this.activeProfileLoad = null;
  }
}
