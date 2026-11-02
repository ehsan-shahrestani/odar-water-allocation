import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { normalizeDigits, normalizeIranianMobile } from '../../core/auth.service';

interface ArcaptchaApi {
  render(selector: string, options: Record<string, unknown>): string | number;
  reset(id: string | number): void;
}

@Component({
  selector: 'app-register-well',
  imports: [RouterLink, FormField],
  template: `
    <main dir="rtl" class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <a routerLink="/login" class="mb-6 inline-flex min-h-11 items-center self-start font-bold text-primary underline underline-offset-4">بازگشت به ورود</a>
      <section class="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
        <h1 class="text-xl font-bold text-brand-strong">درخواست ثبت چاه</h1>
        <p class="mt-2 text-sm leading-7 text-ink-muted">اطلاعات خود را وارد کنید تا با شما تماس بگیریم.</p>
        @if (success()) {
          <div role="status" class="mt-6 rounded-xl bg-green-50 p-4 leading-7 text-green-900">درخواست شما ثبت شد. برای هماهنگی با شما تماس می‌گیریم.</div>
          <a routerLink="/login" class="mt-5 inline-flex min-h-11 items-center font-bold text-primary underline">بازگشت به ورود</a>
        } @else {
          <form class="mt-6 flex flex-col gap-4" (submit)="send(); $event.preventDefault()" novalidate>
            <label class="flex flex-col gap-2 font-semibold">نام و نام خانوادگی<input class="registration-input" autocomplete="name" [formField]="fields.fullName" /></label>
            <label class="flex flex-col gap-2 font-semibold">شماره تلفن<input class="registration-input" type="tel" inputmode="tel" dir="ltr" autocomplete="tel" [formField]="fields.phone" /></label>
            <label class="flex flex-col gap-2 font-semibold">نام چاه<input class="registration-input" [formField]="fields.wellName" /></label>
            <label class="flex flex-col gap-2 font-semibold">تعداد کشاورزان<input class="registration-input" inputmode="numeric" dir="ltr" [formField]="fields.farmerCount" /></label>
            <div id="well-registration-captcha" class="min-h-16" aria-label="تأیید امنیتی"></div>
            @if (error()) { <p role="alert" class="rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">{{ error() }}</p> }
            <button type="submit" [disabled]="submitting()" class="min-h-12 rounded-xl bg-primary px-5 font-bold text-white disabled:opacity-60">{{ submitting() ? 'در حال ثبت درخواست…' : 'ثبت درخواست' }}</button>
          </form>
        }
      </section>
    </main>
  `,
  styles: `.registration-input { width:100%; min-height:48px; border:1px solid var(--line); border-radius:12px; background:var(--surface); color:var(--ink); padding:10px 12px; font-size:16px; font-weight:400; } .registration-input:focus-visible { outline:3px solid var(--forest-600); outline-offset:2px; }`,
})
export class RegisterWellComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly model = signal({ fullName: '', phone: '', wellName: '', farmerCount: '' });
  protected readonly fields = form(this.model, p => { required(p.fullName); maxLength(p.fullName, 120); required(p.phone); maxLength(p.phone, 15); required(p.wellName); maxLength(p.wellName, 120); required(p.farmerCount); maxLength(p.farmerCount, 6); });
  protected readonly error = signal('');
  protected readonly success = signal(false);
  protected readonly submitting = signal(false);
  private token = '';
  private widget: string | number | undefined;
  private get api(): ArcaptchaApi | undefined { return (window as unknown as { arcaptcha?: ArcaptchaApi }).arcaptcha; }

  constructor() {
    afterNextRender(() => this.loadCaptcha());
  }

  private loadCaptcha(): void {
    const render = () => {
      if (this.destroyRef.destroyed) return;
      if (!this.api) { this.error.set('بارگذاری تأیید امنیتی ناموفق بود. صفحه را دوباره باز کنید.'); return; }
      this.widget = this.api.render('#well-registration-captcha', {
        'site-key': '01zeowupaq', lang: 'fa',
        callback: (token?: string) => { this.token = token || ''; this.error.set(''); },
        expired_callback: () => { this.token = ''; },
        chlexpired_callback: () => { this.token = ''; },
        reset_callback: () => { this.token = ''; },
        error_callback: () => { this.token = ''; this.error.set('بارگذاری تأیید امنیتی ناموفق بود. صفحه را دوباره باز کنید.'); },
      });
    };
    if (this.api) { render(); return; }
    const script = document.createElement('script');
    script.src = 'https://widget.arcaptcha.ir/1/api.js';
    script.async = true;
    script.onload = render;
    script.onerror = () => { if (!this.destroyRef.destroyed) this.error.set('بارگذاری تأیید امنیتی ناموفق بود. صفحه را دوباره باز کنید.'); };
    document.head.appendChild(script);
    this.destroyRef.onDestroy(() => { script.onload = null; script.onerror = null; });
  }

  protected async send(): Promise<void> {
    if (this.submitting()) return;
    this.error.set('');
    const { fullName, phone, wellName, farmerCount } = this.model();
    const normalized = normalizeIranianMobile(phone);
    const countText = normalizeDigits(farmerCount).trim();
    const count = Number(countText);
    if (this.fields().invalid() || fullName.trim().length < 2 || wellName.trim().length < 2 || !normalized || !/^\d+$/.test(countText) || !Number.isInteger(count) || count < 1 || count > 100000) {
      this.error.set('نام، شماره تلفن، نام چاه و تعداد کشاورزان معتبر را وارد کنید.'); return;
    }
    if (!this.token) { this.error.set('لطفاً تأیید امنیتی را انجام دهید.'); return; }
    this.submitting.set(true);
    try {
      const { error } = await this.supabase.functions.invoke('submit-well-registration', { body: { fullName: fullName.trim(), phone: normalized, wellName: wellName.trim(), farmerCount: count, captchaToken: this.token } });
      if (error) throw error;
      this.success.set(true);
    } catch {
      this.error.set('ثبت درخواست انجام نشد. تأیید امنیتی را دوباره انجام دهید و تلاش کنید.');
      this.token = '';
      if (this.widget !== undefined) this.api?.reset(this.widget);
    } finally { this.submitting.set(false); }
  }
}
