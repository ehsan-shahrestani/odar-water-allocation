import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap, tap } from 'rxjs';
import { toast } from 'ngx-sonner';
import { AuthService, normalizeIranianMobile } from '../../../core/auth.service';
import {
  PortalDataService,
  RepresentativeDashboardData,
  RepresentativeFarmerItem,
  WaterYearItem,
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { CardComponent } from '../../../shared/card/card.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';
import { PersianDatepickerComponent } from '../../../shared/persian-datepicker/persian-datepicker.component';
import {
  formatJalali,
  getTodayJalali,
  jalaliToIso,
} from '../../../shared/persian-datepicker/jalali-utils';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/ی/g, 'ي').replace(/ک/g, 'ك');
}

@Component({
  selector: 'app-representative-home',
  imports: [ButtonComponent, CardComponent, FormField, RouterLink, PersianDatepickerComponent],
  templateUrl: './representative-home.component.html',
  styleUrl: './representative-home.component.css',
})
export class RepresentativeHomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dashboard = signal<RepresentativeDashboardData | null>(null);
  protected readonly waterYears = signal<WaterYearItem[]>([]);
  protected readonly searchQuery = signal('');

  protected formatNumber(value: number | string | undefined | null): string {
    if (value === null || value === undefined || value === '') return '';
    const str = String(value);
    const num = Number(value);
    if (!isNaN(num) && typeof value === 'number') {
      return faNumber(num);
    }
    return str.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)] ?? d);
  }
  protected readonly number = (v: number | string | undefined | null) => this.formatNumber(v);

  // Modals
  protected readonly showUsageModal = signal(false);
  protected readonly showAddFarmerModal = signal(false);
  protected readonly showAddWaterYearModal = signal(false);
  protected readonly showEditWellModal = signal(false);
  protected readonly editWellName = signal('');
  protected readonly editWellError = signal('');
  protected readonly submittingWell = signal(false);

  protected readonly submitting = signal(false);
  protected readonly submittingWY = signal(false);
  protected readonly modalError = signal('');
  protected readonly wyModalError = signal('');

  // Usage modal state
  protected readonly selectedFarmerForUsage = signal('');
  protected readonly selectedFarmerUsageRemaining = computed(() => {
    const id = this.selectedFarmerForUsage();
    if (!id) return null;
    const f = this.dashboard()?.farmers.find((item) => item.id === id);
    return f ? f.remainingHours : null;
  });
  protected readonly usageHours = signal('');
  protected readonly usageDesc = signal('');
  protected readonly usageDate = signal('');
  protected readonly usageDateIso = signal('');

  // Add Farmer form state
  protected readonly addFarmerModel = signal({
    displayName: '',
    phone: '',
    quota: '',
    includeHoursPerShare: true,
  });
  protected readonly addFarmerForm = form(this.addFarmerModel, (path) => {
    required(path.displayName, { message: 'نام کشاورز را وارد کنید.' });
    maxLength(path.displayName, 120, { message: 'نام کشاورز حداکثر ۱۲۰ نویسه است.' });
    required(path.phone, { message: 'شماره موبایل کشاورز را وارد کنید.' });
    validate(path.phone, ({ value }) =>
      normalizeIranianMobile(value())
        ? undefined
        : { kind: 'iranianMobile', message: 'شماره موبایل معتبر مانند 09121234567 وارد کنید.' },
    );
    validate(path.quota, ({ value }) => {
      const rawValue = value().trim();
      if (!rawValue) return undefined;
      const parsed = parseHoursNumber(rawValue);
      return parsed !== null && parsed >= 0
        ? undefined
        : { kind: 'nonNegativeHours', message: 'سهمیه باید عددی صفر یا بیشتر باشد.' };
    });
  });

  // Add Water Year modal state
  protected readonly wyDesc = signal('');
  protected readonly wyHoursPerShare = signal('');
  protected readonly wyStartDate = signal('');
  protected readonly wyEndDate = signal('');
  protected readonly wyStartIso = signal('');
  protected readonly wyEndIso = signal('');

  protected readonly repName = computed(
    () => this.auth.currentProfile()?.full_name || 'نماینده محترم',
  );

  protected readonly filteredFarmers = computed<RepresentativeFarmerItem[]>(() => {
    const list = this.dashboard()?.farmers || [];
    const q = normalizeName(this.searchQuery());
    if (!q) return list;
    return list.filter((f) => normalizeName(f.name).includes(q) || f.phone.includes(q));
  });

  protected readonly totalStats = computed(() => {
    const farmers = this.dashboard()?.farmers || [];
    const totalQuota = farmers.reduce((s, f) => s + f.quotaHours, 0);
    const totalUsed = farmers.reduce((s, f) => s + f.usedHours, 0);
    const totalRemaining = farmers.reduce((s, f) => s + f.remainingHours, 0);
    return { count: farmers.length, totalQuota, totalUsed, totalRemaining };
  });

  ngOnInit(): void {
    this.loadData();
  }

  protected loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.auth
      .ensureProfile$()
      .pipe(
        switchMap((profile) => this.portalData.getRepresentativeDashboard$(profile.id)),
        switchMap((data) => {
          this.dashboard.set(data);
          if (data?.well?.id) {
            return this.portalData.getWaterYearsForWell$(data.well.id).pipe(
              catchError(() => of([])),
              tap((wyList) => this.waterYears.set(wyList)),
            );
          }
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'خطا در دریافت اطلاعات چاه';
          this.error.set(msg);
          toast.error(msg);
        },
      });
  }

  // --- Usage Modal Logic ---
  protected openRecordUsageForFarmer(farmerId: string): void {
    this.selectedFarmerForUsage.set(farmerId);
    this.usageHours.set('');
    this.usageDesc.set('');
    const today = getTodayJalali();
    this.usageDate.set(formatJalali(today.year, today.month, today.day));
    this.usageDateIso.set(jalaliToIso(today.year, today.month, today.day));
    this.modalError.set('');
    this.showUsageModal.set(true);
  }

  protected openRecordUsageModal(): void {
    this.selectedFarmerForUsage.set('');
    this.usageHours.set('');
    this.usageDesc.set('');
    const today = getTodayJalali();
    this.usageDate.set(formatJalali(today.year, today.month, today.day));
    this.usageDateIso.set(jalaliToIso(today.year, today.month, today.day));
    this.modalError.set('');
    this.showUsageModal.set(true);
  }

  protected closeUsageModal(): void {
    this.showUsageModal.set(false);
    this.modalError.set('');
  }

  protected submitUsage(): void {
    const farmerId = this.selectedFarmerForUsage();
    const hours = parseHoursNumber(this.usageHours());

    if (!farmerId) {
      const msg = 'لطفاً کشاورز مورد نظر را انتخاب کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }
    if (hours === null || hours <= 0) {
      const msg = 'مدت زمان مصرف باید یک عدد بزرگتر از صفر (ساعت) باشد.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const farmer = this.dashboard()?.farmers.find((f) => f.id === farmerId);
    if (!farmer) {
      const msg = 'کشاورز مورد نظر یافت نشد.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }
    if (!farmer.allocationId) {
      const msg = 'برای این کشاورز هنوز سهمیه‌ای ثبت نشده است. ابتدا سهمیه او را ثبت کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    if (hours > farmer.remainingHours) {
      const msg = `میزان مصرف (${faNumber(hours)} ساعت) نمی‌تواند بیشتر از باقیمانده سهمیه (${faNumber(farmer.remainingHours)} ساعت) باشد.`;
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    const newRemaining = Number((farmer.remainingHours - hours).toFixed(2));
    const usedAtIso = this.usageDateIso() ? `${this.usageDateIso()}T12:00:00Z` : undefined;

    this.portalData
      .recordWaterUsage$({
        allocationId: farmer.allocationId,
        consumedHours: hours,
        description: this.usageDesc(),
        usedAt: usedAtIso,
        createdBy: repId,
        farmerPhone: farmer.phone,
        farmerName: farmer.name,
        remainingHours: newRemaining,
        wellId: this.dashboard()?.well?.id,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((result) => {
          this.closeUsageModal();
          if (result.smsSent) {
            toast.success(
              `مصرف ${faNumber(hours)} ساعت برای «${farmer.name}» ثبت شد و پیامک ارسال گردید.`,
            );
          } else {
            toast.success(
              `مصرف ${faNumber(hours)} ساعت برای «${farmer.name}» ثبت شد (مانده: ${faNumber(newRemaining)} ساعت).`,
            );
            if (result.message) {
              toast.warning(`وضعیت پیامک: ${result.message}`);
            }
          }
          return this.portalData.getRepresentativeDashboard$(repId);
        }),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.dashboard.set(data);
        },
        error: (err: unknown) => {
          const rawMsg = err instanceof Error ? err.message : 'خطا در ثبت مصرف آب';
          const isForbidden =
            rawMsg.includes('policy') ||
            rawMsg.includes('permission') ||
            rawMsg.includes('42501') ||
            rawMsg.includes('security');
          const msg = isForbidden ? 'دسترسی شما به این چاه توسط مدیر لغو گردیده است.' : rawMsg;
          this.modalError.set(msg);
          toast.error(msg);
          if (isForbidden) {
            this.closeUsageModal();
            this.loadData();
          }
        },
      });
  }

  // --- Add Farmer Modal Logic ---
  protected openAddFarmerModal(): void {
    const wellId = this.dashboard()?.well?.id;
    if (!wellId) return;

    this.showAddFarmerModal.set(true);
    this.modalError.set('');
    this.addFarmerModel.set({
      displayName: '',
      phone: '',
      quota: '',
      includeHoursPerShare: true,
    });
    this.addFarmerForm().reset();
  }

  protected closeAddFarmerModal(): void {
    this.showAddFarmerModal.set(false);
    this.modalError.set('');
  }

  protected submitAddFarmer(): void {
    if (!this.addFarmerForm().valid()) {
      return;
    }

    const wellId = this.dashboard()?.well?.id;
    const waterYearId = this.dashboard()?.waterYear?.id;
    const formValue = this.addFarmerModel();
    const quota = formValue.quota.trim()
      ? (parseHoursNumber(formValue.quota) ?? undefined)
      : undefined;

    if (!wellId) {
      const message = 'اطلاعات چاه یافت نشد.';
      this.modalError.set(message);
      toast.error(message);
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    this.portalData
      .addFarmerToWell$({
        wellId,
        displayName: formValue.displayName,
        phone: formValue.phone,
        allocatedHours: waterYearId ? quota : undefined,
        waterYearId,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((result) => {
          this.closeAddFarmerModal();
          toast.success('کشاورز با موفقیت به چاه افزوده شد.');

          if (quota !== undefined && quota > 0 && waterYearId) {
            const activeWaterYear = this.dashboard()?.waterYear;
            return this.portalData
              .notifyFarmerQuotaAssigned$({
                wellId,
                wellName: this.dashboard()?.well?.name,
                waterYearId,
                farmerId: result.farmerId,
                farmerPhone: result.phone,
                farmerName: result.displayName,
                allocatedHours: quota,
                hoursPerShare: activeWaterYear?.hoursPerShare,
                includeHoursPerShare: formValue.includeHoursPerShare,
              })
              .pipe(
                tap((smsResult) => {
                  if (smsResult.success) {
                    toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
                  } else if (smsResult.message) {
                    toast.warning(`کشاورز ثبت شد؛ وضعیت پیامک: ${smsResult.message}`);
                  }
                }),
                catchError(() => of(null)),
                switchMap(() => this.portalData.getRepresentativeDashboard$(repId)),
              );
          }
          return this.portalData.getRepresentativeDashboard$(repId);
        }),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.dashboard.set(data);
        },
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'خطا در افزودن کشاورز';
          this.modalError.set(msg);
          toast.error(msg);
        },
      });
  }

  // --- Add Water Year Modal Logic ---
  protected openAddWaterYearModal(): void {
    this.wyDesc.set('');
    this.wyHoursPerShare.set('');
    this.wyStartDate.set('1404/07/01');
    this.wyEndDate.set('1405/06/31');
    this.wyStartIso.set('2025-09-23');
    this.wyEndIso.set('2026-09-22');
    this.wyModalError.set('');
    this.showAddWaterYearModal.set(true);
  }

  protected closeAddWaterYearModal(): void {
    this.showAddWaterYearModal.set(false);
    this.wyModalError.set('');
  }

  protected submitAddWaterYear(): void {
    const wellId = this.dashboard()?.well?.id;
    const desc = this.wyDesc().trim();
    const startIso = this.wyStartIso().trim();
    const endIso = this.wyEndIso().trim();
    const hoursPerShareStr = this.wyHoursPerShare().trim();
    const hoursPerShare = hoursPerShareStr ? parseHoursNumber(hoursPerShareStr) : null;

    if (!wellId) {
      toast.error('اطلاعات چاه یافت نشد.');
      return;
    }

    if (!desc || !startIso || !endIso) {
      const msg = 'لطفاً تمامی فیلدهای الزامی را تکمیل کنید.';
      this.wyModalError.set(msg);
      toast.error(msg);
      return;
    }

    this.submittingWY.set(true);
    this.wyModalError.set('');

    this.portalData
      .createWaterYear$({
        wellId,
        description: desc,
        startDate: startIso,
        endDate: endIso,
        hoursPerShare,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submittingWY.set(false)),
      )
      .subscribe({
        next: () => {
          this.closeAddWaterYearModal();
          toast.success(`دوره جدید سال آبی «${desc}» با موفقیت ثبت شد.`);
          this.loadData();
        },
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'خطا در ثبت سال آبی';
          this.wyModalError.set(msg);
          toast.error(msg);
        },
      });
  }

  // --- Edit Well Modal Logic ---
  protected openEditWellModal(): void {
    const currentName = this.dashboard()?.well?.name || '';
    this.editWellName.set(currentName);
    this.editWellError.set('');
    this.showEditWellModal.set(true);
  }

  protected closeEditWellModal(): void {
    this.showEditWellModal.set(false);
    this.editWellError.set('');
  }

  protected submitEditWell(): void {
    const wellId = this.dashboard()?.well?.id;
    const name = this.editWellName().trim();
    if (!wellId) return;

    if (!name) {
      const msg = 'نام چاه نمی‌تواند خالی باشد.';
      this.editWellError.set(msg);
      toast.error(msg);
      return;
    }

    this.submittingWell.set(true);
    this.editWellError.set('');

    this.portalData
      .updateWellName$(wellId, name)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submittingWell.set(false)),
      )
      .subscribe({
        next: () => {
          this.closeEditWellModal();
          toast.success('نام چاه با موفقیت ویرایش شد.');
          const currentDash = this.dashboard();
          if (currentDash?.well) {
            this.dashboard.set({
              ...currentDash,
              well: { ...currentDash.well, name },
            });
          }
        },
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'خطا در ویرایش نام چاه';
          this.editWellError.set(msg);
          toast.error(msg);
        },
      });
  }
}
