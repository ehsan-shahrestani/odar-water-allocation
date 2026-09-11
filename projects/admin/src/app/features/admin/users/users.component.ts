import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';
import { AdminDataService } from '../../../core/admin-data.service';
import { UserProfile, UserRole } from '@core/auth.model';

@Component({
  selector: 'app-admin-users',
  imports: [FormsModule],
  template: `
    <div class="users-page space-y-6">
      <!-- Top Title & Action Header -->
      <div class="page-top-bar">
        <div>
          <h2 class="section-title">مدیریت کاربران</h2>
          <p class="section-desc">مشاهده، جستجو، تخصیص نقش و ایجاد کاربران سامانه</p>
        </div>
        <button
          type="button"
          class="btn-primary"
          (click)="openAddUserModal()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>افزودن کاربر جدید</span>
        </button>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="filter-card">
        <div class="search-input-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            class="search-input"
            placeholder="جستجو بر اساس نام یا شماره تلفن..."
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
          />
        </div>

        <div class="filter-group">
          <!-- Role Filters -->
          <div class="role-tabs">
            @for (tab of roleTabs; track tab.key) {
              <button
                type="button"
                class="role-tab"
                [class.active]="selectedRole() === tab.key"
                (click)="setRoleFilter(tab.key)"
              >
                {{ tab.label }}
              </button>
            }
          </div>

          <!-- Status Filter -->
          <select
            class="status-select"
            [ngModel]="selectedStatus()"
            (ngModelChange)="selectedStatus.set($event)"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="active">فقط فعال</option>
            <option value="inactive">فقط غیرفعال</option>
          </select>
        </div>
      </div>

      <!-- Users Table (Desktop) & Cards (Mobile) -->
      <div class="table-container">
        @if (isLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <span>در حال بارگذاری اطلاعات کاربران...</span>
          </div>
        } @else if (filteredUsers().length === 0) {
          <div class="empty-state">
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <h3 class="text-base font-bold text-gray-700">کاربری با این مشخصات یافت نشد</h3>
            <p class="text-xs text-gray-500 mt-1">عبارت جستجو یا فیلترهای اعمال‌شده را تغییر دهید.</p>
          </div>
        } @else {
          <table class="desktop-table">
            <thead>
              <tr>
                <th>نام کاربر</th>
                <th>شماره همراه</th>
                <th>نقش دسترسی</th>
                <th>وضعیت حساب</th>
                <th class="text-left">عملیات</th>
              </tr>
            </thead>
            <tbody>
              @for (user of filteredUsers(); track user.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="user-avatar-sm">
                        {{ user.full_name.charAt(0) }}
                      </div>
                      <div class="user-name-box">
                        <strong class="user-cell-name">{{ user.full_name }}</strong>
                        <span class="user-cell-id font-mono">شناسه: {{ user.id.slice(0, 8) }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span dir="ltr" class="font-mono text-sm text-gray-700 font-semibold">{{ user.phone }}</span>
                  </td>
                  <td>
                    <span class="badge" [class]="getRoleBadgeClass(user.role)">
                      {{ getRoleLabel(user.role) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-indicator" [class.active]="user.is_active">
                      <span class="status-dot"></span>
                      <span>{{ user.is_active ? 'فعال' : 'غیرفعال' }}</span>
                    </span>
                  </td>
                  <td>
                    <div class="actions-cell">
                      <button
                        type="button"
                        class="btn-table-action"
                        (click)="openEditUserModal(user)"
                        title="ویرایش مشخصات"
                      >
                        ویرایش
                      </button>
                      <button
                        type="button"
                        class="btn-table-action"
                        [class.text-rose-600]="user.is_active"
                        [class.text-emerald-700]="!user.is_active"
                        (click)="toggleUserActive(user)"
                      >
                        {{ user.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Card list for mobile screens -->
          <div class="mobile-cards md:hidden">
            @for (user of filteredUsers(); track user.id) {
              <div class="mobile-user-card">
                <div class="card-top">
                  <div class="flex items-center gap-2">
                    <div class="user-avatar-sm">{{ user.full_name.charAt(0) }}</div>
                    <div>
                      <strong class="text-sm font-bold text-gray-900 block">{{ user.full_name }}</strong>
                      <span dir="ltr" class="text-xs text-gray-500 font-mono">{{ user.phone }}</span>
                    </div>
                  </div>
                  <span class="badge" [class]="getRoleBadgeClass(user.role)">
                    {{ getRoleLabel(user.role) }}
                  </span>
                </div>
                <div class="card-bottom">
                  <span class="status-indicator" [class.active]="user.is_active">
                    <span class="status-dot"></span>
                    <span>{{ user.is_active ? 'فعال' : 'غیرفعال' }}</span>
                  </span>
                  <div class="flex gap-2">
                    <button type="button" class="btn-table-action" (click)="openEditUserModal(user)">ویرایش</button>
                    <button
                      type="button"
                      class="btn-table-action"
                      [class.text-rose-600]="user.is_active"
                      [class.text-emerald-700]="!user.is_active"
                      (click)="toggleUserActive(user)"
                    >
                      {{ user.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی' }}
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Add/Edit User Modal -->
      @if (showModal()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeModal()" aria-label="بستن پنجره"></button>
          <div class="modal-card">
            <div class="modal-header">
              <h3 id="user-modal-title" class="modal-title">{{ isEditing() ? 'ویرایش کاربر' : 'افزودن کاربر جدید' }}</h3>
              <button type="button" class="modal-close-btn" (click)="closeModal()" aria-label="بستن پنجره">✕</button>
            </div>

            <form (submit)="saveUser(); $event.preventDefault()" class="modal-body space-y-4">
              <div>
                <label for="form-name" class="form-label">نام و نام خانوادگی <span class="text-rose-500">*</span></label>
                <input
                  id="form-name"
                  type="text"
                  class="form-input"
                  placeholder="مثال: علی محمدی"
                  required
                  [ngModel]="formName()"
                  (ngModelChange)="formName.set($event)"
                  name="formName"
                />
              </div>

              <div>
                <label for="form-phone" class="form-label">شماره همراه <span class="text-rose-500">*</span></label>
                <input
                  id="form-phone"
                  type="tel"
                  dir="ltr"
                  class="form-input font-mono text-left"
                  placeholder="09123456789"
                  required
                  [ngModel]="formPhone()"
                  (ngModelChange)="formPhone.set($event)"
                  name="formPhone"
                />
              </div>

              <div>
                <label for="form-role" class="form-label">نقش کاربر در سامانه</label>
                <select
                  id="form-role"
                  class="form-select"
                  [ngModel]="formRole()"
                  (ngModelChange)="formRole.set($event)"
                  name="formRole"
                >
                  <option value="farmer">کشاورز (بهره‌بردار چاه)</option>
                  <option value="representative">نماینده چاه (مدیریت سهمیه و نوبت‌دهی)</option>
                  <option value="admin">مدیر کل سیستم</option>
                </select>
              </div>

              <div class="flex items-center gap-2 pt-2">
                <input
                  id="form-active"
                  type="checkbox"
                  class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  [ngModel]="formIsActive()"
                  (ngModelChange)="formIsActive.set($event)"
                  name="formIsActive"
                />
                <label for="form-active" class="text-sm font-medium text-gray-700 cursor-pointer">
                  حساب کاربری فعال باشد
                </label>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="closeModal()">انصراف</button>
                <button type="submit" class="btn-primary" [disabled]="isSubmitting()">
                  {{ isSubmitting() ? 'در حال ثبت...' : (isEditing() ? 'ذخیره تغییرات' : 'ایجاد کاربر') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .users-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .page-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .section-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #063722;
      margin: 0;
    }

    .section-desc {
      font-size: 0.875rem;
      color: #567064;
      margin-top: 0.25rem;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #08633f;
      color: #ffffff;
      padding: 0.65rem 1.25rem;
      border-radius: 0.75rem;
      font-weight: 600;
      font-size: 0.9rem;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(8, 99, 63, 0.25);
      transition: all 0.18s ease;
    }

    .btn-primary:hover:not(:disabled) {
      background: #07482d;
      transform: translateY(-1px);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      background: #e2ece5;
      color: #173b2b;
      padding: 0.65rem 1.25rem;
      border-radius: 0.75rem;
      font-weight: 600;
      font-size: 0.9rem;
      border: none;
      cursor: pointer;
    }

    .btn-secondary:hover {
      background: #d4e3d8;
    }

    /* Filters Card */
    .filter-card {
      background: #ffffff;
      border: 1px solid #dce8e0;
      border-radius: 1rem;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      box-shadow: 0 2px 8px rgba(7, 72, 45, 0.04);
    }

    .search-input-wrap {
      position: relative;
      flex: 1;
      min-width: 260px;
    }

    .search-icon {
      position: absolute;
      right: 0.85rem;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      color: #799487;
    }

    .search-input {
      width: 100%;
      padding: 0.65rem 2.5rem 0.65rem 1rem;
      border-radius: 0.65rem;
      border: 1px solid #d4e3d8;
      background: #f9fbf9;
      font-size: 0.88rem;
      color: #173b2b;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .search-input:focus {
      border-color: #08633f;
      background: #ffffff;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .role-tabs {
      display: flex;
      background: #edf5f0;
      padding: 3px;
      border-radius: 0.6rem;
    }

    .role-tab {
      background: transparent;
      border: none;
      padding: 0.45rem 0.85rem;
      border-radius: 0.5rem;
      font-size: 0.82rem;
      font-weight: 600;
      color: #567064;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .role-tab.active {
      background: #ffffff;
      color: #08633f;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
    }

    .status-select {
      padding: 0.5rem 0.85rem;
      border-radius: 0.6rem;
      border: 1px solid #d4e3d8;
      background: #ffffff;
      font-size: 0.84rem;
      color: #173b2b;
      outline: none;
    }

    /* Table */
    .table-container {
      background: #ffffff;
      border: 1px solid #dce8e0;
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(7, 72, 45, 0.04);
    }

    .desktop-table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
    }

    @media (max-width: 768px) {
      .desktop-table {
        display: none;
      }
    }

    .desktop-table th {
      background: #f8faf9;
      padding: 1rem 1.25rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: #567064;
      border-bottom: 1px solid #e5ede7;
    }

    .desktop-table td {
      padding: 1rem 1.25rem;
      font-size: 0.88rem;
      border-bottom: 1px solid #edf3ef;
      vertical-align: middle;
    }

    .desktop-table tr:last-child td {
      border-bottom: none;
    }

    .desktop-table tr:hover td {
      background: #fbfdfc;
    }

    .user-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-avatar-sm {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e1f5eb;
      color: #08633f;
      font-weight: 700;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .user-name-box {
      display: flex;
      flex-direction: column;
    }

    .user-cell-name {
      font-weight: 700;
      color: #173b2b;
    }

    .user-cell-id {
      font-size: 0.7rem;
      color: #8fa59b;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .badge-farmer {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }

    .badge-rep {
      background: #eff6ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
    }

    .badge-admin {
      background: #f5f3ff;
      color: #5b21b6;
      border: 1px solid #ddd6fe;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #9ca3af;
    }

    .status-indicator.active {
      color: #047857;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #d1d5db;
    }

    .status-indicator.active .status-dot {
      background: #10b981;
    }

    .actions-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .btn-table-action {
      background: transparent;
      border: none;
      font-size: 0.82rem;
      font-weight: 600;
      color: #08633f;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 0.35rem;
      transition: background 0.15s ease;
    }

    .btn-table-action:hover {
      background: #edf8f1;
    }

    /* Mobile Cards */
    .mobile-cards {
      display: none;
    }

    @media (max-width: 768px) {
      .mobile-cards {
        display: flex;
        flex-direction: column;
        divide-y: 1px solid #edf3ef;
      }
    }

    .mobile-user-card {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .card-top, .card-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Empty & Loading */
    .loading-state, .empty-state {
      padding: 3rem 1.5rem;
      text-align: center;
      color: #567064;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #d4e3d8;
      border-top-color: #08633f;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 0.75rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }

    .backdrop-dismiss {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      border: none;
      cursor: pointer;
      z-index: 1;
    }

    .modal-card {
      position: relative;
      z-index: 2;
      background: #ffffff;
      border-radius: 1.25rem;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e5ede7;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #063722;
      margin: 0;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      font-size: 1.25rem;
      color: #9ca3af;
      cursor: pointer;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .form-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #173b2b;
      margin-bottom: 0.35rem;
    }

    .form-input, .form-select {
      width: 100%;
      padding: 0.65rem 0.85rem;
      border-radius: 0.65rem;
      border: 1px solid #d4e3d8;
      background: #ffffff;
      font-size: 0.9rem;
      color: #173b2b;
      outline: none;
    }

    .form-input:focus, .form-select:focus {
      border-color: #08633f;
      box-shadow: 0 0 0 3px rgba(8, 99, 63, 0.1);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e5ede7;
    }
  `,
})
export class AdminUsersComponent {
  private readonly dataService = inject(AdminDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly refreshTrigger = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly searchQuery = signal('');
  protected readonly selectedRole = signal<string>('all');
  protected readonly selectedStatus = signal<string>('all');

  private readonly users$ = toObservable(this.refreshTrigger).pipe(
    tap(() => this.isLoading.set(true)),
    switchMap(() =>
      this.dataService.getUsers$().pipe(
        catchError((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در دریافت لیست کاربران');
          return of<UserProfile[]>([]);
        }),
        finalize(() => this.isLoading.set(false))
      )
    )
  );

  protected readonly users = toSignal(this.users$, { initialValue: [] });

  // Modal State
  protected readonly showModal = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly editingUserId = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);

  // Form Signals
  protected readonly formName = signal('');
  protected readonly formPhone = signal('');
  protected readonly formRole = signal<UserRole>('farmer');
  protected readonly formIsActive = signal(true);

  protected readonly roleTabs = [
    { key: 'all', label: 'همه نقش‌ها' },
    { key: 'farmer', label: 'کشاورزان' },
    { key: 'representative', label: 'نمایندگان' },
    { key: 'admin', label: 'مدیران' },
  ];

  protected readonly filteredUsers = computed(() => {
    let list = this.users();
    const query = this.searchQuery().trim().toLowerCase();
    const role = this.selectedRole();
    const status = this.selectedStatus();

    if (role !== 'all') {
      list = list.filter((u) => u.role === role);
    }

    if (status === 'active') {
      list = list.filter((u) => u.is_active);
    } else if (status === 'inactive') {
      list = list.filter((u) => !u.is_active);
    }

    if (query) {
      list = list.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(query) ||
          u.phone?.includes(query)
      );
    }

    return list;
  });

  protected onSearchChange(val: string): void {
    this.searchQuery.set(val);
  }

  protected setRoleFilter(role: string): void {
    this.selectedRole.set(role);
  }

  protected openAddUserModal(): void {
    this.isEditing.set(false);
    this.editingUserId.set(null);
    this.formName.set('');
    this.formPhone.set('');
    this.formRole.set('farmer');
    this.formIsActive.set(true);
    this.showModal.set(true);
  }

  protected openEditUserModal(user: UserProfile): void {
    this.isEditing.set(true);
    this.editingUserId.set(user.id);
    this.formName.set(user.full_name);
    this.formPhone.set(user.phone);
    this.formRole.set(user.role);
    this.formIsActive.set(user.is_active);
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
    this.editingUserId.set(null);
  }

  protected saveUser(): void {
    const name = this.formName().trim();
    const phone = this.formPhone().trim();

    if (!name || !phone) {
      toast.error('لطفاً نام و شماره همراه را تکمیل کنید.');
      return;
    }

    this.isSubmitting.set(true);

    if (this.isEditing() && this.editingUserId()) {
      this.dataService
        .updateUser$(this.editingUserId()!, {
          full_name: name,
          phone,
          role: this.formRole(),
          is_active: this.formIsActive(),
        })
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isSubmitting.set(false))
        )
        .subscribe({
          next: () => {
            toast.success(`مشخصات کاربر «${name}» با موفقیت به‌روزرسانی شد.`);
            this.refreshTrigger.update((v) => v + 1);
            this.closeModal();
          },
          error: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : 'خطا در ذخیره اطلاعات کاربر.');
          },
        });
    } else {
      this.dataService
        .createUser$({
          full_name: name,
          phone,
          role: this.formRole(),
          is_active: this.formIsActive(),
        })
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isSubmitting.set(false))
        )
        .subscribe({
          next: () => {
            toast.success(`کاربر جدید «${name}» با موفقیت ایجاد شد.`);
            this.refreshTrigger.update((v) => v + 1);
            this.closeModal();
          },
          error: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : 'خطا در ذخیره اطلاعات کاربر.');
          },
        });
    }
  }

  protected toggleUserActive(user: UserProfile): void {
    const newStatus = !user.is_active;
    this.dataService
      .toggleUserStatus$(user.id, newStatus)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          toast.success(
            `وضعیت حساب «${user.full_name}» به ${newStatus ? 'فعال' : 'غیرفعال'} تغییر یافت.`
          );
          this.refreshTrigger.update((v) => v + 1);
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در تغییر وضعیت حساب کاربری.');
        },
      });
  }

  protected getRoleLabel(role: UserRole): string {
    switch (role) {
      case 'farmer':
        return 'کشاورز';
      case 'representative':
        return 'نماینده چاه';
      case 'admin':
        return 'مدیر کل';
      default:
        return role;
    }
  }

  protected getRoleBadgeClass(role: UserRole): string {
    switch (role) {
      case 'farmer':
        return 'badge-farmer';
      case 'representative':
        return 'badge-rep';
      case 'admin':
        return 'badge-admin';
      default:
        return '';
    }
  }
}

