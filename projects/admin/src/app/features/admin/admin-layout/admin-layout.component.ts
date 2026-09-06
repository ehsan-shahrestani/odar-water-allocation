import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../../../core/admin-auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin-shell">
      <!-- Mobile Backdrop Overlay -->
      @if (sidebarOpen()) {
        <div
          class="mobile-backdrop"
          (click)="toggleSidebar(false)"
          aria-hidden="true"
        ></div>
      }

      <!-- Sidebar -->
      <aside
        class="admin-sidebar"
        [class.open]="sidebarOpen()"
        aria-label="ناوبری اصلی پنل مدیریت"
      >
        <div class="sidebar-header">
          <div class="brand-badge">
            <svg
              class="brand-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
            </svg>
            <div class="brand-text">
              <span class="brand-title">سامانه اُدار</span>
              <span class="brand-subtitle">پنل مدیریت یکپارچه</span>
            </div>
          </div>
          <button
            type="button"
            class="sidebar-close-btn lg:hidden"
            (click)="toggleSidebar(false)"
            aria-label="بستن منو"
          >
            ✕
          </button>
        </div>

        <nav class="sidebar-nav">
          <a
            routerLink="/admin"
            [routerLinkActiveOptions]="{ exact: true }"
            routerLinkActive="nav-item-active"
            (click)="toggleSidebar(false)"
            class="nav-item"
          >
            <svg
              class="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>داشبورد و آمار</span>
          </a>

          <a
            routerLink="/admin/users"
            routerLinkActive="nav-item-active"
            (click)="toggleSidebar(false)"
            class="nav-item"
          >
            <svg
              class="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>مدیریت کاربران</span>
          </a>

          <a
            routerLink="/admin/wells"
            routerLinkActive="nav-item-active"
            (click)="toggleSidebar(false)"
            class="nav-item"
          >
            <svg
              class="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
            </svg>
            <span>مدیریت چاه‌ها</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="user-chip">
            <div class="user-avatar" aria-hidden="true">
              {{ userInitial() }}
            </div>
            <div class="user-details">
              <span class="user-name">{{ userName() }}</span>
              <span class="user-role">مدیر کل سیستم</span>
            </div>
          </div>
          <button
            type="button"
            class="logout-btn"
            (click)="onLogout()"
            aria-label="خروج از حساب کاربری"
          >
            <svg
              class="logout-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>خروج</span>
          </button>
        </div>
      </aside>

      <!-- Main Layout Column -->
      <div class="admin-main">
        <!-- Topbar -->
        <header class="admin-topbar">
          <div class="topbar-right">
            <button
              type="button"
              class="hamburger-btn lg:hidden"
              (click)="toggleSidebar(true)"
              aria-label="باز کردن منوی ناوبری"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div class="page-title-wrap">
              <h1 class="topbar-title">میز کار ادمین اُدار</h1>
              <span class="topbar-subtitle">مدیریت سهمیه و چاه‌های کشاورزی</span>
            </div>
          </div>

          <div class="topbar-left">
            <div class="today-date-badge">
              <svg class="w-4 h-4 text-emerald-700 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>{{ todayFa() }}</span>
            </div>

            <div class="admin-profile-pill hidden sm:flex">
              <span class="status-dot"></span>
              <span class="text-xs font-semibold text-emerald-950">{{ userName() }}</span>
            </div>
          </div>
        </header>

        <!-- Dynamic Content Outlet -->
        <div class="content-scrollable">
          <div class="admin-container">
            <router-outlet />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }

    .admin-shell {
      display: flex;
      width: 100%;
      height: 100vh;
      background: #f3f7f4;
      position: relative;
    }

    /* Sidebar Styles */
    .admin-sidebar {
      width: 270px;
      height: 100%;
      background: #063722;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      z-index: 50;
      transition: transform 0.25s ease-in-out;
    }

    @media (max-width: 1023px) {
      .admin-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        transform: translateX(100%);
        box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);
      }
      .admin-sidebar.open {
        transform: translateX(0);
      }
    }

    .mobile-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 40;
    }

    .sidebar-header {
      padding: 1.5rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .brand-badge {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-icon {
      width: 32px;
      height: 32px;
      color: #4ade80;
      background: rgba(74, 222, 128, 0.15);
      padding: 6px;
      border-radius: 10px;
    }

    .brand-title {
      display: block;
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.5px;
      color: #ffffff;
      line-height: 1.3;
    }

    .brand-subtitle {
      display: block;
      font-size: 0.75rem;
      color: #86efac;
    }

    .sidebar-close-btn {
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 4px;
    }

    /* Sidebar Navigation */
    .sidebar-nav {
      flex: 1;
      padding: 1.25rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow-y: auto;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      color: #d1fae5;
      font-size: 0.93rem;
      font-weight: 500;
      transition: all 0.18s ease;
      text-decoration: none;
    }

    .nav-icon {
      width: 20px;
      height: 20px;
      color: #86efac;
      transition: transform 0.18s ease;
    }

    .nav-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }

    .nav-item:hover .nav-icon {
      transform: scale(1.1);
    }

    .nav-item-active {
      background: #08633f !important;
      color: #ffffff !important;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(8, 99, 63, 0.4);
    }

    .nav-item-active .nav-icon {
      color: #4ade80;
    }

    /* Sidebar Footer */
    .sidebar-footer {
      padding: 1.25rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #10b981;
      color: #064e3b;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
    }

    .user-details {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }

    .user-name {
      font-size: 0.88rem;
      font-weight: 700;
      color: #ffffff;
    }

    .user-role {
      font-size: 0.72rem;
      color: #9ca3af;
    }

    .logout-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.55rem;
      border-radius: 0.5rem;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.22);
      color: #fee2e2;
    }

    .logout-icon {
      width: 16px;
      height: 16px;
    }

    /* Main Area */
    .admin-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* Topbar */
    .admin-topbar {
      height: 68px;
      background: #ffffff;
      border-bottom: 1px solid #e2ece5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1.5rem;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(7, 72, 45, 0.03);
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .hamburger-btn {
      background: transparent;
      border: none;
      color: #173b2b;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
    }

    .page-title-wrap {
      display: flex;
      flex-direction: column;
    }

    .topbar-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #173b2b;
      line-height: 1.25;
      margin: 0;
    }

    .topbar-subtitle {
      font-size: 0.75rem;
      color: #567064;
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .today-date-badge {
      display: flex;
      align-items: center;
      background: #edf8f1;
      color: #064e3b;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid #d0ebd8;
    }

    .admin-profile-pill {
      align-items: center;
      gap: 0.5rem;
      background: #f4f8f5;
      padding: 0.4rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid #e2ece5;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
    }

    /* Content Area */
    .content-scrollable {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .admin-container {
      max-width: 1320px;
      margin: 0 auto;
      width: 100%;
    }

    @media (max-width: 640px) {
      .admin-topbar {
        padding: 0 1rem;
      }
      .content-scrollable {
        padding: 1rem 0.75rem;
      }
    }
  `,
})
export class AdminLayoutComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  protected readonly sidebarOpen = signal(false);

  protected readonly userName = computed(() => {
    return this.auth.currentProfile()?.full_name || 'مدیر کل';
  });

  protected readonly userInitial = computed(() => {
    const name = this.userName();
    return name ? name.charAt(0) : 'م';
  });

  protected readonly todayFa = computed(() => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'full',
      }).format(new Date());
    } catch {
      return 'امروز';
    }
  });

  protected toggleSidebar(open: boolean): void {
    this.sidebarOpen.set(open);
  }

  protected async onLogout(): Promise<void> {
    await this.auth.logout();
  }
}
