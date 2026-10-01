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
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
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
  selector: 'app-farmers-list',
  imports: [ButtonComponent, FormField, PersianDatepickerComponent, RouterLink],
  templateUrl: './farmers-list.component.html',
  styleUrl: './farmers-list.component.css',
})
export class FarmersListComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dashboard = signal<RepresentativeDashboardData | null>(null);
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
  protected readonly showEditFarmerModal = signal(false);
  protected readonly selectedFarmerForEdit = signal<RepresentativeFarmerItem | null>(null);
  protected readonly editFarmerName = signal('');
  protected readonly editFarmerError = signal('');
  protected readonly submittingEditFarmer = signal(false);

  protected readonly showDeleteFarmerModal = signal(false);
  protected readonly selectedFarmerForDelete = signal<RepresentativeFarmerItem | null>(null);
  protected readonly deleteFarmerError = signal('');
  protected readonly submittingDeleteFarmer = signal(false);

  protected readonly submitting = signal(false);
  protected readonly modalError = signal('');

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

  protected readonly filteredFarmers = computed<RepresentativeFarmerItem[]>(() => {
    const list = this.dashboard()?.farmers || [];
    const q = normalizeName(this.searchQuery());
    if (!q) return list;
    return list.filter((f) => normalizeName(f.name).includes(q) || f.phone.includes(q));
  });

  protected usagePercent(farmer: RepresentativeFarmerItem): number {
    if (farmer.quotaHours <= 0) return 0;
    return Math.min(100, Math.round((farmer.usedHours / farmer.quotaHours) * 100));
  }

  protected usageLevel(farmer: RepresentativeFarmerItem): string {
    const pct = this.usagePercent(farmer);
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'normal';
  }

  ngOnInit(): void {
    this.loadData();
  }

  protected loadData(): void {
    this.loading.set(true);
    this.error.set('');

    this.auth.ensureProfile$().pipe(
      switchMap((profile) => this.portalData.getRepresentativeDashboard$(profile.id)),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (data) => {
        this.dashboard.set(data);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در دریافت اطلاعات کشاورزان';
        this.error.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Usage Modal ---
  protected openRecordUsageModal(farmerId?: string): void {
    this.selectedFarmerForUsage.set(farmerId || '');
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
  }

  protected submitUsage(): void {
    const farmerId = this.selectedFarmerForUsage();
    const hours = parseHoursNumber(this.usageHours());

    if (!farmerId) {
      this.modalError.set('لطفاً کشاورز را انتخاب کنید.');
      return;
    }

    if (hours === null || hours <= 0) {
      this.modalError.set('ساعت کارکرد معتبر (بزرگتر از صفر) وارد کنید.');
      return;
    }

    const farmer = this.dashboard()?.farmers.find((f) => f.id === farmerId);
    if (!farmer?.allocationId) {
      this.modalError.set('برای این کشاورز سهمیه‌ای در سال آبی فعال ثبت نشده است.');
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

    this.portalData.recordWaterUsage$({
      allocationId: farmer.allocationId,
      consumedHours: hours,
      description: this.usageDesc(),
      usedAt: usedAtIso,
      createdBy: repId,
      farmerPhone: farmer.phone,
      farmerName: farmer.name,
      remainingHours: newRemaining,
      wellId: this.dashboard()?.well?.id,
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap((result) => {
        this.closeUsageModal();
        if (result.smsSent) {
          toast.success(`مصرف ${faNumber(hours)} ساعت ثبت شد و پیامک برای کشاورز ارسال شد.`);
        } else {
          toast.success(`مصرف ${faNumber(hours)} ساعت با موفقیت ثبت شد.`);
        }
        return this.portalData.getRepresentativeDashboard$(repId);
      }),
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: (data) => {
        this.dashboard.set(data);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در ثبت کارکرد';
        this.modalError.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Add Farmer Modal Logic ---
  protected openAddFarmerModal(): void {
    this.addFarmerModel.set({
      displayName: '',
      phone: '',
      quota: '',
      includeHoursPerShare: true,
    });
    this.modalError.set('');
    this.showAddFarmerModal.set(true);
  }

  protected closeAddFarmerModal(): void {
    this.showAddFarmerModal.set(false);
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

          const activeWaterYear = this.dashboard()?.waterYear;
          if (quota !== undefined && quota > 0 && waterYearId) {
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

  // --- Edit Farmer Modal Logic ---
  protected openEditFarmerModal(farmer: RepresentativeFarmerItem): void {
    this.selectedFarmerForEdit.set(farmer);
    this.editFarmerName.set(farmer.name);
    this.editFarmerError.set('');
    this.showEditFarmerModal.set(true);
  }

  protected closeEditFarmerModal(): void {
    this.showEditFarmerModal.set(false);
    this.selectedFarmerForEdit.set(null);
    this.editFarmerError.set('');
  }

  protected submitEditFarmer(): void {
    const farmer = this.selectedFarmerForEdit();
    const name = this.editFarmerName().trim();
    if (!farmer) return;

    if (!name) {
      const msg = 'نام کشاورز نمی‌تواند خالی باشد.';
      this.editFarmerError.set(msg);
      toast.error(msg);
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submittingEditFarmer.set(true);
    this.editFarmerError.set('');

    this.portalData.updateFarmerDisplayName$(farmer.wellFarmerId, name).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => {
        this.closeEditFarmerModal();
        toast.success('نام کشاورز با موفقیت ویرایش شد.');
        return this.portalData.getRepresentativeDashboard$(repId);
      }),
      finalize(() => this.submittingEditFarmer.set(false)),
    ).subscribe({
      next: (data) => {
        this.dashboard.set(data);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در ویرایش نام کشاورز';
        this.editFarmerError.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Delete Farmer Modal Logic ---
  protected openDeleteFarmerModal(farmer: RepresentativeFarmerItem): void {
    this.selectedFarmerForDelete.set(farmer);
    this.deleteFarmerError.set('');
    this.showDeleteFarmerModal.set(true);
  }

  protected closeDeleteFarmerModal(): void {
    this.showDeleteFarmerModal.set(false);
    this.selectedFarmerForDelete.set(null);
    this.deleteFarmerError.set('');
  }

  protected submitDeleteFarmer(): void {
    const farmer = this.selectedFarmerForDelete();
    if (!farmer) return;

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submittingDeleteFarmer.set(true);
    this.deleteFarmerError.set('');

    this.portalData.removeFarmerFromWell$(farmer.wellFarmerId).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => {
        this.closeDeleteFarmerModal();
        toast.success(`«${farmer.name}» با موفقیت از چاه حذف شد.`);
        return this.portalData.getRepresentativeDashboard$(repId);
      }),
      finalize(() => this.submittingDeleteFarmer.set(false)),
    ).subscribe({
      next: (data) => {
        this.dashboard.set(data);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در حذف کشاورز از چاه';
        this.deleteFarmerError.set(msg);
        toast.error(msg);
      },
    });
  }
}
