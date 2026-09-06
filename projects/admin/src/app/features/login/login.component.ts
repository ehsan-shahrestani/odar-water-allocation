import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonComponent } from '@shared/button/button.component';
import { InputComponent } from '@shared/input/input.component';
import { PageHeaderComponent } from '@shared/page-header/page-header.component';
import { AdminAuthError, AdminAuthService } from '../../core/admin-auth.service';

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
              [attr.aria-invalid]="error() ? 'true' : null"
              aria-describedby="login-error"
            />
          </app-input>

          <app-input label="رمز عبور" inputId="password">
            <input
              id="password"
              type="password"
              dir="ltr"
              autocomplete="current-password"
              placeholder="رمز عبور"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
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
              کد تایید ۶ رقمی به شماره همراه مدیر
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
              maxlength="6"
              dir="ltr"
              autocomplete="one-time-code"
              placeholder="۱۲۳۴۵۶"
              [value]="otpCode()"
              (input)="otpCode.set($any($event.target).value)"
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

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly otpCode = signal('');
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => {
      if (this.auth.isFullyAuthenticated()) {
        void this.router.navigateByUrl('/admin');
        return;
      }
      this.focusInitialField();
    });
  }

  private focusInitialField(): void {
    if (this.auth.currentStep() === 'OTP') {
      this.otpInput()?.nativeElement.focus();
    } else {
      this.emailInput()?.nativeElement.focus();
    }
  }

  protected async submitCredentials(): Promise<void> {
    if (this.auth.isLoading()) return;
    this.error.set('');

    const emailVal = this.email().trim();
    const passwordVal = this.password();

    if (!emailVal || !passwordVal) {
      this.error.set('ایمیل و رمز عبور را وارد کنید.');
      this.emailInput()?.nativeElement.focus();
      return;
    }

    try {
      await this.auth.loginWithPassword(emailVal, passwordVal);
      this.password.set('');
      setTimeout(() => this.otpInput()?.nativeElement.focus(), 100);
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError ? err.userMessage : 'ورود با خطا مواجه شد. دوباره تلاش کنید.',
      );
    }
  }

  protected async submitOtp(): Promise<void> {
    if (this.auth.isLoading()) return;
    this.error.set('');

    const code = this.otpCode().trim();
    if (!code || code.length !== 6) {
      this.error.set('کد تایید ۶ رقمی را به صورت کامل وارد کنید.');
      this.otpInput()?.nativeElement.focus();
      return;
    }

    try {
      await this.auth.verifyOtp(code);
      await this.router.navigateByUrl('/admin');
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError ? err.userMessage : 'کد تایید نامعتبر یا منقضی است.',
      );
    }
  }

  protected async resendOtp(): Promise<void> {
    this.error.set('');
    try {
      await this.auth.sendOtp();
      this.otpCode.set('');
      this.otpInput()?.nativeElement.focus();
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError ? err.userMessage : 'ارسال مجدد پیامک با خطا مواجه شد.',
      );
    }
  }

  protected async backToCredentials(): Promise<void> {
    await this.auth.logout();
    this.otpCode.set('');
    this.error.set('');
    setTimeout(() => this.emailInput()?.nativeElement.focus(), 100);
  }
}
