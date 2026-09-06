import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { catchError, finalize, forkJoin, Observable, of, switchMap, tap } from 'rxjs';
import { AdminDataService, AdminWell, AdminWaterYear, AdminWellFarmer } from '../../../core/admin-data.service';
import { PersianDatepickerComponent } from '../../../shared/persian-datepicker/persian-datepicker.component';
import { parseHoursNumber } from '@core/mock-data';

@Component({
  selector: 'app-admin-wells',
  imports: [FormsModule, PersianDatepickerComponent],
  template: `
    <div class="wells-page space-y-6">
      <!-- Top Title & Action Header -->
      <div class="page-top-bar">
        <div>
          <h2 class="section-title">مدیریت چاه‌ها</h2>
          <p class="section-desc">تنظیم چاه‌ها، تخصیص نماینده، تعریف سال‌های آبی و مدیریت کشاورزان هر چاه</p>
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

      <!-- Search Toolbar -->
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
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>
      </div>

      <!-- Wells Grid (Desktop Cards) -->
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
          <h3 class="text-base font-bold text-gray-700">چاهی با این نام یافت نشد</h3>
          <p class="text-xs text-gray-500 mt-1">با زدن دکمه «افزودن چاه جدید» می‌توانید چاه ثبت کنید.</p>
        </div>
      } @else {
        <div class="wells-grid">
          @for (well of filteredWells(); track well.id) {
            <div class="well-card">
              <div class="well-card-header">
                <div class="well-icon-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6 text-emerald-700">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                    <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
                  </svg>
                </div>
                <div class="well-card-title">
                  <h3 class="well-name">{{ well.name }}</h3>
                  <span class="well-id font-mono">شناسه: {{ well.id.slice(0, 8) }}</span>
                </div>
                <button
                  type="button"
                  class="btn-edit-well"
                  (click)="openEditWellModal(well)"
                  title="ویرایش چاه"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
              </div>

              <div class="well-card-body">
                @if (well.description) {
                  <p class="well-desc">{{ well.description }}</p>
                }

                <div class="well-info-row">
                  <span class="info-label">نماینده مسئول:</span>
                  <strong class="info-value text-emerald-900">
                    {{ well.representative_name || 'بدون نماینده' }}
                  </strong>
                </div>

                <div class="well-info-row">
                  <span class="info-label">تعداد کشاورزان عضو:</span>
                  <span class="badge-count">{{ well.farmer_count || 0 }} کشاورز</span>
                </div>

                <div class="well-info-row">
                  <span class="info-label">سال آبی فعال:</span>
                  <span class="badge-year">{{ well.active_water_year || 'ثبت نشده' }}</span>
                </div>
              </div>

              <div class="well-card-footer">
                <button
                  type="button"
                  class="btn-manage-well"
                  (click)="openWellDetails(well)"
                >
                  <span>مدیریت سال‌های آبی و کشاورزان</span>
                  <span aria-hidden="true">←</span>
                </button>
              </div>
            </div>
          }
        </div>
      }

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
                <label for="well-name-input" class="form-label">نام چاه <span class="text-rose-500">*</span></label>
                <input
                  id="well-name-input"
                  type="text"
                  class="form-input"
                  placeholder="مثال: چاه دشت سبز شماره ۱"
                  required
                  [ngModel]="wellFormName()"
                  (ngModelChange)="wellFormName.set($event)"
                  name="wellFormName"
                />
              </div>

              <div>
                <label for="well-rep-select" class="form-label">نماینده مسئول چاه</label>
                <select
                  id="well-rep-select"
                  class="form-select"
                  [ngModel]="wellFormRepId()"
                  (ngModelChange)="wellFormRepId.set($event)"
                  name="wellFormRepId"
                >
                  <option [ngValue]="null">-- انتخاب نماینده چاه --</option>
                  @for (rep of availableRepresentatives(); track rep.id) {
                    <option [value]="rep.id">
                      {{ rep.full_name }} ({{ rep.phone }})
                    </option>
                  }
                </select>
              </div>

              <div>
                <label for="well-desc-input" class="form-label">توضیحات و مشخصات مکانی</label>
                <textarea
                  id="well-desc-input"
                  class="form-input h-20 resize-none"
                  placeholder="محل حفر، دبی آب، اراضی تحت پوشش..."
                  [ngModel]="wellFormDescription()"
                  (ngModelChange)="wellFormDescription.set($event)"
                  name="wellFormDescription"
                ></textarea>
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

      <!-- Well Details & Water Years / Farmers Drawer / Modal -->
      @if (activeDetailWell(); as curWell) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="detail-well-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeWellDetails()" aria-label="بستن پنجره"></button>
          <div class="modal-card modal-large">
            <div class="modal-header">
              <div>
                <h3 id="detail-well-modal-title" class="modal-title">{{ curWell.name }}</h3>
                <span class="text-xs text-gray-500">نماینده: {{ curWell.representative_name || 'ثبت نشده' }}</span>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeWellDetails()" aria-label="بستن پنجره">✕</button>
            </div>

            <!-- Drawer Tabs -->
            <div class="detail-tabs">
              <button
                type="button"
                class="detail-tab"
                [class.active]="detailTab() === 'water_years'"
                (click)="detailTab.set('water_years')"
              >
                سال‌های آبی (تاریخ و سهمیه‌بندی)
              </button>
              <button
                type="button"
                class="detail-tab"
                [class.active]="detailTab() === 'farmers'"
                (click)="detailTab.set('farmers')"
              >
                کشاورزان تحت پوشش ({{ curWellFarmers().length }})
              </button>
            </div>

            <div class="modal-body overflow-y-auto max-h-[70vh]">
              <!-- Tab 1: Water Years -->
              @if (detailTab() === 'water_years') {
                <div class="space-y-5">
                  <div class="flex items-center justify-between">
                    <h4 class="text-sm font-bold text-gray-800">سال‌های آبی تعریف‌شده</h4>
                    <button
                      type="button"
                      class="btn-primary text-xs py-1.5 px-3"
                      (click)="showAddWaterYearForm.set(!showAddWaterYearForm())"
                    >
                      {{ showAddWaterYearForm() ? 'بستن فرم' : '+ تعریف سال آبی جدید' }}
                    </button>
                  </div>

                  <!-- Add Water Year Form with Persian Datepicker Element -->
                  @if (showAddWaterYearForm()) {
                    <div class="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
                      <h5 class="text-xs font-bold text-emerald-900">تعریف دوره جدید سال آبی</h5>

                      <div>
                        <label for="wy-title" class="form-label text-xs">عنوان سال آبی <span class="text-rose-500">*</span></label>
                        <input
                          id="wy-title"
                          type="text"
                          class="form-input text-xs"
                          placeholder="مثال: سال آبی ۱۴۰۴ – ۱۴۰۵"
                          [ngModel]="wyFormDesc()"
                          (ngModelChange)="wyFormDesc.set($event)"
                        />
                      </div>

                      <!-- Persian Date Pickers for Start and End Date -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <app-persian-datepicker
                          label="تاریخ شروع سال آبی"
                          [required]="true"
                          placeholder="مثال: 1404/07/01"
                          [(value)]="wyFormStartDate"
                          [(isoValue)]="wyFormStartIso"
                          hint="ابتدای بازه تخصیص و سهمیه"
                        />

                        <app-persian-datepicker
                          label="تاریخ پایان سال آبی"
                          [required]="true"
                          placeholder="مثال: 1405/06/31"
                          [(value)]="wyFormEndDate"
                          [(isoValue)]="wyFormEndIso"
                          hint="انتهای بازه استفاده از آب"
                        />
                      </div>

                      <div class="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          class="btn-secondary text-xs py-1.5"
                          (click)="showAddWaterYearForm.set(false)"
                        >
                          انصراف
                        </button>
                        <button
                          type="button"
                          class="btn-primary text-xs py-1.5"
                          [disabled]="isSubmittingWY()"
                          (click)="saveWaterYear(curWell.id)"
                        >
                          {{ isSubmittingWY() ? 'در حال ثبت...' : 'ثبت سال آبی' }}
                        </button>
                      </div>
                    </div>
                  }

                  <!-- List of Water Years -->
                  @if (curWaterYears().length === 0) {
                    <p class="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                      هنوز سال آبی برای این چاه ثبت نشده است. از دکمه بالا برای ایجاد استفاده کنید.
                    </p>
                  } @else {
                    <div class="space-y-3">
                      @for (wy of curWaterYears(); track wy.id) {
                        <div class="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center justify-between">
                          <div>
                            <strong class="text-sm text-gray-900 block font-bold">{{ wy.description }}</strong>
                            <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>از: <strong class="text-gray-800 font-mono">{{ formatJalaliDisplay(wy.start_date) }}</strong></span>
                              <span>تا: <strong class="text-gray-800 font-mono">{{ formatJalaliDisplay(wy.end_date) }}</strong></span>
                            </div>
                          </div>
                          <span class="badge badge-farmer">فعال</span>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Tab 2: Farmers -->
              @if (detailTab() === 'farmers') {
                <div class="space-y-5">
                  <div class="p-3.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2 flex-wrap">
                    <select
                      class="form-select text-xs flex-1 min-w-[200px]"
                      [ngModel]="selectedFarmerToAdd()"
                      (ngModelChange)="selectedFarmerToAdd.set($event)"
                    >
                      <option value="">-- انتخاب کشاورز جهت اتصال به این چاه --</option>
                      @for (f of availableFarmersToAdd(); track f.id) {
                        <option [value]="f.id">{{ f.full_name }} ({{ f.phone }})</option>
                      }
                    </select>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="سهمیه (ساعت) - اختیاری"
                      class="form-input text-xs w-44"
                      [ngModel]="farmerQuotaToAdd()"
                      (ngModelChange)="farmerQuotaToAdd.set($event)"
                    />
                    <button
                      type="button"
                      class="btn-primary text-xs py-2 px-3 whitespace-nowrap"
                      [disabled]="!selectedFarmerToAdd()"
                      (click)="addFarmer(curWell.id)"
                    >
                      افزودن کشاورز به چاه
                    </button>
                  </div>

                  @if (curWellFarmers().length === 0) {
                    <p class="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                      کشاورزی به این چاه متصل نشده است.
                    </p>
                  } @else {
                    <div class="space-y-2.5">
                      @for (wf of curWellFarmers(); track wf.id) {
                        <div class="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                          <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                              {{ wf.farmer_name.charAt(0) }}
                            </div>
                            <div>
                              <div class="flex items-center gap-2">
                                <strong class="text-sm text-gray-900 font-bold">{{ wf.farmer_name }}</strong>
                                <span dir="ltr" class="text-xs text-gray-500 font-mono">{{ wf.farmer_phone }}</span>
                              </div>
                              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                                @if (wf.allocatedHours !== undefined && wf.allocatedHours !== null) {
                                  <span class="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                    سهمیه: <strong class="font-bold">{{ wf.allocatedHours }}</strong> ساعت
                                  </span>
                                  <span class="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                                    مصرف: <strong class="font-bold">{{ wf.usedHours || 0 }}</strong> ساعت
                                  </span>
                                  <span class="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                                    مانده: <strong class="font-bold">{{ wf.remainingHours ?? wf.allocatedHours }}</strong> ساعت
                                  </span>
                                } @else {
                                  <span class="inline-flex items-center text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                    بدون سهمیه در سال آبی جاری
                                  </span>
                                }
                              </div>
                            </div>
                          </div>
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              class="btn-secondary text-xs py-1 px-2.5"
                              (click)="openSetQuotaModal(wf)"
                            >
                              {{ wf.allocatedHours !== undefined && wf.allocatedHours !== null ? 'ویرایش سهمیه' : '＋ ثبت سهمیه' }}
                            </button>
                            <button
                              type="button"
                              class="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer border-0 bg-transparent px-2 py-1"
                              (click)="removeFarmer(wf.id)"
                            >
                              حذف از چاه
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-secondary" (click)="closeWellDetails()">بستن</button>
            </div>
          </div>
        </div>
      }

      <!-- Modal: Set / Edit Farmer Quota in Admin -->
      @if (editingFarmerForQuota(); as editingWf) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="set-quota-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeSetQuotaModal()" aria-label="بستن"></button>
          <div class="modal-card modal-compact">
            <div class="modal-header">
              <div>
                <h3 id="set-quota-modal-title" class="modal-title">
                  {{ editingWf.allocatedHours !== undefined && editingWf.allocatedHours !== null ? 'ویرایش سهمیه آب' : 'ثبت سهمیه آب' }}
                </h3>
                <span class="text-xs text-gray-500">کشاورز: {{ editingWf.farmer_name }}</span>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeSetQuotaModal()">✕</button>
            </div>
            <form (ngSubmit)="saveFarmerQuota()" class="modal-body space-y-4">
              <div>
                <label for="admin-quota-input" class="form-label">میزان سهمیه در سال آبی جاری (ساعت)</label>
                <input
                  id="admin-quota-input"
                  type="number"
                  step="any"
                  min="0"
                  required
                  class="form-input"
                  placeholder="مثلاً ۱۲ یا ۲٫۵"
                  [ngModel]="editingQuotaHours()"
                  (ngModelChange)="editingQuotaHours.set($event)"
                  name="editingQuotaHours"
                />
                <span class="form-hint">مقدار سهمیه آب این کشاورز را بر حسب ساعت وارد کنید.</span>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="closeSetQuotaModal()">انصراف</button>
                <button type="submit" class="btn-primary" [disabled]="isSubmittingQuota()">
                  {{ isSubmittingQuota() ? 'در حال ثبت...' : 'ذخیره سهمیه' }}
                </button>
              </div>
            </form>
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
      box-shadow: 0 2px 8px rgba(7, 72, 45, 0.04);
    }

    .search-input-wrap {
      position: relative;
      width: 100%;
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
    }

    .search-input:focus {
      border-color: #08633f;
      background: #ffffff;
    }

    /* Wells Grid */
    .wells-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.5rem;
    }

    .well-card {
      background: #ffffff;
      border: 1px solid #dce8e0;
      border-radius: 1.25rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 4px 16px rgba(7, 72, 45, 0.04);
      transition: all 0.2s ease;
    }

    .well-card:hover {
      box-shadow: 0 10px 24px rgba(7, 72, 45, 0.09);
      border-color: #bcd4c4;
      transform: translateY(-2px);
    }

    .well-card-header {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
    }

    .well-icon-box {
      width: 44px;
      height: 44px;
      border-radius: 0.75rem;
      background: #e2f4ea;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .well-card-title {
      flex: 1;
    }

    .well-name {
      font-size: 1.15rem;
      font-weight: 800;
      color: #063722;
      margin: 0;
    }

    .well-id {
      font-size: 0.72rem;
      color: #799487;
    }

    .btn-edit-well {
      background: transparent;
      border: none;
      color: #799487;
      cursor: pointer;
      padding: 0.35rem;
      border-radius: 0.5rem;
      transition: all 0.15s ease;
    }

    .btn-edit-well:hover {
      color: #08633f;
      background: #edf8f1;
    }

    .well-card-body {
      margin: 1rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .well-desc {
      font-size: 0.84rem;
      color: #567064;
      line-height: 1.4;
      margin: 0;
    }

    .well-rep-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8faf9;
      padding: 0.65rem 0.85rem;
      border-radius: 0.65rem;
      border: 1px solid #edf3ef;
    }

    .rep-label {
      font-size: 0.78rem;
      color: #799487;
    }

    .rep-name {
      font-size: 0.84rem;
      font-weight: 700;
      color: #173b2b;
    }

    .rep-phone {
      font-size: 0.75rem;
      color: #567064;
      direction: ltr;
    }

    .well-stats-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .well-stat-pill {
      background: #edf8f1;
      padding: 0.6rem 0.75rem;
      border-radius: 0.65rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .pill-label {
      font-size: 0.7rem;
      color: #567064;
    }

    .pill-value {
      font-size: 0.88rem;
      font-weight: 800;
      color: #08633f;
    }

    .well-card-footer {
      border-top: 1px solid #edf3ef;
      padding-top: 1rem;
    }

    .btn-manage-well {
      width: 100%;
      background: #f0f7f3;
      color: #08633f;
      border: 1px solid #d4e8dc;
      padding: 0.6rem 1rem;
      border-radius: 0.65rem;
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.15s ease;
    }

    .btn-manage-well:hover {
      background: #08633f;
      color: #ffffff;
      border-color: #08633f;
    }

    /* Modal Styles */
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
      max-width: 520px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .modal-card.modal-card-lg {
      max-width: 680px;
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
      max-height: 75vh;
      overflow-y: auto;
    }

    .form-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #173b2b;
      margin-bottom: 0.35rem;
    }

    .form-input, .form-select, .form-textarea {
      width: 100%;
      padding: 0.65rem 0.85rem;
      border-radius: 0.65rem;
      border: 1px solid #d4e3d8;
      background: #ffffff;
      font-size: 0.9rem;
      color: #173b2b;
      outline: none;
      font-family: inherit;
    }

    .form-input:focus, .form-select:focus, .form-textarea:focus {
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

    /* Detail Tabs */
    .detail-tabs-nav {
      display: flex;
      border-bottom: 2px solid #eef4f0;
      margin-bottom: 1.25rem;
      gap: 1rem;
    }

    .detail-tab-btn {
      background: transparent;
      border: none;
      padding: 0.65rem 0.25rem;
      font-size: 0.88rem;
      font-weight: 700;
      color: #799487;
      cursor: pointer;
      position: relative;
      transition: color 0.15s ease;
    }

    .detail-tab-btn.active {
      color: #08633f;
    }

    .detail-tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: #08633f;
      border-radius: 2px;
    }

    .detail-tab-pane {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .tab-action-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .detail-list {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      max-height: 260px;
      overflow-y: auto;
    }

    .detail-list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-radius: 0.65rem;
      background: #f8faf9;
      border: 1px solid #eef4f0;
    }

    .btn-remove-sm {
      background: transparent;
      border: none;
      font-size: 0.78rem;
      font-weight: 600;
      color: #dc2626;
      cursor: pointer;
      padding: 0.2rem 0.45rem;
      border-radius: 0.35rem;
    }

    .btn-remove-sm:hover {
      background: #fee2e2;
    }

    .sub-form-card {
      background: #f0f7f3;
      border: 1px solid #d4e8dc;
      border-radius: 0.85rem;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .add-farmer-box {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      background: #f8faf9;
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      border: 1px solid #eef4f0;
    }

    /* Loading & Empty */
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
  `,
})
export class AdminWellsComponent {
  private readonly dataService = inject(AdminDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly refreshTrigger = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly searchQuery = signal('');

  private readonly wellsData$ = toObservable(this.refreshTrigger).pipe(
    tap(() => this.isLoading.set(true)),
    switchMap(() =>
      forkJoin({
        wells: this.dataService.getWells$(),
        users: this.dataService.getUsers$(),
      }).pipe(
        catchError((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات چاه‌ها.');
          return of({ wells: [], users: [] });
        }),
        finalize(() => this.isLoading.set(false))
      )
    )
  );

  private readonly initialData = toSignal(this.wellsData$, {
    initialValue: { wells: [], users: [] },
  });

  protected readonly wells = linkedSignal(() => this.initialData().wells);
  protected readonly allUsers = computed(() => this.initialData().users);

  // Well Modal
  protected readonly showWellModal = signal(false);
  protected readonly isEditingWell = signal(false);
  protected readonly editingWellId = signal<string | null>(null);
  protected readonly isSubmittingWell = signal(false);

  // Well Form
  protected readonly wellFormName = signal('');
  protected readonly wellFormDescription = signal('');
  protected readonly wellFormRepId = signal<string | null>(null);

  // Detail Modal / Drawer
  protected readonly activeDetailWell = signal<AdminWell | null>(null);
  protected readonly detailTab = signal<'water_years' | 'farmers'>('water_years');

  // Detail Water Years & Farmers Data
  protected readonly curWaterYears = signal<AdminWaterYear[]>([]);
  protected readonly curWellFarmers = signal<AdminWellFarmer[]>([]);
  protected readonly showAddWaterYearForm = signal(false);
  protected readonly isSubmittingWY = signal(false);

  // Water Year Form Signals
  protected readonly wyFormDesc = signal('');
  protected readonly wyFormStartDate = signal('1404/07/01');
  protected readonly wyFormEndDate = signal('1405/06/31');
  protected readonly wyFormStartIso = signal('2025-09-23');
  protected readonly wyFormEndIso = signal('2026-09-22');

  // Add Farmer to Well Signal
  protected readonly selectedFarmerToAdd = signal('');
  protected readonly farmerQuotaToAdd = signal('');

  // Set / Edit Quota Signal
  protected readonly editingFarmerForQuota = signal<AdminWellFarmer | null>(null);
  protected readonly editingQuotaHours = signal('');
  protected readonly isSubmittingQuota = signal(false);

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
      (u) => (u.role === 'representative' || u.role === 'farmer') && u.is_active
    );
  });

  protected readonly availableFarmersToAdd = computed(() => {
    const currentConnectedIds = new Set(this.curWellFarmers().map((f) => f.farmer_id));
    return this.allUsers().filter(
      (u) => (u.role === 'farmer' || u.role === 'representative') && !currentConnectedIds.has(u.id)
    );
  });

  protected openAddWellModal(): void {
    this.isEditingWell.set(false);
    this.editingWellId.set(null);
    this.wellFormName.set('');
    this.wellFormDescription.set('');
    this.wellFormRepId.set(null);
    this.showWellModal.set(true);
  }

  protected openEditWellModal(well: AdminWell): void {
    this.isEditingWell.set(true);
    this.editingWellId.set(well.id);
    this.wellFormName.set(well.name);
    this.wellFormDescription.set(well.description || '');
    this.wellFormRepId.set(well.representative_id);
    this.showWellModal.set(true);
  }

  protected closeWellModal(): void {
    this.showWellModal.set(false);
    this.editingWellId.set(null);
  }

  protected saveWell(): void {
    const name = this.wellFormName().trim();
    if (!name) {
      toast.error('نام چاه الزامی است.');
      return;
    }

    this.isSubmittingWell.set(true);
    const save$: Observable<unknown> =
      this.isEditingWell() && this.editingWellId()
        ? this.dataService.updateWell$(this.editingWellId()!, {
            name,
            description: this.wellFormDescription().trim() || null,
            representative_id: this.wellFormRepId(),
          })
        : this.dataService.createWell$({
            name,
            description: this.wellFormDescription().trim() || undefined,
            representative_id: this.wellFormRepId(),
          });

    save$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmittingWell.set(false))
      )
      .subscribe({
        next: () => {
          toast.success(
            this.isEditingWell()
              ? `چاه «${name}» با موفقیت ویرایش شد.`
              : `چاه جدید «${name}» با موفقیت ثبت شد.`
          );
          this.refreshTrigger.update((v) => v + 1);
          this.closeWellModal();
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در ذخیره اطلاعات چاه.');
        },
      });
  }

  // --- Manage Details Modal ---
  protected openWellDetails(well: AdminWell): void {
    this.activeDetailWell.set(well);
    this.detailTab.set('water_years');
    this.showAddWaterYearForm.set(false);
    this.selectedFarmerToAdd.set('');
    this.loadWellDetails(well.id);
  }

  protected closeWellDetails(): void {
    this.activeDetailWell.set(null);
  }

  private loadWellDetails(wellId: string): void {
    forkJoin({
      wy: this.dataService.getWaterYears$(wellId),
      farmers: this.dataService.getWellFarmers$(wellId),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در دریافت جزئیات چاه.');
          return of({ wy: [], farmers: [] });
        })
      )
      .subscribe(({ wy, farmers }) => {
        this.curWaterYears.set(wy);
        this.curWellFarmers.set(farmers);
      });
  }

  protected saveWaterYear(wellId: string): void {
    const desc = this.wyFormDesc().trim();
    const startIso = this.wyFormStartIso().trim();
    const endIso = this.wyFormEndIso().trim();

    if (!desc || !startIso || !endIso) {
      toast.error('تکمیل عنوان، تاریخ شروع و تاریخ پایان الزامی است.');
      return;
    }

    this.isSubmittingWY.set(true);
    this.dataService
      .createWaterYear$({
        well_id: wellId,
        description: desc,
        start_date: startIso,
        end_date: endIso,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmittingWY.set(false))
      )
      .subscribe({
        next: (newWy) => {
          this.curWaterYears.update((list) => [newWy, ...list]);
          this.showAddWaterYearForm.set(false);
          this.wyFormDesc.set('');
          this.wyFormStartDate.set('');
          this.wyFormEndDate.set('');
          this.wyFormStartIso.set('');
          this.wyFormEndIso.set('');
          toast.success(`سال آبی «${desc}» با موفقیت ثبت شد.`);

          this.wells.update((list) =>
            list.map((w) => (w.id === wellId ? { ...w, active_water_year: desc } : w))
          );
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در ثبت سال آبی جدید.');
        },
      });
  }

  protected formatJalaliDisplay(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00Z`);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(d);
  }

  protected addFarmer(wellId: string): void {
    const farmerId = this.selectedFarmerToAdd();
    if (!farmerId) return;

    const activeWyId = this.curWaterYears().length > 0 ? this.curWaterYears()[0].id : undefined;
    const quota = parseHoursNumber(this.farmerQuotaToAdd()) ?? undefined;

    this.dataService
      .addFarmerToWell$(wellId, farmerId, { waterYearId: activeWyId, allocatedHours: quota })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (newWf) => {
          this.curWellFarmers.update((list) => [newWf, ...list]);
          this.selectedFarmerToAdd.set('');
          this.farmerQuotaToAdd.set('');
          toast.success(
            quota !== undefined
              ? `کشاورز «${newWf.farmer_name}» با سهمیه ${quota} ساعت به چاه متصل شد.`
              : `کشاورز «${newWf.farmer_name}» به این چاه متصل گردید.`
          );

          this.wells.update((list) =>
            list.map((w) =>
              w.id === wellId ? { ...w, farmer_count: (w.farmer_count || 0) + 1 } : w
            )
          );
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در افزودن کشاورز به چاه.');
        },
      });
  }

  protected openSetQuotaModal(wf: AdminWellFarmer): void {
    this.editingFarmerForQuota.set(wf);
    this.editingQuotaHours.set(
      wf.allocatedHours !== undefined && wf.allocatedHours !== null ? String(wf.allocatedHours) : ''
    );
  }

  protected closeSetQuotaModal(): void {
    this.editingFarmerForQuota.set(null);
  }

  protected saveFarmerQuota(): void {
    const wf = this.editingFarmerForQuota();
    const wy = this.curWaterYears();
    const activeWyId = wy.length > 0 ? wy[0].id : null;
    if (!wf || !activeWyId) {
      toast.error('ابتدا باید حداقل یک سال آبی برای این چاه تعریف شده باشد.');
      return;
    }

    const hours = parseHoursNumber(this.editingQuotaHours());
    if (hours === null || hours < 0) {
      toast.error('لطفاً مقدار معتبر سهمیه (ساعت) را وارد کنید.');
      return;
    }

    this.isSubmittingQuota.set(true);
    this.dataService
      .setFarmerQuota$(wf.id, activeWyId, hours)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmittingQuota.set(false))
      )
      .subscribe({
        next: (res) => {
          this.curWellFarmers.update((list) =>
            list.map((f) =>
              f.id === wf.id
                ? {
                    ...f,
                    allocationId: res.id,
                    allocatedHours: res.allocatedHours,
                    remainingHours: Math.max(
                      0,
                      Math.round((res.allocatedHours - (f.usedHours || 0)) * 100) / 100
                    ),
                  }
                : f
            )
          );
          this.editingFarmerForQuota.set(null);
          toast.success(`سهمیه «${wf.farmer_name}» با موفقیت ذخیره شد (${hours} ساعت).`);
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در ذخیره سهمیه.');
        },
      });
  }

  protected removeFarmer(wfId: string): void {
    this.dataService
      .removeFarmerFromWell$(wfId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.curWellFarmers.update((list) => list.filter((f) => f.id !== wfId));
          toast.success('کشاورز از لیست این چاه حذف شد.');

          const curWell = this.activeDetailWell();
          if (curWell) {
            this.wells.update((list) =>
              list.map((w) =>
                w.id === curWell.id
                  ? { ...w, farmer_count: Math.max(0, (w.farmer_count || 1) - 1) }
                  : w
              )
            );
          }
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در حذف کشاورز.');
        },
      });
  }
}
