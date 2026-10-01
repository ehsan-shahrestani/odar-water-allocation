import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, from, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { Session, Subscription, User } from '@supabase/supabase-js';
import { UserProfile } from './auth.model';
import { SupabaseService } from './supabase.service';
import { normalizeDigits, Role } from './mock-data';
export { normalizeDigits };

export class AdminAuthError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdminAuthError';
  }
}

interface AuthFailure {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

export function getPhoneOtpErrorMessage(error: unknown): string {
  const failure =
    typeof error === 'object' && error !== null ? (error as AuthFailure) : {};
  const code = typeof failure.code === 'string' ? failure.code : '';
  const status = typeof failure.status === 'number' ? failure.status : null;

  if (code === 'phone_provider_disabled') {
    return 'سرویس ورود پیامکی فعال نیست. لطفاً با پشتیبانی سامانه تماس بگیرید.';
  }

  if (code === 'over_request_rate_limit' || status === 429) {
    return 'تعداد درخواست‌های پیامک بیش از حد مجاز است. کمی صبر کنید و دوباره تلاش کنید.';
  }

  if (code === 'hook_timeout') {
    return 'سرویس پیامک به‌موقع پاسخ نداد. لطفاً دوباره تلاش کنید.';
  }

  if (
    code === 'sms_send_failed' ||
    code === 'unexpected_failure' ||
    code.startsWith('hook_') ||
    (status !== null && status >= 500)
  ) {
    return 'ارسال پیامک توسط سرویس پیامک انجام نشد. لطفاً دوباره تلاش کنید.';
  }

  return 'خطا در ارسال کد تایید پیامکی. لطفاً دوباره تلاش کنید.';
}

export function normalizeIranianMobile(phone: string): string | null {
  if (!phone) return null;
  const withEnglishDigits = normalizeDigits(phone);
  const clean = withEnglishDigits.replace(/[^\d+]/g, '');

  let local = clean;
  if (clean.startsWith('+98')) {
    local = `0${clean.slice(3)}`;
  } else if (clean.startsWith('0098')) {
    local = `0${clean.slice(4)}`;
  } else if (/^98\d{10}$/.test(clean)) {
    local = `0${clean.slice(2)}`;
  } else if (/^9\d{9}$/.test(clean)) {
    local = `0${clean}`;
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
  private readonly loadingState = signal(false);
  private readonly otpInProgress = signal(false);
  private initSession$?: Observable<void>;
  private authSubscription: Subscription | null = null;
  private activeProfile$?: Observable<UserProfile>;

  readonly currentUser = this.currentUserState.asReadonly();
  readonly currentProfile = this.currentProfileState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();

  readonly userRole = computed<Role | null>(() => {
    const profile = this.currentProfileState();
    if (
      profile?.role === 'admin' ||
      profile?.role === 'representative' ||
      profile?.role === 'farmer'
    ) {
      return profile.role as Role;
    }
    return null;
  });

  readonly isAuthenticated = computed(() => {
    const user = this.currentUserState();
    const profile = this.currentProfileState();
    return user !== null && profile?.id === user.id && profile.is_active;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.authSubscription?.unsubscribe());
  }

  initializeSession$(): Observable<void> {
    if (this.initSession$) {
      return this.initSession$;
    }

    this.loadingState.set(true);
    this.registerAuthListener();
    this.initSession$ = this.restoreSession$().pipe(
      finalize(() => this.loadingState.set(false)),
      shareReplay(1),
    );
    return this.initSession$;
  }

  initializeSession(): Promise<void> {
    return firstValueFrom(this.initializeSession$());
  }

  ensureProfile$(): Observable<UserProfile> {
    const profile = this.currentProfileState();
    if (profile?.id) {
      return of(profile);
    }
    return this.initializeSession$().pipe(
      map(() => {
        const p = this.currentProfileState();
        if (!p?.id) {
          throw new Error('اطلاعات کاربری یافت نشد.');
        }
        return p;
      }),
    );
  }

  loginPhone$(rawPhone: string): Observable<void> {
    if (this.otpInProgress()) {
      return throwError(
        () => new AdminAuthError('درخواست قبلی در حال انجام است. لطفاً صبر کنید.'),
      );
    }

    const normalized = normalizeIranianMobile(rawPhone);
    if (!normalized) {
      return throwError(
        () => new AdminAuthError('شماره موبایل نامعتبر است. لطفاً شماره ۱۱ رقمی وارد کنید.'),
      );
    }

    this.otpInProgress.set(true);
    this.loadingState.set(true);

    const e164 = `+98${normalized.slice(1)}`;
    return defer(() =>
      from(
        this.supabase.auth.signInWithOtp({
          phone: e164,
        }),
      ),
    ).pipe(
      switchMap(({ error }) => {
        if (error) {
          return throwError(() => new AdminAuthError(getPhoneOtpErrorMessage(error)));
        }
        return of(undefined);
      }),
      finalize(() => {
        this.otpInProgress.set(false);
        this.loadingState.set(false);
      }),
    );
  }

  loginPhone(rawPhone: string): Promise<void> {
    return firstValueFrom(this.loginPhone$(rawPhone));
  }

  verifyPhoneOtp$(rawPhone: string, rawOtp: string): Observable<UserProfile> {
    if (this.loadingState()) {
      return throwError(() => new AdminAuthError('در حال پردازش…'));
    }

    const normalizedPhone = normalizeIranianMobile(rawPhone);
    const otp = normalizeDigits(rawOtp);

    if (!normalizedPhone || !/^\d{6}$/.test(otp)) {
      return throwError(
        () => new AdminAuthError('شماره موبایل یا کد تایید ۶ رقمی نامعتبر است.'),
      );
    }

    this.loadingState.set(true);
    const e164 = `+98${normalizedPhone.slice(1)}`;

    return defer(() =>
      from(
        this.supabase.auth.verifyOtp({
          phone: e164,
          token: otp,
          type: 'sms',
        }),
      ),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          console.error('OTP verification failed:', error);
          return throwError(() => new AdminAuthError('کد تایید اشتباه یا منقضی شده است.'));
        }

        this.currentUserState.set(data.user);
        return this.loadCurrentProfile$().pipe(
          switchMap((profile) => {
            if (profile.role === 'admin') {
              return this.signOutAndClear$().pipe(map(() => profile));
            }
            return of(profile);
          }),
        );
      }),
      finalize(() => this.loadingState.set(false)),
    );
  }

  verifyPhoneOtp(rawPhone: string, rawOtp: string): Promise<UserProfile> {
    return firstValueFrom(this.verifyPhoneOtp$(rawPhone, rawOtp));
  }

  loginAdmin$(email: string, password: string): Observable<void> {
    if (this.loadingState()) return of(undefined);

    this.loadingState.set(true);
    this.currentProfileState.set(null);

    return defer(() =>
      from(
        this.supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
      ),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          return throwError(() => new AdminAuthError('ایمیل یا رمز عبور صحیح نیست.'));
        }

        this.currentUserState.set(data.user);
        return this.loadCurrentProfile$().pipe(
          switchMap((profile) => {
            if (profile.role !== 'admin') {
              return throwError(
                () => new AdminAuthError('این حساب اجازه ورود به پنل مدیریت را ندارد.'),
              );
            }
            return of(undefined);
          }),
          catchError((profileError: unknown) => {
            return this.signOutAndClear$().pipe(switchMap(() => throwError(() => profileError)));
          }),
        );
      }),
      finalize(() => this.loadingState.set(false)),
    );
  }

  loginAdmin(email: string, password: string): Promise<void> {
    return firstValueFrom(this.loginAdmin$(email, password));
  }

  loadCurrentProfile$(): Observable<UserProfile> {
    const user = this.currentUserState();
    if (!user) {
      return throwError(
        () => new AdminAuthError('نشست شما معتبر نیست. دوباره وارد شوید.'),
      );
    }

    const currentProfile = this.currentProfileState();
    if (currentProfile?.id === user.id) {
      return of(currentProfile);
    }

    if (this.activeProfile$) {
      return this.activeProfile$;
    }

    this.activeProfile$ = this.fetchAndValidateProfile$(user.id).pipe(
      finalize(() => {
        this.activeProfile$ = undefined;
      }),
      shareReplay(1),
    );
    return this.activeProfile$;
  }

  loadCurrentProfile(): Promise<UserProfile> {
    return firstValueFrom(this.loadCurrentProfile$());
  }

  logout$(): Observable<void> {
    if (this.loadingState()) return of(undefined);

    this.loadingState.set(true);
    return defer(() => from(this.supabase.auth.signOut())).pipe(
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

  logout(): Promise<void> {
    return firstValueFrom(this.logout$());
  }

  private registerAuthListener(): void {
    if (this.authSubscription) return;

    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (!session?.user) {
        this.clearAuthState();
        return;
      }

      const previousUserId = this.currentUserState()?.id;
      this.currentUserState.set(session.user);

      if (session.user.id !== previousUserId) {
        this.currentProfileState.set(null);
        setTimeout(() => this.handleAuthenticatedSession$(session).subscribe());
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
        return this.loadCurrentProfile$().pipe(
          map(() => undefined),
          catchError(() => this.signOutAndClear$()),
        );
      }),
    );
  }

  private handleAuthenticatedSession$(session: Session): Observable<void> {
    this.loadingState.set(true);
    this.currentUserState.set(session.user);
    return this.loadCurrentProfile$().pipe(
      map(() => undefined),
      catchError(() => this.signOutAndClear$()),
      finalize(() => this.loadingState.set(false)),
    );
  }

  private fetchAndValidateProfile$(userId: string): Observable<UserProfile> {
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
        if (error) {
          return throwError(
            () => new AdminAuthError('دریافت اطلاعات حساب ممکن نشد. دوباره تلاش کنید.'),
          );
        }
        if (!data) {
          return throwError(() => new AdminAuthError('پروفایل کاربری شما پیدا نشد.'));
        }
        if (!data.is_active) {
          return throwError(() => new AdminAuthError('حساب کاربری شما غیرفعال است.'));
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

  private clearAuthState(): void {
    this.currentUserState.set(null);
    this.currentProfileState.set(null);
    this.activeProfile$ = undefined;
  }
}
