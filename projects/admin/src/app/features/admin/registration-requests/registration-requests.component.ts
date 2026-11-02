import { Component, inject, signal } from '@angular/core';
import { SupabaseService } from '@core/supabase.service';

interface RegistrationRequest { id: string; full_name: string; phone: string; well_name: string; farmer_count: number; created_at: string; }

@Component({
  selector: 'app-registration-requests',
  template: `
    <section dir="rtl" class="mx-auto max-w-5xl">
      <h2 class="text-2xl font-bold text-brand-strong">درخواست‌های ثبت چاه</h2>
      <p class="mt-2 text-sm text-ink-muted">درخواست‌های ارسال‌شده از صفحه ورود</p>
      @if (error()) { <p role="alert" class="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{{ error() }} <button class="underline" (click)="load()">تلاش دوباره</button></p> }
      @if (loading() && !requests().length) { <p role="status" class="mt-6">در حال دریافت درخواست‌ها…</p> }
      @else if (!loading() && !error() && !requests().length) { <p class="mt-6 rounded-xl border border-line bg-surface p-6">هنوز درخواستی ثبت نشده است.</p> }
      <div class="mt-6 grid gap-3">
        @for (item of requests(); track item.id) {
          <article class="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-2"><h3 class="text-lg font-bold text-brand-strong">{{ item.well_name }}</h3><time class="text-sm text-ink-muted">{{ date(item.created_at) }}</time></div>
            <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt class="text-ink-muted">نام و نام خانوادگی</dt><dd class="mt-1 font-semibold">{{ item.full_name }}</dd></div>
              <div><dt class="text-ink-muted">شماره تلفن</dt><dd class="mt-1"><a class="font-semibold text-primary underline" [href]="'tel:' + item.phone" dir="ltr">{{ item.phone }}</a></dd></div>
              <div><dt class="text-ink-muted">تعداد کشاورزان</dt><dd class="mt-1 font-semibold">{{ item.farmer_count.toLocaleString('fa-IR') }} نفر</dd></div>
            </dl>
          </article>
        }
      </div>
      @if (hasMore()) { <button type="button" class="mt-5 min-h-11 rounded-lg border border-line bg-surface px-5 font-bold" [disabled]="loading()" (click)="load()">{{ loading() ? 'در حال دریافت…' : 'درخواست‌های بیشتر' }}</button> }
    </section>
  `,
})
export class RegistrationRequestsComponent {
  private readonly supabase = inject(SupabaseService).client;
  protected readonly requests = signal<RegistrationRequest[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly hasMore = signal(false);
  constructor() { void this.load(); }
  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    const offset = this.requests().length;
    const { data, error } = await this.supabase.from('well_registration_requests').select('id, full_name, phone, well_name, farmer_count, created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 49);
    if (error) this.error.set('دریافت درخواست‌ها ناموفق بود.');
    else { this.requests.update(items => [...items, ...(data as RegistrationRequest[])]); this.hasMore.set(data.length === 50); }
    this.loading.set(false);
  }
  protected date(value: string): string { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(value)); }
}
