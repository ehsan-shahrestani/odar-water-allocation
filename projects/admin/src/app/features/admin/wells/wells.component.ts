import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';
import { AdminDataService, AdminWell } from '../../../core/admin-data.service';
import { UserProfile } from '@core/auth.model';

@Component({
  selector: 'app-admin-wells',
  imports: [FormsModule],
  template: `
    <div class="wells-page space-y-6">
      <!-- Top Title & Action Header -->
      <div class="page-top-bar">
        <div>
          <h2 class="section-title">مدیریت چاه‌ها</h2>
          <p class="section-desc">مشاهده، ایجاد، ویرایش و مدیریت چاه‌های کشاورزی سامانه</p>
        </div>
        <button
          type="button"
          class="btn-primary"
          (click)="openAddWellModal()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>افزودن چاه جدید</span>
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
            placeholder="جستجو بر اساس نام چاه یا نام نماینده..."
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
          />
        </div>
      </div>

      <!-- Wells Table (Desktop) & Cards (Mobile) -->
      <div class="table-container">
        @if (isLoading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <span>در حال بارگذاری اطلاعات چاه‌ها...</span>
          </div>
        } @else if (filteredWells().length === 0) {
          <div class="empty-state">
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
            <h3 class="text-base font-bold text-gray-700">چاهی با این مشخصات یافت نشد</h3>
            <p class="text-xs text-gray-500 mt-1">با زدن دکمه «افزودن چاه جدید» می‌توانید چاه ثبت کنید.</p>
          </div>
        } @else {
          <table class="desktop-table">
            <thead>
              <tr>
                <th>نام چاه</th>
                <th>نماینده مسئول</th>
                <th>کشاورزان تحت پوشش</th>
                <th>سال آبی فعال</th>
                <th>توضیحات</th>
                <th class="text-left">عملیات</th>
              </tr>
            </thead>
            <tbody>
              @for (well of filteredWells(); track well.id) {
                <tr class="clickable-row" (click)="navigateToWell(well.id)">
                  <td>
                    <div class="well-cell">
                      <div class="well-avatar-sm">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-emerald-700">
                          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                          <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
                        </svg>
                      </div>
                      <div class="well-name-box">
                        <strong class="well-cell-name">{{ well.name }}</strong>
                        <span class="well-cell-id font-mono">شناسه: {{ well.id.slice(0, 8) }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="flex items-center justify-between gap-2">
                      @if (well.representative_name) {
                        <div class="rep-cell">
                          <span class="font-semibold text-gray-900 text-xs">{{ well.representative_name }}</span>
                          @if (well.representative_phone) {
                            <span dir="ltr" class="text-[11px] text-gray-500 font-mono">{{ well.representative_phone }}</span>
                          }
                        </div>
                      } @else {
                        <span class="text-xs text-gray-400 font-medium">ثبت نشده</span>
                      }
                      <button
                        type="button"
                        class="text-[11px] text-emerald-700 hover:text-emerald-950 font-semibold bg-emerald-50/90 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md transition-colors shrink-0 cursor-pointer"
                        (click)="$event.stopPropagation(); openChangeRepModal(well)"
                        title="تغییر یا حذف نماینده این چاه"
                      >
                        تغییر
                      </button>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-farmers">
                      {{ formatNumberFa(well.farmer_count || 0) }} کشاورز
                    </span>
                  </td>
                  <td>
                    @if (well.active_water_year) {
                      <span class="badge badge-year">
                        {{ well.active_water_year }}
                      </span>
                    } @else {
                      <span class="text-xs text-gray-400">ثبت نشده</span>
                    }
                  </td>
                  <td>
                    <span class="text-xs text-gray-500 line-clamp-1 max-w-xs" [title]="well.description || ''">
                      {{ well.description || '—' }}
                    </span>
                  </td>
                  <td>
                    <div class="actions-cell" (click)="$event.stopPropagation()">
                      <button
                        type="button"
                        class="btn-table-action btn-action-detail"
                        (click)="navigateToWell(well.id)"
                        title="مشاهده و مدیریت جزئیات چاه"
                      >
                        <span>جزئیات</span>
                        <span aria-hidden="true">←</span>
                      </button>
                      <button
                        type="button"
                        class="btn-table-action"
                        (click)="openChangeRepModal(well)"
                        title="تغییر یا حذف نماینده"
                      >
                        تغییر نماینده
                      </button>
                      <button
                        type="button"
                        class="btn-table-action"
                        (click)="openEditWellModal(well)"
                        title="ویرایش مشخصات"
                      >
                        ویرایش
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Card list for mobile screens -->
          <div class="mobile-cards md:hidden">
            @for (well of filteredWells(); track well.id) {
              <div class="mobile-well-card" (click)="navigateToWell(well.id)">
                <div class="card-top">
                  <div class="flex items-center gap-2.5">
                    <div class="well-avatar-sm">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-emerald-700">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                        <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
                      </svg>
                    </div>
                    <div>
                      <strong class="text-sm font-bold text-gray-900 block">{{ well.name }}</strong>
                      <span class="text-[11px] text-gray-500 font-mono">شناسه: {{ well.id.slice(0, 8) }}</span>
                    </div>
                  </div>
                  <span class="badge badge-farmers">
                    {{ formatNumberFa(well.farmer_count || 0) }} کشاورز
                  </span>
                </div>

                <div class="card-mid space-y-1 text-xs text-gray-600">
                  <div class="flex items-center justify-between">
                    <span class="text-gray-400">نماینده:</span>
                    <strong class="text-gray-800">{{ well.representative_name || 'ثبت نشده' }}</strong>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-gray-400">سال آبی:</span>
                    <span class="text-gray-700 font-medium">{{ well.active_water_year || 'ثبت نشده' }}</span>
                  </div>
                  @if (well.description) {
                    <p class="text-gray-500 pt-1 text-[11px] leading-relaxed line-clamp-2">{{ well.description }}</p>
                  }
                </div>

                <div class="card-bottom" (click)="$event.stopPropagation()">
                  <button
                    type="button"
                    class="btn-table-action"
                    (click)="openChangeRepModal(well)"
                  >
                    تغییر نماینده
                  </button>
                  <button
                    type="button"
                    class="btn-table-action"
                    (click)="openEditWellModal(well)"
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    class="btn-table-action btn-action-detail"
                    (click)="navigateToWell(well.id)"
                  >
                    <span>ورود به جزئیات</span>
                    <span aria-hidden="true">←</span>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Add/Edit Well Modal -->
      @if (showWellModal()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="well-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeWellModal()" aria-label="بستن پنجره"></button>
          <div class="modal-card">
            <div class="modal-header">
              <h3 id="well-modal-title" class="modal-title">{{ isEditingWell() ? 'ویرایش چاه' : 'افزودن چاه جدید' }}</h3>
              <button type="button" class="modal-close-btn" (click)="closeWellModal()" aria-label="بستن پنجره">✕</button>
            </div>

            <form (submit)="saveWell(); $event.preventDefault()" class="modal-body space-y-4">
              <div>
                <label for="well-name" class="form-label">نام چاه کشاورزی <span class="text-rose-500">*</span></label>
                <input
                  id="well-name"
                  type="text"
                  class="form-input"
                  placeholder="مثال: چاه شماره ۲ دشت مرکزی"
                  required
                  [ngModel]="wellFormName()"
                  (ngModelChange)="wellFormName.set($event)"
                  name="wellName"
                />
              </div>

              <div>
                <label for="well-desc" class="form-label">توضیحات و مشخصات موقعیت</label>
                <textarea
                  id="well-desc"
                  class="form-input resize-none"
                  rows="3"
                  placeholder="موقعیت جغرافیایی، نکات مربوط به بهره‌برداری و..."
                  [ngModel]="wellFormDesc()"
                  (ngModelChange)="wellFormDesc.set($event)"
                  name="wellDesc"
                ></textarea>
              </div>

              <div>
                <label for="well-rep" class="form-label">تخصیص نماینده مسئول چاه</label>
                <select
                  id="well-rep"
                  class="form-select"
                  [ngModel]="wellFormRepId()"
                  (ngModelChange)="wellFormRepId.set($event)"
                  name="wellRepId"
                >
                  <option value="">-- بدون نماینده (بعداً مشخص می‌شود) --</option>
                  @for (rep of availableRepresentatives(); track rep.id) {
                    <option [value]="rep.id">{{ rep.full_name }} ({{ rep.phone }})</option>
                  }
                </select>
                <p class="text-[11px] text-gray-500 mt-1">
                  تنها کاربرانی که نقش «نماینده» یا «مدیر» دارند در این لیست قابل انتخاب هستند.
                </p>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="closeWellModal()">انصراف</button>
                <button type="submit" class="btn-primary" [disabled]="isSubmittingWell()">
                  {{ isSubmittingWell() ? 'در حال ذخیره...' : (isEditingWell() ? 'ذخیره تغییرات' : 'ایجاد چاه') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal: Change / Remove Representative -->
      @if (showChangeRepModal(); as curModal) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-rep-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeChangeRepModal()" aria-label="بستن پنجره"></button>
          <div class="modal-card max-w-lg">
            <div class="modal-header">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <polyline points="16 11 18 13 22 9"></polyline>
                  </svg>
                </div>
                <div>
                  <h3 id="change-rep-modal-title" class="modal-title">تغییر یا حذف نماینده مسئول چاه</h3>
                  <p class="text-xs text-gray-500">چاه «{{ targetWellForRep()?.name }}»</p>
                </div>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeChangeRepModal()" aria-label="بستن پنجره">✕</button>
            </div>

            <div class="modal-body space-y-4">
              <!-- Current Representative Summary -->
              <div class="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <span class="text-xs font-semibold text-gray-500 block mb-2">نماینده فعلی این چاه:</span>
                @if (targetWellForRep()?.representative_name) {
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-full bg-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center">
                        {{ targetWellForRep()?.representative_name?.charAt(0) }}
                      </div>
                      <div>
                        <strong class="text-xs text-gray-900 block">{{ targetWellForRep()?.representative_name }}</strong>
                        @if (targetWellForRep()?.representative_phone) {
                          <span dir="ltr" class="text-[11px] text-gray-500 font-mono">{{ targetWellForRep()?.representative_phone }}</span>
                        }
                      </div>
                    </div>
                    <span class="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium">فعال</span>
                  </div>
                } @else {
                  <p class="text-xs text-amber-700 font-medium">⚠️ این چاه در حال حاضر فاقد نماینده است.</p>
                }
              </div>

              <!-- Security Notice -->
              <div class="p-3.5 bg-amber-50/90 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div class="flex items-center gap-1.5 font-bold text-amber-950">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-amber-700">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span>سلب دسترسی فوری و کامل:</span>
                </div>
                <p class="text-[11px] leading-relaxed text-amber-800">
                  با تغییر نماینده یا حذف آن، دسترسی نماینده قبلی به این چاه و تمام بخش‌های آن (ثبت مصارف، ویرایش کشاورزان، سهمیه‌ها و هزینه‌ها) بلافاصله در پایگاه‌داده و پنل کاربری لغو خواهد شد.
                </p>
              </div>

              <!-- Select New Representative -->
              <div class="space-y-1.5">
                <label for="table-change-rep-select" class="form-label font-bold text-gray-800">
                  انتخاب نماینده جدید
                </label>
                <select
                  id="table-change-rep-select"
                  class="form-select"
                  [ngModel]="selectedRepId()"
                  (ngModelChange)="selectedRepId.set($event)"
                >
                  <option value="">-- بدون نماینده (حذف نماینده از این چاه) --</option>
                  @for (rep of availableRepresentatives(); track rep.id) {
                    <option [value]="rep.id">
                      {{ rep.full_name }} ({{ rep.phone }})
                    </option>
                  }
                </select>
                <p class="text-[11px] text-gray-400">
                  تنها کاربران با نقش «نماینده» یا «مدیر» در این لیست قابل انتخاب هستند.
                </p>
              </div>

              <!-- Quick action to clear rep if currently has one -->
              @if (targetWellForRep()?.representative_id) {
                <div class="pt-2 border-t border-gray-100 flex justify-between items-center">
                  <span class="text-xs text-gray-500">آیا می‌خواهید چاه فعلاً بدون نماینده باشد؟</span>
                  <button
                    type="button"
                    class="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                    (click)="selectedRepId.set('')"
                  >
                    تنظیم به «بدون نماینده»
                  </button>
                </div>
              }
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-secondary" (click)="closeChangeRepModal()">انصراف</button>
              <button
                type="button"
                class="btn-primary"
                [disabled]="isSubmittingRepChange()"
                (click)="saveRepresentativeChange()"
              >
                {{ isSubmittingRepChange() ? 'در حال ثبت تغییرات...' : (selectedRepId() ? 'تایید و تغییر نماینده' : 'تایید و حذف نماینده') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .wells-page {
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

    /* Table Container */
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

    .clickable-row {
      cursor: pointer;
      transition: background-color 0.12s ease;
    }

    .clickable-row:hover td {
      background: #f4faf6;
    }

    .well-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .well-avatar-sm {
      width: 36px;
      height: 36px;
      border-radius: 0.75rem;
      background: #e1f5eb;
      display: flex;
      align-items: center;
      justify-content: center;
      shrink-0: 0;
    }

    .well-name-box {
      display: flex;
      flex-direction: column;
    }

    .well-cell-name {
      color: #0d281e;
      font-size: 0.92rem;
    }

    .well-cell-id {
      font-size: 0.72rem;
      color: #799487;
    }

    .rep-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-farmers {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }

    .badge-year {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }

    /* Actions */
    .actions-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .btn-table-action {
      background: transparent;
      border: 1px solid #d4e3d8;
      padding: 0.35rem 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #1a382b;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .btn-table-action:hover {
      background: #f0f6f2;
      border-color: #08633f;
      color: #08633f;
    }

    .btn-action-detail {
      background: #edf7f1;
      border-color: #b8e0c9;
      color: #08633f;
    }

    .btn-action-detail:hover {
      background: #08633f;
      border-color: #08633f;
      color: #ffffff;
    }

    /* Mobile Cards */
    .mobile-cards {
      display: none;
    }

    @media (max-width: 768px) {
      .mobile-cards {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.75rem;
      }
    }

    .mobile-well-card {
      background: #fcfdfc;
      border: 1px solid #e5ede7;
      border-radius: 0.85rem;
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .mobile-well-card:hover {
      border-color: #08633f;
      box-shadow: 0 4px 12px rgba(8, 99, 63, 0.08);
    }

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-mid {
      background: #ffffff;
      padding: 0.65rem 0.85rem;
      border-radius: 0.65rem;
      border: 1px solid #edf4ef;
    }

    .card-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    /* Loading & Empty States */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem 1rem;
      color: #557566;
      font-size: 0.88rem;
    }

    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid #d0e3d6;
      border-top-color: #08633f;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 4rem 1rem;
    }

    /* Modal Styles */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10, 30, 20, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
      padding: 1rem;
    }

    .backdrop-dismiss {
      position: absolute;
      inset: 0;
      background: transparent;
      border: none;
      width: 100%;
      height: 100%;
    }

    .modal-card {
      position: relative;
      background: #ffffff;
      border-radius: 1.25rem;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      z-index: 1;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #eef4f0;
      background: #fcfdfc;
    }

    .modal-title {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0d281e;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      font-size: 1.2rem;
      color: #799487;
      cursor: pointer;
      padding: 0.35rem;
      border-radius: 0.45rem;
    }

    .modal-close-btn:hover {
      color: #08633f;
      background: #eef4f0;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .form-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      color: #1a382b;
      margin-bottom: 0.35rem;
    }

    .form-input, .form-select {
      width: 100%;
      border: 1px solid #c8ded1;
      background: #ffffff;
      border-radius: 0.65rem;
      padding: 0.65rem 0.85rem;
      font-size: 0.88rem;
      color: #12281e;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .form-input:focus, .form-select:focus {
      border-color: #08633f;
      box-shadow: 0 0 0 3px rgba(8, 99, 63, 0.12);
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
export class AdminWellsComponent {
  private readonly dataService = inject(AdminDataService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly wells = signal<AdminWell[]>([]);
  protected readonly allUsers = signal<UserProfile[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly isLoading = signal(true);

  // Add / Edit Modal State
  protected readonly showWellModal = signal(false);
  protected readonly isEditingWell = signal(false);
  protected readonly editingWellId = signal<string | null>(null);
  protected readonly isSubmittingWell = signal(false);

  // Change / Remove Representative Modal State
  protected readonly showChangeRepModal = signal(false);
  protected readonly targetWellForRep = signal<AdminWell | null>(null);
  protected readonly selectedRepId = signal('');
  protected readonly isSubmittingRepChange = signal(false);

  // Form State
  protected readonly wellFormName = signal('');
  protected readonly wellFormDesc = signal('');
  protected readonly wellFormRepId = signal('');

  protected readonly filteredWells = computed(() => {
    let list = this.wells();
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.representative_name?.toLowerCase().includes(q)
      );
    }
    return list;
  });

  protected readonly availableRepresentatives = computed(() => {
    return this.allUsers().filter(
      (u) => u.is_active && (u.role === 'representative' || u.role === 'admin')
    );
  });

  constructor() {
    toObservable(this.searchQuery)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(() => this.isLoading.set(true)),
        switchMap(() =>
          this.dataService.getWells$().pipe(
            catchError((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'خطا در دریافت لیست چاه‌ها.');
              return of([]);
            })
          )
        ),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe((data) => {
        this.wells.set(data);
        this.isLoading.set(false);
      });

    this.dataService
      .getUsers$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((users) => {
        this.allUsers.set(users);
      });
  }

  protected onSearchChange(val: string): void {
    this.searchQuery.set(val);
  }

  protected navigateToWell(wellId: string): void {
    this.router.navigate(['/admin/wells', wellId]);
  }

  // --- Add/Edit Well Modal ---
  protected openAddWellModal(): void {
    this.isEditingWell.set(false);
    this.editingWellId.set(null);
    this.wellFormName.set('');
    this.wellFormDesc.set('');
    this.wellFormRepId.set('');
    this.showWellModal.set(true);
  }

  protected openEditWellModal(well: AdminWell): void {
    this.isEditingWell.set(true);
    this.editingWellId.set(well.id);
    this.wellFormName.set(well.name);
    this.wellFormDesc.set(well.description || '');
    this.wellFormRepId.set(well.representative_id || '');
    this.showWellModal.set(true);
  }

  protected closeWellModal(): void {
    this.showWellModal.set(false);
  }

  // --- Change / Remove Representative Modal ---
  protected openChangeRepModal(well: AdminWell): void {
    this.targetWellForRep.set(well);
    this.selectedRepId.set(well.representative_id || '');
    this.showChangeRepModal.set(true);
  }

  protected closeChangeRepModal(): void {
    this.showChangeRepModal.set(false);
    this.targetWellForRep.set(null);
  }

  protected saveRepresentativeChange(): void {
    const well = this.targetWellForRep();
    if (!well) return;

    const newRepId = this.selectedRepId() || null;
    this.isSubmittingRepChange.set(true);

    this.dataService
      .changeWellRepresentative$(well.id, newRepId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmittingRepChange.set(false);
          this.showChangeRepModal.set(false);
          const repObj = this.allUsers().find((u) => u.id === newRepId);
          this.wells.update((list) =>
            list.map((w) =>
              w.id === well.id
                ? {
                    ...w,
                    representative_id: newRepId,
                    representative_name: repObj ? repObj.full_name : null,
                    representative_phone: repObj ? repObj.phone : null,
                  }
                : w
            )
          );
          if (newRepId) {
            toast.success(
              `نماینده چاه «${well.name}» با موفقیت به «${repObj?.full_name || 'نماینده جدید'}» تغییر یافت و دسترسی نماینده قبلی لغو گردید.`
            );

            // Send assignment SMS to new representative
            void this.dataService
              .notifyRepresentativeAssigned({
                wellId: well.id,
                wellName: well.name,
                representativeId: newRepId,
                phone: repObj?.phone,
                fullName: repObj?.full_name,
              })
              .then((smsRes) => {
                if (smsRes.success) {
                  toast.info(
                    `پیامک ایجاد پنل برای نماینده «${repObj?.full_name || 'نماینده'}» ارسال شد.`
                  );
                } else if (smsRes.message) {
                  toast.warning(`وضعیت پیامک: ${smsRes.message}`);
                }
              });
          } else {
            toast.success(`نماینده از چاه «${well.name}» حذف شد و دسترسی وی لغو گردید.`);
          }
          this.targetWellForRep.set(null);
        },
        error: (err: unknown) => {
          this.isSubmittingRepChange.set(false);
          toast.error(err instanceof Error ? err.message : 'خطا در تغییر نماینده چاه.');
        },
      });
  }

  protected saveWell(): void {
    const name = this.wellFormName().trim();
    if (!name) {
      toast.error('نام چاه الزامی است.');
      return;
    }

    this.isSubmittingWell.set(true);
    const repId = this.wellFormRepId() || null;
    const desc = this.wellFormDesc().trim() || null;

    if (this.isEditingWell() && this.editingWellId()) {
      const wellId = this.editingWellId()!;
      const prevWell = this.wells().find((w) => w.id === wellId);
      const isNewRep = repId && repId !== prevWell?.representative_id;

      this.dataService
        .updateWell$(wellId, {
          name,
          description: desc,
          representative_id: repId,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.isSubmittingWell.set(false);
            this.showWellModal.set(false);
            const repObj = this.allUsers().find((u) => u.id === repId);
            this.wells.update((list) =>
              list.map((w) =>
                w.id === wellId
                  ? {
                      ...w,
                      name,
                      description: desc,
                      representative_id: repId,
                      representative_name: repObj?.full_name,
                      representative_phone: repObj?.phone,
                    }
                  : w
              )
            );
            toast.success('مشخصات چاه با موفقیت ویرایش شد.');

            if (isNewRep && repId) {
              void this.dataService
                .notifyRepresentativeAssigned({
                  wellId: wellId,
                  wellName: name,
                  representativeId: repId,
                  phone: repObj?.phone,
                  fullName: repObj?.full_name,
                })
                .then((smsRes) => {
                  if (smsRes.success) {
                    toast.info(
                      `پیامک ایجاد پنل برای نماینده «${repObj?.full_name || 'نماینده'}» ارسال شد.`
                    );
                  } else if (smsRes.message) {
                    toast.warning(`وضعیت پیامک: ${smsRes.message}`);
                  }
                });
            }
          },
          error: (err: unknown) => {
            this.isSubmittingWell.set(false);
            toast.error(err instanceof Error ? err.message : 'خطا در ویرایش اطلاعات چاه.');
          },
        });
    } else {
      this.dataService
        .createWell$({
          name,
          description: desc,
          representative_id: repId,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (newWell) => {
            this.isSubmittingWell.set(false);
            this.showWellModal.set(false);
            const repObj = this.allUsers().find((u) => u.id === repId);
            const hydrated: AdminWell = {
              ...newWell,
              representative_name: repObj?.full_name,
              representative_phone: repObj?.phone,
              farmer_count: 0,
            };
            this.wells.update((list) => [hydrated, ...list]);
            toast.success(`چاه جدید «${newWell.name}» با موفقیت افزوده شد.`);

            if (repId) {
              void this.dataService
                .notifyRepresentativeAssigned({
                  wellId: newWell.id,
                  wellName: newWell.name,
                  representativeId: repId,
                  phone: repObj?.phone,
                  fullName: repObj?.full_name,
                })
                .then((smsRes) => {
                  if (smsRes.success) {
                    toast.info(
                      `پیامک ایجاد پنل برای نماینده «${repObj?.full_name || 'نماینده'}» ارسال شد.`
                    );
                  } else if (smsRes.message) {
                    toast.warning(`وضعیت پیامک: ${smsRes.message}`);
                  }
                });
            }
          },
          error: (err: unknown) => {
            this.isSubmittingWell.set(false);
            toast.error(err instanceof Error ? err.message : 'خطا در افزودن چاه جدید.');
          },
        });
    }
  }

  protected formatNumberFa(num: number | null | undefined): string {
    if (num === null || num === undefined) return '۰';
    return Number(num).toLocaleString('fa-IR');
  }
}
