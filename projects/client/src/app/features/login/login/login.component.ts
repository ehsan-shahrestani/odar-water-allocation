import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';
import { AdminAuthError, AuthService, normalizeIranianMobile } from '../../../core/auth.service';
import { ButtonComponent } from '../../../shared/button/button.component';

@Component({
  selector: 'app-login',
  imports: [ButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
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
      const msg = 'شماره موبایل معتبر نیست. لطفاً شماره ۱۱ رقمی (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.';
      this.error.set(msg);
      toast.error(msg);
      this.phoneInput()?.nativeElement.focus();
      return;
    }

    try {
      await this.auth.loginPhone(normalized);
      this.step.set('OTP');
      this.startCountdown(120);
      toast.success('کد تایید پیامک شد.');
      setTimeout(() => this.otpInput()?.nativeElement.focus(), 100);
    } catch (err: unknown) {
      const msg = err instanceof AdminAuthError
        ? err.userMessage
        : 'ارسال کد تایید با خطا مواجه شد. دوباره تلاش کنید.';
      this.error.set(msg);
      toast.error(msg);
    }
  }

  protected async verifyOtp(): Promise<void> {
    if (this.auth.isLoading()) return;
    this.error.set('');
    this.isAdminAccount.set(false);

    const code = this.otpCode().trim();
    if (!code || code.length !== 6) {
      const msg = 'کد تایید ۶ رقمی را وارد کنید.';
      this.error.set(msg);
      toast.error(msg);
      this.otpInput()?.nativeElement.focus();
      return;
    }

    try {
      const result = await this.auth.verifyPhoneOtp(this.phone(), code);
      const role = result.role;

      if (role === 'farmer') {
        toast.success('ورود با موفقیت انجام شد');
        await this.router.navigateByUrl('/farmer');
      } else if (role === 'representative') {
        toast.success('خوش آمدید، نماینده محترم');
        await this.router.navigateByUrl('/representative');
      } else if (role === 'admin') {
        this.isAdminAccount.set(true);
        toast.warning('این شماره دسترسی مدیر دارد. لطفاً از پنل مدیریت وارد شوید.');
      } else {
        const msg = 'نقش کاربری برای این شماره تعریف نشده است.';
        this.error.set(msg);
        toast.error(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof AdminAuthError
        ? err.userMessage
        : 'کد تایید وارد شده صحیح نیست یا منقضی شده است.';
      this.error.set(msg);
      toast.error(msg);
    }
  }

  protected async resendOtp(): Promise<void> {
    this.error.set('');
    try {
      await this.auth.loginPhone(this.phone());
      this.startCountdown(120);
      this.otpCode.set('');
      toast.success('کد تایید مجدداً ارسال شد.');
      this.otpInput()?.nativeElement.focus();
    } catch (err: unknown) {
      const msg = err instanceof AdminAuthError ? err.userMessage : 'ارسال مجدد کد با خطا مواجه شد.';
      this.error.set(msg);
      toast.error(msg);
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
