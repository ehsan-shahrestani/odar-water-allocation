import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ButtonComponent } from '@shared/button/button.component';
import { InputComponent } from '@shared/input/input.component';
import { PageHeaderComponent } from '@shared/page-header/page-header.component';
import { AdminAuthError, AdminAuthService, normalizeDigits } from '../../core/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [ButtonComponent, InputComponent, PageHeaderComponent],
  template: `
    <div class="login-page">
      <app-page-header
        eyebrow="سامانه مدیریت اودار"
        [title]="auth.currentStep() === 'OTP' ? 'تایید هویت پیامکی' : 'ورود مدیر سامانه'"
      />

      @if (auth.currentStep() === 'CREDENTIALS') {
        <form
          novalidate
          (submit)="submitCredentials(); $event.preventDefault()"
          class="space-y-5"
          [attr.aria-busy]="auth.isLoading()"
        >
          <app-input label="ایمیل مدیر" inputId="email">
            <input
              #emailInput
              id="email"
              type="email"
              dir="ltr"
              autocomplete="username"
              placeholder="admin@odar.ir"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
              (change)="email.set($any($event.target).value)"
              (blur)="email.set($any($event.target).value)"
              [attr.aria-invalid]="error() ? 'true' : null"
              aria-describedby="login-error"
            />
          </app-input>

          <app-input label="رمز عبور" inputId="password">
            <input
              #passwordInput
              id="password"
              type="password"
              dir="ltr"
              autocomplete="current-password"
              placeholder="رمز عبور"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
              (change)="password.set($any($event.target).value)"
              (blur)="password.set($any($event.target).value)"
              [attr.aria-invalid]="error() ? 'true' : null"
              aria-describedby="login-error"
            />
          </app-input>

          <p id="login-error" role="alert" class="error-message">{{ error() }}</p>

          <button app-button type="submit" class="w-full" [disabled]="auth.isLoading()">
            @if (auth.isLoading()) {
              <span class="loading-spinner" aria-hidden="true"></span>
              <span role="status">در حال بررسی و ارسال پیامک…</span>
            } @else {
              ورود و دریافت کد تایید
            }
          </button>
        </form>
      } @else {
        <!-- Step 2: OTP Verification via Kavenegar -->
        <form
          novalidate
          (submit)="submitOtp(); $event.preventDefault()"
          class="space-y-5"
          [attr.aria-busy]="auth.isLoading()"
        >
          <div class="card p-4 text-center space-y-2 mb-3 bg-mint-50">
            <p class="text-sm text-ink-muted">
              کد تایید ۴ رقمی به شماره همراه مدیر
              @if (auth.maskedPhone()) {
                <strong dir="ltr" class="inline-block mx-1 font-mono text-primary">{{ auth.maskedPhone() }}</strong>
              }
              پیامک شد.
            </p>
          </div>

          <app-input label="کد تایید پیامک‌شده" inputId="otpCode">
            <input
              #otpInput
              id="otpCode"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              dir="ltr"
              autocomplete="one-time-code"
              placeholder="۱۲۳۴"
              [value]="otpCode()"
              (input)="onOtpInput($event)"
              [attr.aria-invalid]="error() ? 'true' : null"
              aria-describedby="otp-error"
              class="text-center font-mono tracking-widest text-xl"
            />
          </app-input>

          <p id="otp-error" role="alert" class="error-message">{{ error() }}</p>

          <button app-button type="submit" class="w-full" [disabled]="auth.isLoading()">
            @if (auth.isLoading()) {
              <span class="loading-spinner" aria-hidden="true"></span>
              <span role="status">در حال تایید…</span>
            } @else {
              تایید و ورود به پنل
            }
          </button>

          <div class="flex items-center justify-between pt-2">
            @if (auth.resendSeconds() > 0) {
              <span class="text-xs text-ink-muted">
                ارسال مجدد تا {{ auth.resendSeconds() }} ثانیه دیگر
              </span>
            } @else {
              <button
                type="button"
                class="text-xs text-forest-700 underline font-semibold bg-transparent border-0 cursor-pointer p-0"
                [disabled]="auth.isLoading()"
                (click)="resendOtp()"
              >
                ارسال مجدد پیامک
              </button>
            }

            <button
              type="button"
              class="text-xs text-ink-muted underline bg-transparent border-0 cursor-pointer p-0"
              [disabled]="auth.isLoading()"
              (click)="backToCredentials()"
            >
              تغییر ایمیل / رمز
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class AdminLoginComponent {
  protected readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly otpCode = signal('');
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => {
      if (this.auth.isFullyAuthenticated()) {
        from(this.router.navigateByUrl('/admin')).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        return;
      }
      this.focusInitialField();
    });
  }

  private focusInitialField(): void {
    if (this.auth.currentStep() === 'OTP') {
      this.otpInput()?.nativeElement.focus();
    } else {
      const emailEl = this.emailInput()?.nativeElement;
      if (emailEl?.value && !this.email()) {
        this.email.set(emailEl.value);
      }
      const passEl = this.passwordInput()?.nativeElement;
      if (passEl?.value && !this.password()) {
        this.password.set(passEl.value);
      }
      emailEl?.focus();
    }
  }

  protected submitCredentials(): void {
    if (this.auth.isLoading()) return;
    this.error.set('');

    const emailEl = this.emailInput()?.nativeElement;
    const passEl = this.passwordInput()?.nativeElement;
    const emailVal = (emailEl?.value || this.email()).trim();
    const passwordVal = passEl?.value || this.password();

    if (!emailVal || !passwordVal) {
      this.error.set('ایمیل و رمز عبور را وارد کنید.');
      emailEl?.focus();
      return;
    }

    this.email.set(emailVal);
    this.password.set(passwordVal);

    this.auth
      .loginWithPassword$(emailVal, passwordVal)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.password.set('');
          setTimeout(() => this.otpInput()?.nativeElement.focus(), 100);
        },
        error: (err: unknown) => {
          this.error.set(
            err instanceof AdminAuthError ? err.userMessage : 'ورود با خطا مواجه شد. دوباره تلاش کنید.',
          );
        },
      });
  }

  protected onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const clean = normalizeDigits(raw).replace(/\D/g, '').slice(0, 4);
    this.otpCode.set(clean);
    if (input.value !== clean) {
      input.value = clean;
    }
    if (clean.length === 4) {
      this.submitOtp();
    }
  }

  protected submitOtp(): void {
    if (this.auth.isLoading()) return;
    this.error.set('');

    const raw = this.otpCode().trim();
    const code = normalizeDigits(raw);
    if (!code || (code.length !== 4 && code.length !== 6)) {
      this.error.set('کد تایید ۴ رقمی را به صورت کامل وارد کنید.');
      this.otpInput()?.nativeElement.focus();
      return;
    }

    this.auth
      .verifyOtp$(code)
      .pipe(
        switchMap(() => from(this.router.navigateByUrl('/admin'))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (err: unknown) => {
          this.error.set(
            err instanceof AdminAuthError ? err.userMessage : 'کد تایید نامعتبر یا منقضی است.',
          );
        },
      });
  }

  protected resendOtp(): void {
    this.error.set('');
    this.auth
      .sendOtp$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.otpCode.set('');
          this.otpInput()?.nativeElement.focus();
        },
        error: (err: unknown) => {
          this.error.set(
            err instanceof AdminAuthError ? err.userMessage : 'ارسال مجدد پیامک با خطا مواجه شد.',
          );
        },
      });
  }

  protected backToCredentials(): void {
    this.auth
      .logout$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.otpCode.set('');
          this.error.set('');
          setTimeout(() => this.emailInput()?.nativeElement.focus(), 100);
        },
      });
  }
}
