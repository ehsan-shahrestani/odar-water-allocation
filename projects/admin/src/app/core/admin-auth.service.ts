import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session, Subscription, User } from '@supabase/supabase-js';
import { UserProfile } from '@core/auth.model';
import { normalizeDigits } from '@core/mock-data';
import { SupabaseService } from '@core/supabase.service';

export class AdminAuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdminAuthError';
  }
}

export type AdminAuthStep = 'CREDENTIALS' | 'OTP' | 'AUTHENTICATED';

interface AdminOtpResponse {
  success?: boolean;
  verified?: boolean;
  maskedPhone?: string;
  expiresIn?: number;
  expiresAt?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUserState = signal<User | null>(null);
  private readonly currentProfileState = signal<UserProfile | null>(null);
  private readonly stepState = signal<AdminAuthStep>('CREDENTIALS');
  private readonly is2faVerifiedState = signal(false);
  private readonly loadingState = signal(false);
  private readonly maskedPhoneState = signal('');
  private readonly resendSecondsState = signal(0);
  private initializationPromise: Promise<void> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private mfaExpiryTimeout: ReturnType<typeof setTimeout> | null = null;
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
    return (
      user !== null &&
      profile?.id === user.id &&
      profile.role === 'admin' &&
      profile.is_active &&
      this.is2faVerifiedState()
    );
  });

  constructor() {
    try {
      sessionStorage.removeItem('odar_admin_2fa_verified');
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
    this.destroyRef.onDestroy(() => {
      this.authSubscription?.unsubscribe();
      this.clearTimers();
    });
  }

  initializeSession(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.registerAuthListener();
    this.loadingState.set(true);
    this.initializationPromise = this.restoreSession().finally(() => this.loadingState.set(false));
    return this.initializationPromise;
  }

  async loginWithPassword(email: string, password: string): Promise<void> {
    if (this.loadingState()) {
      throw new AdminAuthError('درخواست قبلی در حال پردازش است.');
    }

    this.loadingState.set(true);
    this.clearAuthState();
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
      await this.requestOtp();
    } catch (error: unknown) {
      if (!(error instanceof AdminAuthError)) {
        await this.signOutAndClear();
      }
      throw error;
    } finally {
      this.loadingState.set(false);
    }
  }

  async sendOtp(): Promise<void> {
    if (this.loadingState()) return;

    this.loadingState.set(true);
    try {
      await this.requestOtp();
    } finally {
      this.loadingState.set(false);
    }
  }

  async verifyOtp(rawCode: string): Promise<void> {
    if (this.loadingState()) return;

    const code = normalizeDigits(rawCode);
    if (!/^\d{6}$/.test(code)) {
      throw new AdminAuthError('کد تایید باید ۶ رقمی باشد.');
    }

    this.loadingState.set(true);
    try {
      const data = await this.invokeOtp({ action: 'verify', code });
      if (!data.verified || !data.expiresAt) {
        throw new AdminAuthError(data.error || 'کد تایید نامعتبر یا منقضی است.');
      }

      this.markMfaVerified(data.expiresAt);
    } finally {
      this.loadingState.set(false);
    }
  }

  async logout(): Promise<void> {
    this.loadingState.set(true);
    try {
      try {
        await this.invokeOtp({ action: 'revoke' });
      } catch {
        // Signing out revokes the Supabase session even if proof cleanup is unavailable.
      }
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

      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setTimeout(() => void this.synchronizeSession(session));
      }
    });
    this.authSubscription = data.subscription;
  }

  private async restoreSession(): Promise<void> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      this.clearAuthState();
      return;
    }

    this.currentUserState.set(data.user);
    try {
      const profile = await this.loadCurrentProfile(data.user.id);
      if (profile.role !== 'admin' || !profile.is_active) {
        await this.signOutAndClear();
        return;
      }

      const status = await this.invokeOtp({ action: 'status' });
      if (status.verified && status.expiresAt) {
        this.markMfaVerified(status.expiresAt);
      } else {
        this.is2faVerifiedState.set(false);
        this.stepState.set('OTP');
      }
    } catch {
      await this.signOutAndClear();
    }
  }

  private async synchronizeSession(session: Session): Promise<void> {
    if (session.user.id !== this.currentUserState()?.id) {
      this.clearAuthState();
      this.currentUserState.set(session.user);
    }
    await this.restoreSession();
  }

  private async requestOtp(): Promise<void> {
    const data = await this.invokeOtp({ action: 'send' });
    if (data.maskedPhone) this.maskedPhoneState.set(data.maskedPhone);
    this.is2faVerifiedState.set(false);
    this.stepState.set('OTP');
    this.startCountdown(data.expiresIn ?? 180);
  }

  private async invokeOtp(body: { action: 'send' | 'verify' | 'status' | 'revoke'; code?: string }): Promise<AdminOtpResponse> {
    const { data, error } = await this.supabase.functions.invoke<AdminOtpResponse>('admin-otp', { body });
    if (error || !data?.success) {
      let message = data?.error;
      const context = (error as { context?: unknown } | null)?.context;
      if (!message && context instanceof Response) {
        try {
          const payload = await context.clone().json() as { error?: unknown };
          if (typeof payload.error === 'string') message = payload.error;
        } catch {
          // Use the generic message when the function response is not JSON.
        }
      }
      throw new AdminAuthError(message || 'ارتباط با سرویس احراز هویت ممکن نشد.');
    }
    return data;
  }

  private markMfaVerified(expiresAt: string): void {
    const expiresInMs = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
      this.is2faVerifiedState.set(false);
      this.stepState.set('OTP');
      return;
    }

    this.is2faVerifiedState.set(true);
    this.stepState.set('AUTHENTICATED');
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mfaExpiryTimeout) clearTimeout(this.mfaExpiryTimeout);
    this.mfaExpiryTimeout = setTimeout(() => {
      this.is2faVerifiedState.set(false);
      this.stepState.set('OTP');
      void this.router.navigateByUrl('/login');
    }, Math.min(expiresInMs, 2_147_483_647));
  }

  private startCountdown(seconds: number): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.resendSecondsState.set(seconds);
    this.timerInterval = setInterval(() => {
      this.resendSecondsState.update((current) => {
        if (current <= 1) {
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.timerInterval = null;
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

  private clearTimers(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mfaExpiryTimeout) clearTimeout(this.mfaExpiryTimeout);
    this.timerInterval = null;
    this.mfaExpiryTimeout = null;
  }

  private clearAuthState(): void {
    this.currentUserState.set(null);
    this.currentProfileState.set(null);
    this.stepState.set('CREDENTIALS');
    this.is2faVerifiedState.set(false);
    this.maskedPhoneState.set('');
    this.resendSecondsState.set(0);
    this.clearTimers();
  }
}
