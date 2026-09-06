import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, User } from '@supabase/supabase-js';
import { SupabaseService } from '@core/supabase.service';
import { UserProfile } from '@core/auth.model';

export class AdminAuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdminAuthError';
  }
}

export type AdminAuthStep = 'CREDENTIALS' | 'OTP' | 'AUTHENTICATED';

const SESSION_STORAGE_2FA_KEY = 'odar_admin_2fa_verified';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUserState = signal<User | null>(null);
  private readonly currentProfileState = signal<UserProfile | null>(null);
  private readonly stepState = signal<AdminAuthStep>('CREDENTIALS');
  private readonly is2faVerifiedState = signal<boolean>(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_STORAGE_2FA_KEY) === 'true',
  );
  private readonly loadingState = signal(false);
  private readonly maskedPhoneState = signal<string>('');
  private readonly resendSecondsState = signal<number>(0);
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private authSubscription: Subscription | null = null;

  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentProfile = this.currentProfileState.asReadonly();
  readonly currentStep = this.stepState.asReadonly();
  readonly is2faVerified = this.is2faVerifiedState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly maskedPhone = this.maskedPhoneState.asReadonly();
  readonly resendSeconds = this.resendSecondsState.asReadonly();

  readonly isFullyAuthenticated = computed(() => {
    const user = this.currentUserState();
    const profile = this.currentProfileState();
    const is2fa = this.is2faVerifiedState();
    return (
      user !== null &&
      profile?.id === user.id &&
      profile.role === 'admin' &&
      profile.is_active &&
      is2fa
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.authSubscription?.unsubscribe();
      if (this.timerInterval) clearInterval(this.timerInterval);
    });
  }

  async initializeSession(): Promise<void> {
    this.loadingState.set(true);
    try {
      const { data } = await this.supabase.auth.getSession();
      if (data.session?.user) {
        this.currentUserState.set(data.session.user);
        await this.loadCurrentProfile(data.session.user.id);
        if (this.is2faVerifiedState()) {
          this.stepState.set('AUTHENTICATED');
        } else {
          this.stepState.set('OTP');
        }
      } else {
        this.clearAuthState();
      }
    } catch {
      this.clearAuthState();
    } finally {
      this.loadingState.set(false);
    }
  }

  async loginWithPassword(email: string, password: string): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        throw new AdminAuthError('ایمیل یا رمز عبور اشتباه است.');
      }

      this.currentUserState.set(data.user);
      const profile = await this.loadCurrentProfile(data.user.id);

      if (profile.role !== 'admin' || !profile.is_active) {
        await this.signOutAndClear();
        throw new AdminAuthError('این حساب کاربری دسترسی ادمین ندارد یا غیرفعال است.');
      }

      this.stepState.set('OTP');
      await this.sendOtp();
    } finally {
      this.loadingState.set(false);
    }
  }

  async sendOtp(): Promise<void> {
    this.loadingState.set(true);
    try {
      const { data: sessionData } = await this.supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new AdminAuthError('نشست معتبر نیست. لطفاً مجدداً وارد شوید.');
      }

      const { data, error } = await this.supabase.functions.invoke<{
        success: boolean;
        maskedPhone?: string;
        expiresIn?: number;
        error?: string;
      }>('admin-otp', {
        body: { action: 'send' },
      });

      if (error || !data?.success) {
        throw new AdminAuthError(data?.error || 'ارسال کد تایید با خطا مواجه شد. دوباره تلاش کنید.');
      }

      if (data.maskedPhone) {
        this.maskedPhoneState.set(data.maskedPhone);
      }
      this.startCountdown(data.expiresIn || 180);
    } finally {
      this.loadingState.set(false);
    }
  }

  async verifyOtp(code: string): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    try {
      const { data: sessionData } = await this.supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new AdminAuthError('نشست شما منقضی شده است. مجدداً وارد شوید.');
      }

      const { data, error } = await this.supabase.functions.invoke<{
        success: boolean;
        verified?: boolean;
        error?: string;
      }>('admin-otp', {
        body: { action: 'verify', code: code.trim() },
      });

      if (error || !data?.verified) {
        throw new AdminAuthError(data?.error || 'کد تایید نامعتبر یا منقضی است.');
      }

      this.is2faVerifiedState.set(true);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_2FA_KEY, 'true');
      }
      this.stepState.set('AUTHENTICATED');
      if (this.timerInterval) clearInterval(this.timerInterval);
    } finally {
      this.loadingState.set(false);
    }
  }

  async logout(): Promise<void> {
    this.loadingState.set(true);
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.clearAuthState();
      this.loadingState.set(false);
      await this.router.navigateByUrl('/login');
    }
  }

  private startCountdown(seconds: number): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.resendSecondsState.set(seconds);
    this.timerInterval = setInterval(() => {
      this.resendSecondsState.update((current) => {
        if (current <= 1) {
          if (this.timerInterval) clearInterval(this.timerInterval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  private async loadCurrentProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, phone, role, is_active')
      .eq('id', userId)
      .maybeSingle<UserProfile>();

    if (error || !data) {
      throw new AdminAuthError('پروفایل کاربری یافت نشد.');
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
    this.stepState.set('CREDENTIALS');
    this.is2faVerifiedState.set(false);
    this.maskedPhoneState.set('');
    this.resendSecondsState.set(0);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_2FA_KEY);
    }
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}
