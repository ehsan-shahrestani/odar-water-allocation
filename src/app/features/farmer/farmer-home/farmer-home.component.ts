import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { FarmerDashboardData, PortalDataService } from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { CardComponent } from '../../../shared/card/card.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';
import { faNumber } from '../../../core/mock-data';

@Component({
  selector: 'app-farmer-home',
  imports: [CardComponent, PageHeaderComponent, ButtonComponent],
  template: `
    <app-page-header
      eyebrow="اُدار · خانه کشاورز"
      [title]="farmerName()"
      [subtitle]="dashboard()?.well?.name || 'در انتظار اتصال به چاه'"
    />

    <div class="page-content space-y-5">
      @if (loading()) {
        <div class="card p-8 text-center space-y-3">
          <div class="loading-spinner mx-auto" aria-hidden="true"></div>
          <p class="text-sm text-ink-muted">در حال دریافت اطلاعات سهمیه و چاه از سامانه…</p>
        </div>
      } @else if (error()) {
        <div class="card p-6 border-red-200 bg-red-50 text-red-700 text-center space-y-3">
          <p class="font-medium">{{ error() }}</p>
          <button app-button variant="secondary" (click)="loadData()">تلاش مجدد</button>
        </div>
      } @else if (!dashboard()?.well) {
        <app-card>
          <div class="py-6 text-center space-y-3">
            <span class="text-4xl" aria-hidden="true">🌾</span>
            <h2 class="text-lg font-bold text-ink">به سامانه اُدار خوش آمدید</h2>
            <p class="text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
              حساب شما با موفقیت فعال شده است، اما هنوز به هیچ چاه کشاورزی متصل نشده‌اید.
              لطفاً با <strong>نماینده چاه</strong> یا <strong>مدیر سامانه</strong> تماس بگیرید تا چاه و سهمیه شما ثبت شود.
            </p>
            <div class="pt-2">
              <button app-button variant="secondary" (click)="loadData()">
                بررسی مجدد اتصال
              </button>
            </div>
          </div>
        </app-card>
      } @else {
        <!-- Quota Balance Card -->
        <app-card [emphasis]="true">
          <p class="balance-label">مانده سهمیه آب شما</p>
          <div class="balance-number">
            {{ number(dashboard()?.remainingHours ?? 0) }} <span>ساعت</span>
          </div>
          <div class="quota-summary">
            <div>
              <span>سهمیه کل</span>
              <strong>{{ number(dashboard()?.quotaHours ?? 0) }} <small>ساعت</small></strong>
            </div>
            <div>
              <span>مصرف‌شده</span>
              <strong>{{ number(dashboard()?.usedHours ?? 0) }} <small>ساعت</small></strong>
            </div>
          </div>
        </app-card>

        <!-- Water Year Info Card -->
        @if (dashboard()?.waterYear; as wy) {
          <app-card>
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-forest-100">
              <h2 class="font-bold text-forest-900">{{ wy.name }}</h2>
              <span class="text-xs bg-mint-100 text-primary px-2 py-0.5 rounded-full font-medium">سال آبی جاری</span>
            </div>
            <dl class="year-dates">
              <div>
                <dt>تاریخ شروع</dt>
                <dd>{{ wy.start }}</dd>
              </div>
              <div>
                <dt>تاریخ پایان</dt>
                <dd>{{ wy.end }}</dd>
              </div>
            </dl>
            @if (wy.description) {
              <p class="year-description">{{ wy.description }}</p>
            }
          </app-card>
        } @else {
          <app-card>
            <p class="text-sm text-ink-muted text-center py-2">
              هنوز سال آبی فعالی برای این چاه تعریف نشده است.
            </p>
          </app-card>
        }

        <!-- Recent Usages Section -->
        <section aria-labelledby="usage-heading">
          <h2 id="usage-heading" class="section-title">گزارش مصرف‌های اخیر</h2>
          <app-card>
            @if (dashboard()?.recentUsages?.length) {
              <ul class="divided-list">
                @for (usage of dashboard()?.recentUsages; track usage.id) {
                  <li>
                    <div>
                      <span>{{ usage.date }}</span>
                      @if (usage.description) {
                        <p class="text-xs text-ink-muted mt-0.5">{{ usage.description }}</p>
                      }
                    </div>
                    <strong>{{ number(usage.hours) }} <small>ساعت</small></strong>
                  </li>
                }
              </ul>
            } @else {
              <p class="empty-state">هنوز هیچ مصرف آبی برای شما در این سال آبی ثبت نشده است.</p>
            }
          </app-card>
        </section>
      }

      <div class="pt-4 text-center">
        <button
          app-button
          variant="secondary"
          type="button"
          (click)="logout()"
          class="text-xs"
        >
          خروج از حساب کاربری
        </button>
      </div>
    </div>
  `,
})
export class FarmerHomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dashboard = signal<FarmerDashboardData | null>(null);
  protected readonly number = faNumber;

  protected get farmerName(): () => string {
    return () => this.auth.currentProfile()?.full_name || 'کشاورز محترم';
  }

  ngOnInit(): void {
    void this.loadData();
  }

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const profile = this.auth.currentProfile();
      if (!profile?.id) {
        // Wait or re-fetch profile
        await this.auth.initializeSession();
      }

      const currentId = this.auth.currentProfile()?.id;
      if (!currentId) {
        throw new Error('اطلاعات کاربری یافت نشد. لطفاً مجدداً وارد شوید.');
      }

      const data = await this.portalData.getFarmerDashboard(currentId);
      this.dashboard.set(data);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات سامانه');
    } finally {
      this.loading.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}
