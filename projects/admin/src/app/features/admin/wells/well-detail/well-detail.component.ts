import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AdminDataService,
  AdminWell,
  AdminWaterYear,
  AdminWellFarmer,
  AdminWellExpense,
} from '../../../../core/admin-data.service';
import { UserProfile } from '@core/auth.model';
import { PersianDatepickerComponent } from '../../../../shared/persian-datepicker/persian-datepicker.component';
import { parseHoursNumber } from '@core/mock-data';

@Component({
  selector: 'app-admin-well-detail',
  imports: [FormsModule, RouterLink, PersianDatepickerComponent],
  template: `
    <div class="well-detail-page space-y-6">
      <!-- Back Navigation & Top Actions -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <a
          routerLink="/admin/wells"
          class="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-white border border-emerald-200 hover:border-emerald-300 py-2 px-3.5 rounded-xl shadow-2xs transition-all cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span>بازگشت به لیست چاه‌ها</span>
        </a>

        @if (well(); as curWell) {
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              class="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-900 font-semibold"
              (click)="openChangeRepModal(curWell)"
              title="تغییر یا حذف نماینده مسئول این چاه"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-emerald-700">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M19 8v6"></path>
                <path d="M22 11h-6"></path>
              </svg>
              <span>تغییر یا حذف نماینده</span>
            </button>
            <button
              type="button"
              class="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              (click)="openEditWellModal(curWell)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 text-gray-600">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>ویرایش مشخصات چاه</span>
            </button>
          </div>
        }
      </div>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>در حال بارگذاری اطلاعات چاه...</span>
        </div>
      } @else if (error()) {
        <div class="empty-state">
          <svg class="w-12 h-12 text-rose-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 class="text-base font-bold text-gray-800">{{ error() }}</h3>
          <a routerLink="/admin/wells" class="btn-primary mt-4 inline-block">بازگشت به لیست چاه‌ها</a>
        </div>
      } @else if (well(); as curWell) {
        <!-- Well Hero Header Card -->
        <div class="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                  <path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"></path>
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h1 class="text-xl font-black text-gray-900">{{ curWell.name }}</h1>
                  <span class="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                    شناسه: {{ curWell.id.slice(0, 8) }}
                  </span>
                </div>
                @if (curWell.description) {
                  <p class="text-xs text-gray-500 mt-1 leading-relaxed">{{ curWell.description }}</p>
                }
              </div>
            </div>

            <!-- Representative Card with Change/Remove Action -->
            <div class="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200/90 px-3.5 py-2.5 rounded-xl min-w-[240px]">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-200 shrink-0">
                  {{ (curWell.representative_name || 'ن').charAt(0) }}
                </div>
                <div>
                  <span class="text-[11px] text-gray-400 block font-medium">نماینده مسئول چاه</span>
                  <strong class="text-xs text-gray-800 font-bold">
                    {{ curWell.representative_name || 'ثبت نشده (بدون نماینده)' }}
                  </strong>
                  @if (curWell.representative_phone) {
                    <span dir="ltr" class="text-[11px] text-gray-500 font-mono block">
                      {{ curWell.representative_phone }}
                    </span>
                  }
                </div>
              </div>
              <button
                type="button"
                class="text-xs text-emerald-700 hover:text-emerald-950 font-semibold bg-white hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                (click)="openChangeRepModal(curWell)"
                title="تغییر یا حذف نماینده این چاه"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>تغییر</span>
              </button>
            </div>
          </div>

          <!-- Quick Stat Pills -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100">
            <div class="bg-gray-50/80 rounded-xl p-2.5 text-center">
              <span class="text-[11px] text-gray-500 block">کشاورزان عضو</span>
              <strong class="text-sm font-bold text-gray-800 font-mono">
                {{ formatNumberFa(curWellFarmers().length) }} نفر
              </strong>
            </div>

            <div class="bg-gray-50/80 rounded-xl p-2.5 text-center">
              <span class="text-[11px] text-gray-500 block">دوره‌های سال آبی</span>
              <strong class="text-sm font-bold text-gray-800 font-mono">
                {{ formatNumberFa(curWaterYears().length) }} دوره
              </strong>
            </div>

            <div class="bg-emerald-50/60 rounded-xl p-2.5 text-center border border-emerald-100">
              <span class="text-[11px] text-emerald-800 block">مجموع هزینه پیامک</span>
              <strong class="text-sm font-bold text-emerald-950 font-mono">
                {{ formatNumberFa(totalSmsCostTomans()) }} تومان
              </strong>
            </div>

            <div class="bg-purple-50/60 rounded-xl p-2.5 text-center border border-purple-100">
              <span class="text-[11px] text-purple-800 block">پیامک‌های ارسالی</span>
              <strong class="text-sm font-bold text-purple-950 font-mono">
                {{ formatNumberFa(curWellExpenses().length) }} پیامک
              </strong>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          <div class="flex border-b border-gray-200 bg-gray-50/60 px-4 gap-2 overflow-x-auto">
            <button
              type="button"
              class="tab-btn"
              [class.active]="activeTab() === 'water_years'"
              (click)="activeTab.set('water_years')"
            >
              سال‌های آبی (تاریخ و سهمیه‌بندی)
              <span class="tab-badge">{{ curWaterYears().length }}</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.active]="activeTab() === 'farmers'"
              (click)="activeTab.set('farmers')"
            >
              کشاورزان تحت پوشش
              <span class="tab-badge">{{ curWellFarmers().length }}</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              [class.active]="activeTab() === 'expenses'"
              (click)="activeTab.set('expenses')"
            >
              هزینه‌های پیامک
              <span class="tab-badge">{{ curWellExpenses().length }}</span>
            </button>
          </div>

          <div class="p-5 sm:p-6">
            <!-- TAB 1: Water Years -->
            @if (activeTab() === 'water_years') {
              <div class="space-y-5">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 class="text-sm font-bold text-gray-900">دوره‌های سال آبی چاه</h2>
                    <p class="text-xs text-gray-500">تعریف بازه زمانی مجاز برای تخصیص و مصرف آب کشاورزان</p>
                  </div>
                  <button
                    type="button"
                    class="btn-primary text-xs py-2 px-3.5"
                    (click)="showAddWaterYearForm.set(!showAddWaterYearForm())"
                  >
                    {{ showAddWaterYearForm() ? 'بستن فرم' : '+ تعریف سال آبی جدید' }}
                  </button>
                </div>

                <!-- Add Water Year Form -->
                @if (showAddWaterYearForm()) {
                  <div class="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
                    <h3 class="text-xs font-bold text-emerald-900">تعریف دوره جدید سال آبی</h3>

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

                    <div>
                      <label for="wy-hours-per-share" class="form-label text-xs">معادل ساعت آب به ازای هر ساعت مالکیت (سهم)</label>
                      <input
                        id="wy-hours-per-share"
                        type="number"
                        min="0"
                        step="0.5"
                        class="form-input text-xs"
                        placeholder="مثال: ۱۶ (جهت نمایش: هر ساعت مالکیت مساوی با ۱۶ ساعت)"
                        [ngModel]="wyFormHoursPerShare()"
                        (ngModelChange)="wyFormHoursPerShare.set($event)"
                      />
                      <p class="text-[11px] text-gray-500 mt-1">این عدد صرفاً جهت نمایش و درج در پیامک تخصیص سهمیه به کشاورزان است.</p>
                    </div>

                    <!-- Persian Date Pickers -->
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

                <!-- Water Years List -->
                @if (curWaterYears().length === 0) {
                  <p class="text-xs text-gray-500 text-center py-6 bg-gray-50 rounded-xl">
                    هنوز سال آبی برای این چاه ثبت نشده است. از دکمه بالا برای ایجاد استفاده کنید.
                  </p>
                } @else {
                  <div class="space-y-3">
                    @for (wy of curWaterYears(); track wy.id) {
                      <div class="p-4 bg-white border border-gray-200 rounded-xl shadow-2xs flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <strong class="text-sm text-gray-900 block font-bold">{{ wy.description }}</strong>
                          <div class="flex items-center gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                            <span>از: <strong class="text-gray-800 font-mono">{{ formatJalaliDisplay(wy.start_date) }}</strong></span>
                            <span>تا: <strong class="text-gray-800 font-mono">{{ formatJalaliDisplay(wy.end_date) }}</strong></span>
                            @if (wy.hours_per_share !== null && wy.hours_per_share !== undefined) {
                              <span class="inline-flex items-center text-[11px] bg-sky-50 text-sky-850 px-2 py-0.5 rounded-md border border-sky-200">
                                هر ساعت مالکیت = {{ formatNumberFa(wy.hours_per_share) }} ساعت
                              </span>
                            }
                          </div>
                        </div>
                        <span class="inline-flex items-center text-[11px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                          فعال
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- TAB 2: Farmers -->
            @if (activeTab() === 'farmers') {
              <div class="space-y-5">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 class="text-sm font-bold text-gray-900">کشاورزان متصل به این چاه</h2>
                    <p class="text-xs text-gray-500">مشاهده سهمیه سال آبی، مصرف ثبت‌شده و مانده سهمیه</p>
                  </div>
                </div>

                <!-- Add Farmer Toolbar -->
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
                  @if (curWaterYears().length > 0 && curWaterYears()[0].hours_per_share !== null && curWaterYears()[0].hours_per_share !== undefined) {
                    <label class="inline-flex items-center gap-1.5 text-xs text-gray-700 select-none cursor-pointer py-1 px-2 rounded-lg hover:bg-gray-100">
                      <input
                        type="checkbox"
                        class="form-checkbox h-3.5 w-3.5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                        [ngModel]="addFarmerIncludeHoursPerShare()"
                        (ngModelChange)="addFarmerIncludeHoursPerShare.set($event)"
                      />
                      <span>درج نرخ مالکیت در پیامک (هر ساعت = {{ formatNumberFa(curWaterYears()[0].hours_per_share) }} س)</span>
                    </label>
                  }
                  <button
                    type="button"
                    class="btn-primary text-xs py-2 px-3 whitespace-nowrap"
                    [disabled]="!selectedFarmerToAdd()"
                    (click)="addFarmer(curWell.id)"
                  >
                    افزودن کشاورز به چاه
                  </button>
                </div>

                <!-- Farmers List -->
                @if (curWellFarmers().length === 0) {
                  <p class="text-xs text-gray-500 text-center py-6 bg-gray-50 rounded-xl">
                    کشاورزی به این چاه متصل نشده است. از کادر بالا برای افزودن کشاورز استفاده کنید.
                  </p>
                } @else {
                  <div class="space-y-2.5">
                    @for (wf of curWellFarmers(); track wf.id) {
                      <div class="p-3.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                            {{ wf.farmer_name.charAt(0) }}
                          </div>
                          <div>
                            <div class="flex items-center gap-2">
                              <strong class="text-sm text-gray-900 font-bold">{{ wf.farmer_name }}</strong>
                              <span dir="ltr" class="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">{{ wf.farmer_phone }}</span>
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
                            class="btn-secondary text-xs py-1.5 px-3"
                            (click)="openSetQuotaModal(wf)"
                          >
                            {{ wf.allocatedHours !== undefined && wf.allocatedHours !== null ? 'ویرایش سهمیه' : '＋ ثبت سهمیه' }}
                          </button>
                          <button
                            type="button"
                            class="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer border-0 bg-transparent px-2.5 py-1.5"
                            (click)="removeFarmer(wf.id, curWell.id)"
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

            <!-- TAB 3: SMS Expenses -->
            @if (activeTab() === 'expenses') {
              <div class="space-y-5">
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div class="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl shadow-2xs">
                    <span class="text-xs text-emerald-800 font-semibold block mb-1">مجموع کل هزینه پیامک‌ها (ریال)</span>
                    <div class="text-lg font-black text-emerald-950 font-mono">
                      {{ formatNumberFa(totalSmsCostRials()) }} <span class="text-xs font-normal">ریال</span>
                    </div>
                  </div>

                  <div class="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl shadow-2xs">
                    <span class="text-xs text-blue-800 font-semibold block mb-1">معادل به تومان</span>
                    <div class="text-lg font-black text-blue-950 font-mono">
                      {{ formatNumberFa(totalSmsCostTomans()) }} <span class="text-xs font-normal">تومان</span>
                    </div>
                  </div>

                  <div class="p-4 bg-purple-50/70 border border-purple-200/80 rounded-2xl shadow-2xs">
                    <span class="text-xs text-purple-800 font-semibold block mb-1">تعداد کل پیامک‌های ارسالی</span>
                    <div class="text-lg font-black text-purple-950 font-mono">
                      {{ formatNumberFa(curWellExpenses().length) }} <span class="text-xs font-normal">پیامک</span>
                    </div>
                  </div>
                </div>

                <!-- SMS Expenses List -->
                @if (curWellExpenses().length === 0) {
                  <div class="text-center py-12 bg-gray-50/80 rounded-2xl border border-dashed border-gray-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-12 h-12 text-gray-400 mx-auto mb-2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.874-.78 2.658 2.658 0 00-.096-.694A5.94 5.94 0 013 15.5c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                    <h3 class="text-sm font-bold text-gray-700">هنوز هیچ هزینه سرویس پیامکی برای این چاه ثبت نشده است</h3>
                    <p class="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
                      هنگامی که نماینده مسئول مصرف آب کشاورزان را ثبت کند و پیامک ارسال شود، هزینه ارسال کاوه‌نگار با عنوان «هزینه سرویس پیامکی» به صورت خودکار در این جدول درج خواهد شد.
                    </p>
                  </div>
                } @else {
                  <div class="space-y-3">
                    @for (exp of curWellExpenses(); track exp.id) {
                      <div class="p-4 bg-white border border-gray-200 rounded-xl flex items-start justify-between gap-3 flex-wrap shadow-2xs hover:border-emerald-300 transition-colors">
                        <div class="space-y-2 flex-1 min-w-[240px]">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              {{ exp.title }}
                            </span>
                            @if (exp.recipient_name) {
                              <strong class="text-xs font-bold text-gray-900">{{ exp.recipient_name }}</strong>
                            }
                            @if (exp.recipient_phone) {
                              <span dir="ltr" class="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                                {{ exp.recipient_phone }}
                              </span>
                            }
                          </div>

                          @if (exp.description) {
                            <p class="text-xs text-gray-600 leading-relaxed">{{ exp.description }}</p>
                          }

                          <div class="flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
                            <span>تاریخ و ساعت ارسال: <strong class="text-gray-700 font-mono">{{ formatJalaliDateTime(exp.created_at) }}</strong></span>
                            @if (exp.message_id) {
                              <span class="font-mono">شناسه پیامک: {{ exp.message_id }}</span>
                            }
                          </div>
                        </div>

                        <div class="text-left bg-emerald-50/70 border border-emerald-200 rounded-xl px-3.5 py-2.5 shrink-0">
                          <span class="text-[10px] text-emerald-700 block font-medium">هزینه ارسال</span>
                          <div class="text-base font-bold text-emerald-950 font-mono">
                            {{ formatNumberFa(exp.cost) }} <span class="text-xs font-normal">ریال</span>
                          </div>
                          @if (exp.cost >= 10) {
                            <div class="text-[11px] text-emerald-700 font-mono mt-0.5">
                              ({{ formatNumberFa(toTomans(exp.cost)) }} تومان)
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Modal: Edit Well -->
      @if (showEditWellModal()) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-well-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeEditWellModal()" aria-label="بستن"></button>
          <div class="modal-card">
            <div class="modal-header">
              <h3 id="edit-well-modal-title" class="modal-title">ویرایش مشخصات چاه</h3>
              <button type="button" class="modal-close-btn" (click)="closeEditWellModal()" aria-label="بستن">✕</button>
            </div>

            <form (submit)="saveWellChanges(); $event.preventDefault()" class="modal-body space-y-4">
              <div>
                <label for="modal-well-name" class="form-label">نام چاه <span class="text-rose-500">*</span></label>
                <input
                  id="modal-well-name"
                  type="text"
                  class="form-input"
                  required
                  [ngModel]="editWellName()"
                  (ngModelChange)="editWellName.set($event)"
                  name="editWellName"
                />
              </div>

              <div>
                <label for="modal-well-desc" class="form-label">توضیحات / آدرس</label>
                <textarea
                  id="modal-well-desc"
                  class="form-input resize-none"
                  rows="3"
                  [ngModel]="editWellDesc()"
                  (ngModelChange)="editWellDesc.set($event)"
                  name="editWellDesc"
                ></textarea>
              </div>

              <div>
                <label for="modal-well-rep" class="form-label">نماینده مسئول</label>
                <select
                  id="modal-well-rep"
                  class="form-select"
                  [ngModel]="editWellRepId()"
                  (ngModelChange)="editWellRepId.set($event)"
                  name="editWellRepId"
                >
                  <option value="">-- بدون نماینده --</option>
                  @for (rep of availableRepresentatives(); track rep.id) {
                    <option [value]="rep.id">{{ rep.full_name }} ({{ rep.phone }})</option>
                  }
                </select>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="closeEditWellModal()">انصراف</button>
                <button type="submit" class="btn-primary" [disabled]="isSubmittingEdit()">
                  {{ isSubmittingEdit() ? 'در حال ذخیره...' : 'ذخیره تغییرات' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal: Change or Remove Representative -->
      @if (showChangeRepModal(); as curModalWell) {
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
                  <p class="text-xs text-gray-500">چاه «{{ well()?.name }}»</p>
                </div>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeChangeRepModal()" aria-label="بستن">✕</button>
            </div>

            <div class="modal-body space-y-4">
              <!-- Current Representative Summary -->
              <div class="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <span class="text-xs font-semibold text-gray-500 block mb-2">نماینده فعلی این چاه:</span>
                @if (well()?.representative_name) {
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-full bg-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center">
                        {{ well()?.representative_name?.charAt(0) }}
                      </div>
                      <div>
                        <strong class="text-xs text-gray-900 block">{{ well()?.representative_name }}</strong>
                        @if (well()?.representative_phone) {
                          <span dir="ltr" class="text-[11px] text-gray-500 font-mono">{{ well()?.representative_phone }}</span>
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
                  با تغییر نماینده یا حذف آن، دسترسی نماینده قبلی به این چاه و تمام بخش‌های آن (ثبت مصارف، ویرایش کشاورزان، سهمیه‌ها و پیامک‌ها) بلافاصله در پایگاه‌داده و پنل کاربری مسدود می‌گردد.
                </p>
              </div>

              <!-- Select New Representative -->
              <div class="space-y-1.5">
                <label for="change-rep-select" class="form-label font-bold text-gray-800">
                  انتخاب نماینده جدید
                </label>
                <select
                  id="change-rep-select"
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
              @if (well()?.representative_id) {
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

      <!-- Modal: Set / Edit Farmer Quota -->
      @if (editingFarmerForQuota(); as editingWf) {
        <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="set-quota-modal-title">
          <button type="button" class="backdrop-dismiss" (click)="closeSetQuotaModal()" aria-label="بستن"></button>
          <div class="modal-card modal-compact">
            <div class="modal-header">
              <div>
                <h3 id="set-quota-modal-title" class="modal-title">
                  {{ editingWf.allocatedHours !== undefined && editingWf.allocatedHours !== null ? 'ویرایش سهمیه کشاورز' : 'ثبت سهمیه کشاورز' }}
                </h3>
                <span class="text-xs text-gray-500">{{ editingWf.farmer_name }} ({{ editingWf.farmer_phone }})</span>
              </div>
              <button type="button" class="modal-close-btn" (click)="closeSetQuotaModal()">✕</button>
            </div>

            <form (submit)="saveFarmerQuota(); $event.preventDefault()" class="modal-body space-y-4">
              <div>
                <label for="quota-hours" class="form-label">سهمیه آب (ساعت) <span class="text-rose-500">*</span></label>
                <input
                  id="quota-hours"
                  type="number"
                  step="any"
                  min="0"
                  class="form-input"
                  placeholder="مثال: 12.5"
                  required
                  [ngModel]="editingQuotaHours()"
                  (ngModelChange)="editingQuotaHours.set($event)"
                  name="editingQuotaHours"
                />
              </div>

              @if (curWaterYears().length > 0 && curWaterYears()[0].hours_per_share !== null && curWaterYears()[0].hours_per_share !== undefined) {
                <div class="p-3 bg-sky-50 border border-sky-100 rounded-xl space-y-2">
                  <div class="flex items-center justify-between text-xs text-sky-900">
                    <span>مبنای سال آبی:</span>
                    <strong>هر ساعت مالکیت = {{ formatNumberFa(curWaterYears()[0].hours_per_share) }} ساعت</strong>
                  </div>
                  <label class="flex items-center gap-2 text-xs text-gray-700 select-none cursor-pointer pt-1 border-t border-sky-200/50">
                    <input
                      type="checkbox"
                      class="form-checkbox h-4 w-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                      [ngModel]="quotaModalIncludeHoursPerShare()"
                      (ngModelChange)="quotaModalIncludeHoursPerShare.set($event)"
                      name="includeHps"
                    />
                    <span>درج متن معادل ساعت مالکیت در پیامک سهمیه</span>
                  </label>
                </div>
              }

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="closeSetQuotaModal()">انصراف</button>
                <button type="submit" class="btn-primary" [disabled]="isSubmittingQuota()">
                  {{ isSubmittingQuota() ? 'در حال ذخیره...' : 'ذخیره سهمیه' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .well-detail-page {
      max-width: 1200px;
      margin: 0 auto;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem 1rem;
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid #e5ede7;
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
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid #e5ede7;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.88rem 0.75rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: #64748b;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      color: #08633f;
    }

    .tab-btn.active {
      color: #08633f;
      border-bottom-color: #08633f;
      background: #ffffff;
    }

    .tab-badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      background: #e2e8f0;
      color: #334155;
      font-family: monospace;
    }

    .tab-btn.active .tab-badge {
      background: #d1fae5;
      color: #065f46;
    }

    /* Form Styles */
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

    .modal-card.modal-compact {
      max-width: 420px;
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
      font-size: 1.05rem;
      font-weight: 800;
      color: #0d281e;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      font-size: 1.15rem;
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

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      border-top: 1px solid #eef4f0;
      background: #fcfdfc;
    }

    .btn-primary {
      background: #08633f;
      color: #ffffff;
      border: none;
      border-radius: 0.65rem;
      padding: 0.65rem 1.25rem;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .btn-primary:hover:not(:disabled) {
      background: #064d31;
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f0f6f2;
      color: #274d3d;
      border: 1px solid #c8ded1;
      border-radius: 0.65rem;
      padding: 0.65rem 1.15rem;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-secondary:hover {
      background: #e5ede7;
    }
  `,
})
export class WellDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dataService = inject(AdminDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly wellId = signal('');
  protected readonly well = signal<AdminWell | null>(null);
  protected readonly allUsers = signal<UserProfile[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly error = signal('');

  protected readonly activeTab = signal<'water_years' | 'farmers' | 'expenses'>('water_years');

  // Water Years Data & Form
  protected readonly curWaterYears = signal<AdminWaterYear[]>([]);
  protected readonly showAddWaterYearForm = signal(false);
  protected readonly isSubmittingWY = signal(false);
  protected readonly wyFormDesc = signal('');
  protected readonly wyFormHoursPerShare = signal('');
  protected readonly wyFormStartDate = signal('1404/07/01');
  protected readonly wyFormEndDate = signal('1405/06/31');
  protected readonly wyFormStartIso = signal('2025-09-23');
  protected readonly wyFormEndIso = signal('2026-09-22');

  // Farmers Data & Form
  protected readonly curWellFarmers = signal<AdminWellFarmer[]>([]);
  protected readonly selectedFarmerToAdd = signal('');
  protected readonly farmerQuotaToAdd = signal('');

  // Quota Modal
  protected readonly editingFarmerForQuota = signal<AdminWellFarmer | null>(null);
  protected readonly editingQuotaHours = signal('');
  protected readonly isSubmittingQuota = signal(false);
  protected readonly addFarmerIncludeHoursPerShare = signal(true);
  protected readonly quotaModalIncludeHoursPerShare = signal(true);

  // SMS Expenses
  protected readonly curWellExpenses = signal<AdminWellExpense[]>([]);

  protected readonly totalSmsCostRials = computed(() => {
    return this.curWellExpenses().reduce((sum, exp) => sum + (exp.cost || 0), 0);
  });

  protected readonly totalSmsCostTomans = computed(() => {
    return this.toTomans(this.totalSmsCostRials());
  });

  // Edit Well Modal
  protected readonly showEditWellModal = signal(false);
  protected readonly editWellName = signal('');
  protected readonly editWellDesc = signal('');
  protected readonly editWellRepId = signal('');
  protected readonly isSubmittingEdit = signal(false);

  // Change / Remove Representative Modal
  protected readonly showChangeRepModal = signal(false);
  protected readonly selectedRepId = signal('');
  protected readonly isSubmittingRepChange = signal(false);

  protected readonly availableRepresentatives = computed(() => {
    return this.allUsers().filter(
      (u) => u.is_active && (u.role === 'representative' || u.role === 'admin')
    );
  });

  protected readonly availableFarmersToAdd = computed(() => {
    const existingFarmerIds = new Set(this.curWellFarmers().map((wf) => wf.farmer_id));
    return this.allUsers().filter(
      (u) => u.is_active && u.role === 'farmer' && !existingFarmerIds.has(u.id)
    );
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('شناسه چاه مشخص نشده است.');
      this.isLoading.set(false);
      return;
    }
    this.wellId.set(id);
    this.loadWellData(id);
  }

  private loadWellData(wellId: string): void {
    this.isLoading.set(true);
    this.error.set('');

    forkJoin({
      well: this.dataService.getWell$(wellId),
      wy: this.dataService.getWaterYears$(wellId),
      farmers: this.dataService.getWellFarmers$(wellId),
      expenses: this.dataService.getWellExpenses$(wellId),
      users: this.dataService.getUsers$(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'خطا در دریافت اطلاعات چاه.';
          this.error.set(msg);
          toast.error(msg);
          return of(null);
        })
      )
      .subscribe((res) => {
        this.isLoading.set(false);
        if (!res) return;

        this.well.set(res.well);
        this.curWaterYears.set(res.wy);
        this.curWellFarmers.set(res.farmers);
        this.curWellExpenses.set(res.expenses);
        this.allUsers.set(res.users);
      });
  }

  // --- Water Year Actions ---
  protected saveWaterYear(wellId: string): void {
    const desc = this.wyFormDesc().trim();
    const startIso = this.wyFormStartIso().trim();
    const endIso = this.wyFormEndIso().trim();
    const hoursPerShareStr = this.wyFormHoursPerShare().trim();
    const hoursPerShare = hoursPerShareStr ? parseHoursNumber(hoursPerShareStr) : null;

    if (!desc || !startIso || !endIso) {
      toast.error('لطفاً تمامی فیلدهای الزامی سال آبی را تکمیل نمایید.');
      return;
    }

    this.isSubmittingWY.set(true);
    this.dataService
      .createWaterYear$({
        well_id: wellId,
        description: desc,
        start_date: startIso,
        end_date: endIso,
        hours_per_share: hoursPerShare,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (newWy) => {
          this.isSubmittingWY.set(false);
          this.showAddWaterYearForm.set(false);
          this.curWaterYears.update((list) => [newWy, ...list]);
          this.wyFormDesc.set('');
          this.wyFormHoursPerShare.set('');
          toast.success(`دوره جدید «${newWy.description}» برای چاه با موفقیت ثبت شد.`);
        },
        error: (err: unknown) => {
          this.isSubmittingWY.set(false);
          toast.error(err instanceof Error ? err.message : 'خطا در ثبت سال آبی جدید.');
        },
      });
  }

  // --- Farmer Actions ---
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

          if (quota !== undefined && quota > 0 && activeWyId) {
            const activeWy = this.curWaterYears().find((wy) => wy.id === activeWyId);
            this.dataService
              .notifyFarmerQuotaAssigned({
                wellId,
                wellName: this.well()?.name,
                waterYearId: activeWyId,
                farmerId: newWf.farmer_id,
                farmerPhone: newWf.farmer_phone,
                farmerName: newWf.farmer_name,
                allocatedHours: quota,
                hoursPerShare: activeWy?.hours_per_share,
                includeHoursPerShare: this.addFarmerIncludeHoursPerShare(),
              })
              .then((smsRes) => {
                if (smsRes.success) {
                  toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
                  this.refreshExpenses(wellId);
                }
              });
          }
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در افزودن کشاورز به چاه.');
        },
      });
  }

  protected removeFarmer(wellFarmerId: string, wellId: string): void {
    if (!confirm('آیا از حذف این کشاورز از این چاه اطمینان دارید؟')) return;

    this.dataService
      .removeFarmerFromWell$(wellFarmerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.curWellFarmers.update((list) => list.filter((wf) => wf.id !== wellFarmerId));
          toast.success('کشاورز از این چاه حذف گردید.');
        },
        error: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'خطا در حذف کشاورز.');
        },
      });
  }

  // --- Quota Modal ---
  protected openSetQuotaModal(wf: AdminWellFarmer): void {
    this.editingFarmerForQuota.set(wf);
    this.editingQuotaHours.set(
      wf.allocatedHours !== undefined && wf.allocatedHours !== null ? String(wf.allocatedHours) : ''
    );
  }

  protected closeSetQuotaModal(): void {
    this.editingFarmerForQuota.set(null);
    this.editingQuotaHours.set('');
  }

  protected saveFarmerQuota(): void {
    const editingWf = this.editingFarmerForQuota();
    if (!editingWf) return;

    const hours = parseHoursNumber(this.editingQuotaHours());
    if (hours === null || isNaN(hours) || hours < 0) {
      toast.error('میزان سهمیه باید عددی معتبر و مثبت باشد.');
      return;
    }

    const activeWy = this.curWaterYears().length > 0 ? this.curWaterYears()[0] : null;
    if (!activeWy) {
      toast.error('ابتدا باید یک سال آبی برای این چاه تعریف نمایید.');
      return;
    }

    this.isSubmittingQuota.set(true);
    this.dataService
      .setFarmerQuota$(editingWf.id, activeWy.id, hours)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ allocatedHours }) => {
          this.isSubmittingQuota.set(false);
          this.curWellFarmers.update((list) =>
            list.map((wf) => {
              if (wf.id === editingWf.id) {
                const used = wf.usedHours || 0;
                return {
                  ...wf,
                  allocatedHours,
                  remainingHours: Math.max(0, allocatedHours - used),
                };
              }
              return wf;
            })
          );
          toast.success(`سهمیه کشاورز «${editingWf.farmer_name}» به ${allocatedHours} ساعت به‌روزرسانی شد.`);
          this.closeSetQuotaModal();

          const curW = this.well();
          if (curW) {
            this.dataService
              .notifyFarmerQuotaAssigned({
                wellId: curW.id,
                wellName: curW.name,
                waterYearId: activeWy.id,
                farmerId: editingWf.farmer_id,
                farmerPhone: editingWf.farmer_phone,
                farmerName: editingWf.farmer_name,
                allocatedHours,
                hoursPerShare: activeWy.hours_per_share,
                includeHoursPerShare: this.quotaModalIncludeHoursPerShare(),
              })
              .then((smsRes) => {
                if (smsRes.success) {
                  toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
                  this.refreshExpenses(curW.id);
                }
              });
          }
        },
        error: (err: unknown) => {
          this.isSubmittingQuota.set(false);
          toast.error(err instanceof Error ? err.message : 'خطا در به‌روزرسانی سهمیه.');
        },
      });
  }

  // --- Edit Well Modal ---
  protected openEditWellModal(well: AdminWell): void {
    this.editWellName.set(well.name);
    this.editWellDesc.set(well.description || '');
    this.editWellRepId.set(well.representative_id || '');
    this.showEditWellModal.set(true);
  }

  protected closeEditWellModal(): void {
    this.showEditWellModal.set(false);
  }

  protected saveWellChanges(): void {
    const cur = this.well();
    if (!cur) return;

    const name = this.editWellName().trim();
    if (!name) {
      toast.error('نام چاه الزامی است.');
      return;
    }

    this.isSubmittingEdit.set(true);
    const repId = this.editWellRepId() || null;
    const desc = this.editWellDesc().trim() || null;

    const prevRepId = cur.representative_id;
    this.dataService
      .updateWell$(cur.id, {
        name,
        description: desc,
        representative_id: repId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmittingEdit.set(false);
          this.showEditWellModal.set(false);
          const repObj = this.allUsers().find((u) => u.id === repId);
          this.well.update((w) =>
            w
              ? {
                  ...w,
                  name,
                  description: desc,
                  representative_id: repId,
                  representative_name: repObj ? repObj.full_name : null,
                  representative_phone: repObj ? repObj.phone : null,
                }
              : null
          );
          toast.success('مشخصات چاه با موفقیت ویرایش شد.');

          // If a new representative is assigned, send SMS notification
          if (repId && repId !== prevRepId) {
            void this.dataService
              .notifyRepresentativeAssigned({
                wellId: cur.id,
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
                  this.loadWellData(cur.id);
                } else if (smsRes.message) {
                  toast.warning(`وضعیت پیامک: ${smsRes.message}`);
                }
              });
          }
        },
        error: (err: unknown) => {
          this.isSubmittingEdit.set(false);
          toast.error(err instanceof Error ? err.message : 'خطا در ویرایش مشخصات چاه.');
        },
      });
  }

  // --- Change / Remove Representative Modal ---
  protected openChangeRepModal(well: AdminWell): void {
    this.selectedRepId.set(well.representative_id || '');
    this.showChangeRepModal.set(true);
  }

  protected closeChangeRepModal(): void {
    this.showChangeRepModal.set(false);
  }

  protected saveRepresentativeChange(): void {
    const cur = this.well();
    if (!cur) return;

    const newRepId = this.selectedRepId() || null;
    this.isSubmittingRepChange.set(true);

    this.dataService
      .changeWellRepresentative$(cur.id, newRepId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmittingRepChange.set(false);
          this.showChangeRepModal.set(false);
          const repObj = this.allUsers().find((u) => u.id === newRepId);
          this.well.update((w) =>
            w
              ? {
                  ...w,
                  representative_id: newRepId,
                  representative_name: repObj ? repObj.full_name : null,
                  representative_phone: repObj ? repObj.phone : null,
                }
              : null
          );
          if (newRepId) {
            toast.success(
              `نماینده چاه با موفقیت به «${repObj?.full_name || 'نماینده جدید'}» تغییر یافت و دسترسی نماینده قبلی لغو گردید.`
            );

            // Send assignment SMS to new representative
            void this.dataService
              .notifyRepresentativeAssigned({
                wellId: cur.id,
                wellName: cur.name,
                representativeId: newRepId,
                phone: repObj?.phone,
                fullName: repObj?.full_name,
              })
              .then((smsRes) => {
                if (smsRes.success) {
                  toast.info(
                    `پیامک ایجاد پنل برای نماینده «${repObj?.full_name || 'نماینده'}» ارسال شد.`
                  );
                  this.loadWellData(cur.id);
                } else if (smsRes.message) {
                  toast.warning(`وضعیت پیامک: ${smsRes.message}`);
                }
              });
          } else {
            toast.success('نماینده چاه حذف شد و کلیه دسترسی‌های وی به این چاه مسدود گردید.');
          }
        },
        error: (err: unknown) => {
          this.isSubmittingRepChange.set(false);
          toast.error(err instanceof Error ? err.message : 'خطا در تغییر نماینده چاه.');
        },
      });
  }

  // --- Formatting Helpers ---
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

  protected formatJalaliDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tehran',
    }).format(d).replace(',', ' -');
  }

  protected formatNumberFa(num: number | null | undefined): string {
    if (num === null || num === undefined) return '۰';
    return Number(num).toLocaleString('fa-IR');
  }

  protected toTomans(rials: number | null | undefined): number {
    return Math.floor((rials || 0) / 10);
  }

  private refreshExpenses(wellId: string): void {
    this.dataService
      .getWellExpenses$(wellId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (expenses) => this.curWellExpenses.set(expenses),
      });
  }
}
