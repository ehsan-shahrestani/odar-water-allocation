import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthError, AuthService, normalizeIranianMobile } from '../../../core/auth.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { InputComponent } from '../../../shared/input/input.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';

@Component({
  selector: 'app-login',
  imports: [ButtonComponent, InputComponent, PageHeaderComponent],
  template: `
    <div class="login-page">
      <app-page-header
        eyebrow="پورتال کشاورزان و نمایندگان"
        [title]="step() === 'OTP' ? 'تایید شماره موبایل' : 'ورود به سامانه اودار'"
      />

      @if (step() === 'PHONE') {
        <form
          novalidate
          (submit)="requestOtp(); $event.preventDefault()"
          class="space-y-5"
          [attr.aria-busy]="auth.isLoading()"
        >
          <app-input label="شماره موبایل" inputId="phone">
            <input
              #phoneInput
              id="phone"
              type="tel"
              dir="ltr"
              inputmode="tel"
              autocomplete="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              [value]="phone()"
              (input)="phone.set($any($event.target).value)"
              [attr.aria-invalid]="error() ? 'true' : null"
              aria-describedby="login-error"
              class="text-left font-mono text-lg"
            />
          </app-input>

          <p id="login-error" role="alert" class="error-message">{{ error() }}</p>

          <button app-button type="submit" class="w-full" [disabled]="auth.isLoading()">
            @if (auth.isLoading()) {
              <span class="loading-spinner" aria-hidden="true"></span>
              <span role="status">در حال ارسال پیامک…</span>
            } @else {
              دریافت کد تایید پیامکی
            }
          </button>

          <div class="text-xs text-ink-muted text-center pt-2 space-y-1">
            <p>رمز یکبار مصرف از طریق پیامک برای شما ارسال خواهد شد.</p>
          </div>
        </form>
      } @else {
        <!-- Step 2: OTP Entry -->
        <form
          novalidate
          (submit)="verifyOtp(); $event.preventDefault()"
          class="space-y-5"
          [attr.aria-busy]="auth.isLoading()"
        >
          <div class="card p-4 text-center space-y-2 mb-3 bg-mint-50">
            <p class="text-sm text-ink-muted">
              کد تایید ۶ رقمی به شماره
              <strong dir="ltr" class="inline-block mx-1 font-mono text-primary">{{ phone() }}</strong>
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

          @if (isAdminAccount()) {
            <div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3 my-3">
              <p class="text-sm text-amber-900 font-medium">حساب شما «مدیر سامانه» است. برای مدیریت چاه‌ها، کاربران و سهمیه‌ها وارد پنل ادمین شوید:</p>
              <a href="http://localhost:4201" class="inline-block px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition">
                ورود به پنل مدیریت دسکتاپ (پورت ۴۲۰۱)
              </a>
            </div>
          }

          <button app-button type="submit" class="w-full" [disabled]="auth.isLoading()">
            @if (auth.isLoading()) {
              <span class="loading-spinner" aria-hidden="true"></span>
              <span role="status">در حال بررسی کد…</span>
            } @else {
              ورود به سامانه
            }
          </button>

          <div class="flex items-center justify-between pt-2">
            @if (countdown() > 0) {
              <span class="text-xs text-ink-muted">
                ارسال مجدد تا {{ countdown() }} ثانیه دیگر
              </span>
            } @else {
              <button
                type="button"
                class="text-xs text-forest-700 underline font-semibold bg-transparent border-0 cursor-pointer p-0"
                [disabled]="auth.isLoading()"
                (click)="resendOtp()"
              >
                ارسال مجدد کد
              </button>
            }

            <button
              type="button"
              class="text-xs text-ink-muted underline bg-transparent border-0 cursor-pointer p-0"
              [disabled]="auth.isLoading()"
              (click)="changePhone()"
            >
              تغییر شماره موبایل
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly phoneInput = viewChild<ElementRef<HTMLInputElement>>('phoneInput');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  protected readonly step = signal<'PHONE' | 'OTP'>('PHONE');
  protected readonly phone = signal('');
  protected readonly otpCode = signal('');
  protected readonly error = signal('');
  protected readonly countdown = signal(0);
  protected readonly isAdminAccount = signal(false);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    afterNextRender(() => {
      const currentRole = typeof this.auth.userRole === 'function' ? this.auth.userRole() : null;
      if (currentRole === 'farmer') {
        void this.router.navigateByUrl('/farmer');
      } else if (currentRole === 'representative') {
        void this.router.navigateByUrl('/representative');
      } else {
        this.phoneInput()?.nativeElement.focus();
      }
    });
  }

  protected async requestOtp(): Promise<void> {
    if (this.auth.isLoading()) return;
    this.error.set('');

    const raw = this.phone().trim();
    const normalized = normalizeIranianMobile(raw);

    if (!normalized) {
      this.error.set('شماره موبایل معتبر نیست. لطفاً شماره ۱۱ رقمی (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.');
      this.phoneInput()?.nativeElement.focus();
      return;
    }

    try {
      await this.auth.loginPhone(normalized);
      this.step.set('OTP');
      this.startCountdown(120);
      setTimeout(() => this.otpInput()?.nativeElement.focus(), 100);
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError
          ? err.userMessage
          : 'ارسال کد تایید با خطا مواجه شد. دوباره تلاش کنید.',
      );
    }
  }

  protected async verifyOtp(): Promise<void> {
    if (this.auth.isLoading()) return;
    this.error.set('');
    this.isAdminAccount.set(false);

    const code = this.otpCode().trim();
    if (!code || code.length !== 6) {
      this.error.set('کد تایید ۶ رقمی را وارد کنید.');
      this.otpInput()?.nativeElement.focus();
      return;
    }

    try {
      const result = await this.auth.verifyPhoneOtp(this.phone(), code);
      const role = result.role;

      if (role === 'farmer') {
        await this.router.navigateByUrl('/farmer');
      } else if (role === 'representative') {
        await this.router.navigateByUrl('/representative');
      } else if (role === 'admin') {
        this.isAdminAccount.set(true);
      } else {
        this.error.set('نقش کاربری برای این شماره تعریف نشده است.');
      }
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError
          ? err.userMessage
          : 'کد تایید وارد شده صحیح نیست یا منقضی شده است.',
      );
    }
  }

  protected async resendOtp(): Promise<void> {
    this.error.set('');
    try {
      await this.auth.loginPhone(this.phone());
      this.startCountdown(120);
      this.otpCode.set('');
      this.otpInput()?.nativeElement.focus();
    } catch (err: unknown) {
      this.error.set(
        err instanceof AdminAuthError ? err.userMessage : 'ارسال مجدد کد با خطا مواجه شد.',
      );
    }
  }

  protected changePhone(): void {
    this.step.set('PHONE');
    this.otpCode.set('');
    this.error.set('');
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.countdown.set(0);
    setTimeout(() => this.phoneInput()?.nativeElement.focus(), 100);
  }

  private startCountdown(seconds: number): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.countdown.set(seconds);
    this.timerInterval = setInterval(() => {
      this.countdown.update((val) => {
        if (val <= 1) {
          if (this.timerInterval) clearInterval(this.timerInterval);
          return 0;
        }
        return val - 1;
      });
    }, 1000);
  }
}
