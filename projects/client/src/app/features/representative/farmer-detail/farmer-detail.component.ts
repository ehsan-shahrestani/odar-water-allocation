import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, from, of, switchMap, tap } from 'rxjs';
import { toast } from 'ngx-sonner';
import { AuthService } from '../../../core/auth.service';
import {
  FarmerWellDetail,
  PortalDataService,
  WaterYearItem,
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';
import { PersianDatepickerComponent } from '../../../shared/persian-datepicker/persian-datepicker.component';
import {
  formatJalali,
  getTodayJalali,
  jalaliToIso,
} from '../../../shared/persian-datepicker/jalali-utils';

@Component({
  selector: 'app-farmer-detail',
  imports: [ButtonComponent, PersianDatepickerComponent, RouterLink],
  templateUrl: './farmer-detail.component.html',
  styleUrl: './farmer-detail.component.css',
})
export class FarmerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal('');

  // Data
  protected readonly waterYears = signal<WaterYearItem[]>([]);
  protected readonly selectedWaterYearId = signal('');
  protected readonly farmerDetail = signal<FarmerWellDetail | null>(null);
  protected readonly wellId = signal('');
  protected readonly wellName = signal('');
  protected readonly farmerId = signal('');

  // Modals
  protected readonly showUsageModal = signal(false);
  protected readonly showQuotaModal = signal(false);
  protected readonly showEditFarmerModal = signal(false);
  protected readonly editFarmerName = signal('');
  protected readonly editFarmerError = signal('');
  protected readonly submittingEditFarmer = signal(false);

  protected readonly showDeleteFarmerModal = signal(false);
  protected readonly deleteFarmerError = signal('');
  protected readonly submittingDeleteFarmer = signal(false);

  protected readonly submitting = signal(false);
  protected readonly modalError = signal('');

  // Usage form
  protected readonly usageHours = signal('');
  protected readonly usageDesc = signal('');
  protected readonly usageDate = signal('');
  protected readonly usageDateIso = signal('');

  // Quota form
  protected readonly editQuotaValue = signal('');
  protected readonly quotaModalIncludeHoursPerShare = signal(true);

  protected readonly selectedWaterYear = computed(() => {
    const id = this.selectedWaterYearId();
    return this.waterYears().find((wy) => wy.id === id) ?? null;
  });

  protected readonly usagePercent = computed(() => {
    const d = this.farmerDetail();
    if (!d || d.quotaHours <= 0) return 0;
    return Math.min(100, Math.round((d.usedHours / d.quotaHours) * 100));
  });

  protected readonly usageLevel = computed(() => {
    const pct = this.usagePercent();
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'normal';
  });

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

  ngOnInit(): void {
    this.route.paramMap.pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap((params) => {
        const fId = params.get('farmerId');
        if (!fId) {
          throw new Error('شناسه کشاورز نامعتبر است.');
        }
        this.farmerId.set(fId);
        this.loading.set(true);
        this.error.set('');

        return this.auth.ensureProfile$().pipe(
          switchMap((profile) => this.portalData.getRepresentativeDashboard$(profile.id)),
          switchMap((dashboard) => {
            if (!dashboard.well) {
              throw new Error('چاهی به حساب شما متصل نیست.');
            }
            this.wellId.set(dashboard.well.id);
            this.wellName.set(dashboard.well.name);

            return this.portalData.getWaterYearsForWell$(dashboard.well.id).pipe(
              switchMap((years) => {
                this.waterYears.set(years);
                const activeYear = years.find((y) => y.isActive) ?? (years.length > 0 ? years[0] : null);
                const yearId = activeYear ? activeYear.id : '';
                this.selectedWaterYearId.set(yearId);

                // Always load farmer detail, even if 0 water years
                return this.portalData.getFarmerDetailForWell$({
                  farmerId: fId,
                  wellId: dashboard.well!.id,
                  waterYearId: yearId,
                });
              }),
            );
          }),
        );
      }),
    ).subscribe({
      next: (detail) => {
        this.farmerDetail.set(detail);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات پرونده کشاورز';
        this.error.set(msg);
        this.loading.set(false);
        toast.error(msg);
      },
    });
  }

  protected selectWaterYear(yearId: string): void {
    if (yearId === this.selectedWaterYearId()) return;
    this.selectedWaterYearId.set(yearId);
    this.loading.set(true);

    this.portalData.getFarmerDetailForWell$({
      farmerId: this.farmerId(),
      wellId: this.wellId(),
      waterYearId: yearId,
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (detail) => {
        this.farmerDetail.set(detail);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات';
        toast.error(msg);
      },
    });
  }

  // --- Usage Modal ---
  protected openUsageModal(): void {
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
    const detail = this.farmerDetail();
    if (!detail?.allocationId) {
      const msg = 'برای این کشاورز هنوز سهمیه‌ای ثبت نشده است.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const hours = parseHoursNumber(this.usageHours());
    if (hours === null || hours <= 0) {
      const msg = 'مدت زمان مصرف باید یک عدد بزرگتر از صفر باشد.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    if (hours > detail.remainingHours) {
      const msg = `میزان مصرف (${faNumber(hours)} ساعت) نمی‌تواند بیشتر از باقیمانده سهمیه (${faNumber(detail.remainingHours)} ساعت) باشد.`;
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    const newRemaining = Number((detail.remainingHours - hours).toFixed(2));
    const usedAtIso = this.usageDateIso() ? `${this.usageDateIso()}T12:00:00Z` : undefined;

    this.portalData.recordWaterUsage$({
      allocationId: detail.allocationId,
      consumedHours: hours,
      description: this.usageDesc(),
      usedAt: usedAtIso,
      createdBy: repId,
      farmerPhone: detail.farmer.phone,
      farmerName: detail.farmer.name,
      remainingHours: newRemaining,
      wellId: this.wellId(),
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap((result) => {
        this.closeUsageModal();
        if (result.smsSent) {
          toast.success(`مصرف ${faNumber(hours)} ساعت ثبت و پیامک ارسال شد.`);
        } else {
          toast.success(`مصرف ${faNumber(hours)} ساعت ثبت شد.`);
        }
        return this.portalData.getFarmerDetailForWell$({
          farmerId: this.farmerId(),
          wellId: this.wellId(),
          waterYearId: this.selectedWaterYearId(),
        });
      }),
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: (updatedDetail) => {
        this.farmerDetail.set(updatedDetail);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در ثبت مصرف';
        this.modalError.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Quota Modal ---
  protected openQuotaModal(): void {
    const d = this.farmerDetail();
    this.editQuotaValue.set(d && d.quotaHours > 0 ? String(d.quotaHours) : '');
    this.quotaModalIncludeHoursPerShare.set(true);
    this.modalError.set('');
    this.showQuotaModal.set(true);
  }

  protected closeQuotaModal(): void {
    this.showQuotaModal.set(false);
    this.modalError.set('');
  }

  protected submitQuota(): void {
    const detail = this.farmerDetail();
    const waterYearId = this.selectedWaterYearId();

    if (!detail?.wellFarmerId || !waterYearId) {
      const msg = 'اطلاعات سال آبی یا کشاورز یافت نشد. لطفاً ابتدا سال آبی را تعریف کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const hours = parseHoursNumber(this.editQuotaValue());
    if (hours === null || hours < 0) {
      const msg = 'لطفاً سهمیه معتبر وارد کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    this.submitting.set(true);
    this.modalError.set('');

    this.portalData.upsertFarmerAllocation$({
      waterYearId,
      wellFarmerId: detail.wellFarmerId,
      allocatedHours: hours,
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => {
        this.closeQuotaModal();
        toast.success(`سهمیه ${faNumber(hours)} ساعت ذخیره شد.`);

        const selectedWy = this.selectedWaterYear();
        const notify$ = hours > 0
          ? this.portalData.notifyFarmerQuotaAssigned$({
              wellId: this.wellId(),
              wellName: this.wellName(),
              waterYearId,
              farmerId: this.farmerId(),
              farmerPhone: detail.farmer.phone,
              farmerName: detail.farmer.name,
              allocatedHours: hours,
              hoursPerShare: selectedWy?.hoursPerShare,
              includeHoursPerShare: this.quotaModalIncludeHoursPerShare(),
            }).pipe(
              catchError(() => of({ success: false, message: 'عدم ارسال پیامک' })),
              tap((smsRes) => {
                if (smsRes.success) {
                  toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
                }
              }),
            )
          : of({ success: false });

        return notify$.pipe(
          switchMap(() => this.portalData.getFarmerDetailForWell$({
            farmerId: this.farmerId(),
            wellId: this.wellId(),
            waterYearId,
          })),
        );
      }),
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: (updatedDetail) => {
        this.farmerDetail.set(updatedDetail);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در ذخیره سهمیه';
        this.modalError.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Edit Farmer Modal Logic ---
  protected openEditFarmerModal(): void {
    const current = this.farmerDetail()?.farmer.name || '';
    this.editFarmerName.set(current);
    this.editFarmerError.set('');
    this.showEditFarmerModal.set(true);
  }

  protected closeEditFarmerModal(): void {
    this.showEditFarmerModal.set(false);
    this.editFarmerError.set('');
  }

  protected submitEditFarmer(): void {
    const detail = this.farmerDetail();
    const name = this.editFarmerName().trim();
    if (!detail?.wellFarmerId) return;

    if (!name) {
      const msg = 'نام کشاورز نمی‌تواند خالی باشد.';
      this.editFarmerError.set(msg);
      toast.error(msg);
      return;
    }

    this.submittingEditFarmer.set(true);
    this.editFarmerError.set('');

    this.portalData.updateFarmerDisplayName$(detail.wellFarmerId, name).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => {
        this.closeEditFarmerModal();
        toast.success('نام کشاورز با موفقیت ویرایش شد.');
        return this.portalData.getFarmerDetailForWell$({
          farmerId: this.farmerId(),
          wellId: this.wellId(),
          waterYearId: this.selectedWaterYearId(),
        });
      }),
      finalize(() => this.submittingEditFarmer.set(false)),
    ).subscribe({
      next: (updatedDetail) => {
        this.farmerDetail.set(updatedDetail);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در ویرایش نام کشاورز';
        this.editFarmerError.set(msg);
        toast.error(msg);
      },
    });
  }

  // --- Delete Farmer Modal Logic ---
  protected openDeleteFarmerModal(): void {
    this.deleteFarmerError.set('');
    this.showDeleteFarmerModal.set(true);
  }

  protected closeDeleteFarmerModal(): void {
    this.showDeleteFarmerModal.set(false);
    this.deleteFarmerError.set('');
  }

  protected submitDeleteFarmer(): void {
    const detail = this.farmerDetail();
    if (!detail?.wellFarmerId) return;

    this.submittingDeleteFarmer.set(true);
    this.deleteFarmerError.set('');

    this.portalData.removeFarmerFromWell$(detail.wellFarmerId).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => from(this.router.navigate(['/representative/farmers']))),
      finalize(() => this.submittingDeleteFarmer.set(false)),
    ).subscribe({
      next: () => {
        this.closeDeleteFarmerModal();
        toast.success(`«${detail.farmer.name}» با موفقیت از چاه حذف شد.`);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'خطا در حذف کشاورز از چاه';
        this.deleteFarmerError.set(msg);
        toast.error(msg);
      },
    });
  }
}
