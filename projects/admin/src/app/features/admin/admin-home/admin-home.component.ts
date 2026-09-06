import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminDataService } from '../../../core/admin-data.service';
import { faNumber } from '@core/mock-data';

@Component({
  selector: 'app-admin-home',
  imports: [RouterLink],
  template: `
    <div class="dashboard-page space-y-6">
      <!-- Welcome Header Banner -->
      <div class="dashboard-banner">
        <div class="banner-content">
          <span class="banner-tag">میز کار مدیر کل</span>
          <h2 class="banner-title">سامانه مدیریت منابع و سهمیه‌بندی آب کشاورزی</h2>
          <p class="banner-desc">
            پایش و مدیریت یکپارچه چاه‌ها، سال‌های آبی، نمایندگان و سهمیه‌بندی آب کشاورزان
          </p>
        </div>
        <div class="banner-actions">
          <a routerLink="/admin/wells" class="btn-banner-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>مدیریت چاه‌ها</span>
          </a>
          <a routerLink="/admin/users" class="btn-banner-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
            <span>مدیریت کاربران</span>
          </a>
        </div>
      </div>

      <!-- Stat Cards Grid -->
      <div class="stats-grid">
        <!-- Wells Stat Card -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">تعداد کل چاه‌ها</span>
            <div class="stat-icon-box bg-emerald-50 text-emerald-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
              </svg>
            </div>
          </div>
          <div class="stat-value">{{ number(stats().totalWells) }}</div>
          <div class="stat-footer">
            <a routerLink="/admin/wells" class="stat-link">
              <span>مشاهده و مدیریت چاه‌ها</span>
              <span aria-hidden="true">←</span>
            </a>
          </div>
        </div>

        <!-- Total Users Stat Card -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">کل کاربران سامانه</span>
            <div class="stat-icon-box bg-blue-50 text-blue-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
            </div>
          </div>
          <div class="stat-value">{{ number(stats().totalUsers) }}</div>
          <div class="stat-footer">
            <a routerLink="/admin/users" class="stat-link">
              <span>مشاهده لیست کاربران</span>
              <span aria-hidden="true">←</span>
            </a>
          </div>
        </div>

        <!-- Farmers Stat Card -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">کشاورزان بهره‌بردار</span>
            <div class="stat-icon-box bg-teal-50 text-teal-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
          </div>
          <div class="stat-value">{{ number(stats().farmersCount) }}</div>
          <div class="stat-footer">
            <span class="stat-sub">دارای سهمیه فعال در چاه‌ها</span>
          </div>
        </div>

        <!-- Representatives Stat Card -->
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">نمایندگان چاه</span>
            <div class="stat-icon-box bg-indigo-50 text-indigo-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="19" y1="8" x2="19" y2="14"></line>
                <line x1="22" y1="11" x2="16" y2="11"></line>
              </svg>
            </div>
          </div>
          <div class="stat-value">{{ number(stats().repsCount) }}</div>
          <div class="stat-footer">
            <span class="stat-sub">مسئولین ثبت و تنظیم نوبت‌ها</span>
          </div>
        </div>
      </div>

      <!-- Quick Overview Tables Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Recent Wells Section -->
        <div class="dashboard-panel">
          <div class="panel-header">
            <h3 class="panel-title">چاه‌های فعال سامانه</h3>
            <a routerLink="/admin/wells" class="panel-link">مشاهده همه</a>
          </div>

          <div class="panel-body">
            @if (wells().length === 0) {
              <p class="empty-panel-text">هیچ چاهی ثبت نشده است.</p>
            } @else {
              <div class="space-y-3">
                @for (well of wells().slice(0, 4); track well.id) {
                  <div class="panel-item">
                    <div class="panel-item-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-emerald-700">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                      </svg>
                    </div>
                    <div class="panel-item-info">
                      <strong class="panel-item-title">{{ well.name }}</strong>
                      <span class="panel-item-sub">نماینده: {{ well.representative_name || 'ثبت نشده' }}</span>
                    </div>
                    <div class="panel-item-badge">
                      <span>{{ well.farmer_count || 0 }} کشاورز</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Recent Users Section -->
        <div class="dashboard-panel">
          <div class="panel-header">
            <h3 class="panel-title">کاربران اخیر</h3>
            <a routerLink="/admin/users" class="panel-link">مشاهده همه</a>
          </div>

          <div class="panel-body">
            @if (users().length === 0) {
              <p class="empty-panel-text">هیچ کاربری یافت نشد.</p>
            } @else {
              <div class="space-y-3">
                @for (user of users().slice(0, 4); track user.id) {
                  <div class="panel-item">
                    <div class="user-avatar-tiny">
                      {{ user.full_name.charAt(0) }}
                    </div>
                    <div class="panel-item-info">
                      <strong class="panel-item-title">{{ user.full_name }}</strong>
                      <span dir="ltr" class="panel-item-sub font-mono">{{ user.phone }}</span>
                    </div>
                    <div class="panel-item-badge">
                      <span>{{ getRoleLabel(user.role) }}</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .dashboard-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Banner */
    .dashboard-banner {
      background: linear-gradient(135deg, #063722 0%, #08633f 60%, #0e7d50 100%);
      color: #ffffff;
      border-radius: 1.25rem;
      padding: 1.75rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1.5rem;
      box-shadow: 0 12px 32px rgba(7, 72, 45, 0.18);
      position: relative;
      overflow: hidden;
    }

    .dashboard-banner::after {
      content: '';
      position: absolute;
      left: -40px;
      bottom: -60px;
      width: 200px;
      height: 200px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      pointer-events: none;
    }

    .banner-tag {
      display: inline-block;
      background: rgba(255, 255, 255, 0.16);
      color: #86efac;
      padding: 0.2rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .banner-title {
      font-size: 1.45rem;
      font-weight: 800;
      line-height: 1.35;
      margin: 0;
    }

    .banner-desc {
      font-size: 0.88rem;
      color: #d1fae5;
      margin-top: 0.4rem;
      max-width: 600px;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .btn-banner-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #ffffff;
      color: #063722;
      padding: 0.65rem 1.25rem;
      border-radius: 0.75rem;
      font-weight: 700;
      font-size: 0.88rem;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
      transition: all 0.15s ease;
    }

    .btn-banner-primary:hover {
      background: #f0fdf4;
      transform: translateY(-1px);
    }

    .btn-banner-secondary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      padding: 0.65rem 1.25rem;
      border-radius: 0.75rem;
      font-weight: 600;
      font-size: 0.88rem;
      text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.25);
      transition: all 0.15s ease;
    }

    .btn-banner-secondary:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1.25rem;
    }

    .stat-card {
      background: #ffffff;
      border: 1px solid #dce8e0;
      border-radius: 1.15rem;
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      box-shadow: 0 4px 16px rgba(7, 72, 45, 0.04);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(7, 72, 45, 0.08);
    }

    .stat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .stat-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: #567064;
    }

    .stat-icon-box {
      width: 36px;
      height: 36px;
      border-radius: 0.65rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-value {
      font-size: 1.95rem;
      font-weight: 800;
      color: #063722;
      line-height: 1.2;
    }

    .stat-footer {
      border-top: 1px solid #f0f5f2;
      padding-top: 0.65rem;
      margin-top: 0.25rem;
    }

    .stat-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      font-weight: 700;
      color: #08633f;
      text-decoration: none;
    }

    .stat-link:hover {
      text-decoration: underline;
    }

    .stat-sub {
      font-size: 0.75rem;
      color: #799487;
    }

    /* Panels */
    .dashboard-panel {
      background: #ffffff;
      border: 1px solid #dce8e0;
      border-radius: 1.15rem;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(7, 72, 45, 0.04);
    }

    .panel-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #edf3ef;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fafdfb;
    }

    .panel-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: #063722;
      margin: 0;
    }

    .panel-link {
      font-size: 0.8rem;
      font-weight: 600;
      color: #08633f;
      text-decoration: none;
    }

    .panel-body {
      padding: 1.25rem 1.5rem;
    }

    .empty-panel-text {
      font-size: 0.85rem;
      color: #8fa59b;
      text-align: center;
      padding: 1.5rem 0;
    }

    .panel-item {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.65rem 0.85rem;
      border-radius: 0.75rem;
      background: #f9fbf9;
      border: 1px solid #eef4f0;
      transition: background 0.15s ease;
    }

    .panel-item:hover {
      background: #f2f8f4;
    }

    .panel-item-icon {
      width: 32px;
      height: 32px;
      background: #e2f4ea;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .user-avatar-tiny {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #d1fae5;
      color: #065f46;
      font-weight: 700;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .panel-item-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .panel-item-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: #173b2b;
    }

    .panel-item-sub {
      font-size: 0.72rem;
      color: #6d887a;
    }

    .panel-item-badge {
      background: #edf8f1;
      color: #08633f;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      font-size: 0.72rem;
      font-weight: 700;
    }
  `,
})
export class AdminHomeComponent {
  private readonly dataService = inject(AdminDataService);

  protected readonly number = faNumber;

  private readonly dashboardData$ = forkJoin({
    stats: this.dataService.getDashboardStats$(),
    wells: this.dataService.getWells$(),
    users: this.dataService.getUsers$(),
  });

  private readonly dashboardData = toSignal(this.dashboardData$, {
    initialValue: {
      stats: {
        totalWells: 0,
        totalUsers: 0,
        farmersCount: 0,
        repsCount: 0,
        adminsCount: 0,
        activeWaterYears: 0,
      },
      wells: [],
      users: [],
    },
  });

  protected readonly stats = computed(() => this.dashboardData().stats);
  protected readonly wells = computed(() => this.dashboardData().wells);
  protected readonly users = computed(() => this.dashboardData().users);

  protected getRoleLabel(role: string): string {
    switch (role) {
      case 'farmer':
        return 'کشاورز';
      case 'representative':
        return 'نماینده';
      case 'admin':
        return 'مدیر کل';
      default:
        return role;
    }
  }
}

