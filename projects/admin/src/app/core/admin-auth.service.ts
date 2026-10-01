import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthError, Session, Subscription, User } from '@supabase/supabase-js';
import { Observable, defer, from, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { UserProfile } from '@core/auth.model';
import { normalizeDigits } from '@core/mock-data';
import { SupabaseService } from '@core/supabase.service';

export { normalizeDigits };

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

function passwordLoginErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'email_provider_disabled':
      return 'ورود با ایمیل در سرویس احراز هویت غیرفعال است.';
    case 'email_not_confirmed':
      return 'ایمیل این حساب هنوز تأیید نشده است.';
    case 'over_request_rate_limit':
    case 'too_many_requests':
      return 'تعداد تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.';
    case 'weak_password':
      return 'رمز عبور فعلی با الزامات امنیتی سازگار نیست. رمز عبور را بازیابی کنید.';
    default:
      return 'ایمیل یا رمز عبور اشتباه است.';
  }
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
  private initSession$?: Observable<void>;
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

  initializeSession$(): Observable<void> {
    if (this.initSession$) {
      return this.initSession$;
    }

    this.registerAuthListener();
    this.loadingState.set(true);

    this.initSession$ = this.restoreSession$().pipe(
      finalize(() => this.loadingState.set(false)),
      shareReplay(1),
    );
    return this.initSession$;
  }

  /** Alias for backward compatibility */
  initializeSession(): Observable<void> {
    return this.initializeSession$();
  }

  loginWithPassword$(email: string, password: string): Observable<void> {
    if (this.loadingState()) {
      return throwError(() => new AdminAuthError('درخواست قبلی در حال پردازش است.'));
    }

    this.loadingState.set(true);
    this.clearAuthState();

    return defer(() =>
      from(
        this.supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
      ),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => new AdminAuthError(passwordLoginErrorMessage(error)));
        }
        if (!data.user) {
          return throwError(() => new AdminAuthError('ایمیل یا رمز عبور اشتباه است.'));
        }

        this.currentUserState.set(data.user);
        return this.loadCurrentProfile$(data.user.id);
      }),
      switchMap((profile) => {
        if (profile.role !== 'admin' || !profile.is_active) {
          return this.signOutAndClear$().pipe(
            switchMap(() =>
              throwError(
                () => new AdminAuthError('این حساب کاربری دسترسی ادمین ندارد یا غیرفعال است.'),
              ),
            ),
          );
        }
        this.stepState.set('OTP');
        return this.requestOtp$();
      }),
      catchError((error: unknown) => {
        if (!(error instanceof AdminAuthError)) {
          return this.signOutAndClear$().pipe(switchMap(() => throwError(() => error)));
        }
        return throwError(() => error);
      }),
      finalize(() => this.loadingState.set(false)),
    );
  }

  loginWithPassword(email: string, password: string): Observable<void> {
    return this.loginWithPassword$(email, password);
  }

  sendOtp$(): Observable<void> {
    if (this.loadingState()) return of(undefined);

    this.loadingState.set(true);
    return this.requestOtp$().pipe(finalize(() => this.loadingState.set(false)));
  }

  sendOtp(): Observable<void> {
    return this.sendOtp$();
  }

  verifyOtp$(rawCode: string): Observable<void> {
    if (this.loadingState()) return of(undefined);

    const code = normalizeDigits(rawCode);
    if (!/^\d{4,6}$/.test(code)) {
      return throwError(() => new AdminAuthError('کد تایید باید ۴ رقمی باشد.'));
    }

    this.loadingState.set(true);
    return this.invokeOtp$({ action: 'verify', code }).pipe(
      tap((data) => {
        if (!data.verified || !data.expiresAt) {
          throw new AdminAuthError(data.error || 'کد تایید نامعتبر یا منقضی است.');
        }
        this.markMfaVerified(data.expiresAt);
      }),
      map(() => undefined),
      finalize(() => this.loadingState.set(false)),
    );
  }

  verifyOtp(rawCode: string): Observable<void> {
    return this.verifyOtp$(rawCode);
  }

  logout$(): Observable<void> {
    this.loadingState.set(true);

    return this.invokeOtp$({ action: 'revoke' }).pipe(
      catchError(() => of(null)), // Proceed with logout even if revoke fails
      switchMap(() => defer(() => from(this.supabase.auth.signOut()))),
      catchError(() => of(null)),
      switchMap(() => {
        this.clearAuthState();
        this.loadingState.set(false);
        return defer(() => from(this.router.navigateByUrl('/login')));
      }),
      map(() => undefined),
      finalize(() => {
        this.clearAuthState();
        this.loadingState.set(false);
      }),
    );
  }

  logout(): Observable<void> {
    return this.logout$();
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
        setTimeout(() => this.synchronizeSession$(session).subscribe());
      }
    });
    this.authSubscription = data.subscription;
  }

  private restoreSession$(): Observable<void> {
    return defer(() => from(this.supabase.auth.getUser())).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          this.clearAuthState();
          return of(undefined);
        }

        this.currentUserState.set(data.user);
        return this.loadCurrentProfile$(data.user.id).pipe(
          switchMap((profile) => {
            if (profile.role !== 'admin' || !profile.is_active) {
              return this.signOutAndClear$();
            }

            return this.invokeOtp$({ action: 'status' }).pipe(
              tap((status) => {
                if (status.verified && status.expiresAt) {
                  this.markMfaVerified(status.expiresAt);
                } else {
                  this.is2faVerifiedState.set(false);
                  this.stepState.set('OTP');
                }
              }),
              map(() => undefined),
            );
          }),
          catchError(() => this.signOutAndClear$()),
        );
      }),
    );
  }

  private synchronizeSession$(session: Session): Observable<void> {
    if (session.user.id !== this.currentUserState()?.id) {
      this.clearAuthState();
      this.currentUserState.set(session.user);
    }
    return this.restoreSession$();
  }

  private requestOtp$(): Observable<void> {
    return this.invokeOtp$({ action: 'send' }).pipe(
      tap((data) => {
        if (data.maskedPhone) this.maskedPhoneState.set(data.maskedPhone);
        this.is2faVerifiedState.set(false);
        this.stepState.set('OTP');
        this.startCountdown(data.expiresIn ?? 180);
      }),
      map(() => undefined),
    );
  }

  private invokeOtp$(body: {
    action: 'send' | 'verify' | 'status' | 'revoke';
    code?: string;
  }): Observable<AdminOtpResponse> {
    return defer(() =>
      from(this.supabase.functions.invoke<AdminOtpResponse>('admin-otp', { body })),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data?.success) {
          let message = data?.error;
          const context = (error as { context?: unknown } | null)?.context;
          if (!message && context instanceof Response) {
            return defer(() => from(context.clone().json())).pipe(
              catchError(() => of({})),
              switchMap((payload: { error?: unknown }) => {
                if (typeof payload?.error === 'string') message = payload.error;
                return throwError(
                  () => new AdminAuthError(message || 'ارتباط با سرویس احراز هویت ممکن نشد.'),
                );
              }),
            );
          }
          return throwError(
            () => new AdminAuthError(message || 'ارتباط با سرویس احراز هویت ممکن نشد.'),
          );
        }
        return of(data);
      }),
    );
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
    this.mfaExpiryTimeout = setTimeout(
      () => {
        this.is2faVerifiedState.set(false);
        this.stepState.set('OTP');
        defer(() => from(this.router.navigateByUrl('/login'))).subscribe();
      },
      Math.min(expiresInMs, 2_147_483_647),
    );
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

  private loadCurrentProfile$(userId: string): Observable<UserProfile> {
    return defer(() =>
      from(
        this.supabase
          .from('profiles')
          .select('id, full_name, phone, role, is_active')
          .eq('id', userId)
          .maybeSingle<UserProfile>(),
      ),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) {
          return throwError(() => new AdminAuthError('پروفایل کاربری یافت نشد.'));
        }
        this.currentProfileState.set(data);
        return of(data);
      }),
    );
  }

  private signOutAndClear$(): Observable<void> {
    return defer(() => from(this.supabase.auth.signOut())).pipe(
      catchError(() => of(null)),
      tap(() => this.clearAuthState()),
      map(() => undefined),
    );
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
