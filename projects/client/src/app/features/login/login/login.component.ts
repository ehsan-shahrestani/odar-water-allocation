import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { from } from 'rxjs';
import { toast } from 'ngx-sonner';
import { AdminAuthError, AuthService, normalizeDigits, normalizeIranianMobile } from '../../../core/auth.service';
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
  private readonly destroyRef = inject(DestroyRef);

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
      const input = this.phoneInput()?.nativeElement;
      if (input) {
        if (input.value && !this.phone()) {
          this.phone.set(input.value);
        }
        input.focus();
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.timerInterval) clearInterval(this.timerInterval);
    });
  }

  protected requestOtp(): void {
    this.error.set('');

    const inputElement = this.phoneInput()?.nativeElement;
    const raw = (inputElement?.value || this.phone()).trim();
    const normalized = normalizeIranianMobile(raw);

    if (!normalized) {
      const msg = 'شماره موبایل معتبر نیست. لطفاً شماره ۱۱ رقمی (مانند ۰۹۱۲۳۴۵۶۷۸۹) وارد کنید.';
      this.error.set(msg);
      toast.error(msg);
      inputElement?.focus();
      return;
    }

    this.phone.set(normalized);
    if (inputElement && inputElement.value !== normalized) {
      inputElement.value = normalized;
    }

    this.auth.loginPhone$(normalized).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.step.set('OTP');
        this.startCountdown(120);
        toast.success('کد تایید پیامک شد.');
        setTimeout(() => this.otpInput()?.nativeElement.focus(), 100);
      },
      error: (err: unknown) => {
        const msg = err instanceof AdminAuthError
          ? err.userMessage
          : 'ارسال کد تایید با خطا مواجه شد. دوباره تلاش کنید.';
        this.error.set(msg);
        toast.error(msg);
      },
    });
  }

  protected verifyOtp(): void {
    if (this.auth.isLoading()) return;
    this.error.set('');
    this.isAdminAccount.set(false);

    const rawCode = this.otpCode().trim();
    const code = normalizeDigits(rawCode);
    if (!code || code.length !== 6) {
      const msg = 'کد تایید ۶ رقمی را وارد کنید.';
      this.error.set(msg);
      toast.error(msg);
      this.otpInput()?.nativeElement.focus();
      return;
    }

    this.auth.verifyPhoneOtp$(this.phone(), code).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (result) => {
        const role = result.role;

        if (role === 'farmer') {
          toast.success('ورود با موفقیت انجام شد');
          from(this.router.navigateByUrl('/farmer')).subscribe();
        } else if (role === 'representative') {
          toast.success('خوش آمدید، نماینده محترم');
          from(this.router.navigateByUrl('/representative')).subscribe();
        } else if (role === 'admin') {
          this.isAdminAccount.set(true);
          toast.warning('این شماره دسترسی مدیر دارد. لطفاً از پنل مدیریت وارد شوید.');
        } else {
          const msg = 'نقش کاربری برای این شماره تعریف نشده است.';
          this.error.set(msg);
          toast.error(msg);
        }
      },
      error: (err: unknown) => {
        const msg = err instanceof AdminAuthError
          ? err.userMessage
          : 'کد تایید وارد شده صحیح نیست یا منقضی شده است.';
        this.error.set(msg);
        toast.error(msg);
      },
    });
  }

  protected resendOtp(): void {
    this.error.set('');

    this.auth.loginPhone$(this.phone()).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.startCountdown(120);
        this.otpCode.set('');
        toast.success('کد تایید مجدداً ارسال شد.');
        this.otpInput()?.nativeElement.focus();
      },
      error: (err: unknown) => {
        const msg = err instanceof AdminAuthError ? err.userMessage : 'ارسال مجدد کد با خطا مواجه شد.';
        this.error.set(msg);
        toast.error(msg);
      },
    });
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
