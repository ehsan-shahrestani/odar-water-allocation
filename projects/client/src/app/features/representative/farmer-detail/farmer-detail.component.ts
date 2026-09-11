import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';
import { AuthService } from '../../../core/auth.service';
import {
  FarmerWellDetail,
  PortalDataService,
  WaterYearItem,
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';

@Component({
  selector: 'app-farmer-detail',
  imports: [ButtonComponent, RouterLink],
  templateUrl: './farmer-detail.component.html',
  styleUrl: './farmer-detail.component.css',
})
export class FarmerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);

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
  protected readonly submitting = signal(false);
  protected readonly modalError = signal('');

  // Usage form
  protected readonly usageHours = signal('');
  protected readonly usageDesc = signal('');

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
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      // Get rep profile
      const profile = this.auth.currentProfile();
      if (!profile?.id) {
        await this.auth.initializeSession();
      }
      const repId = this.auth.currentProfile()?.id;
      if (!repId) {
        throw new Error('اطلاعات کاربری نماینده یافت نشد.');
      }

      // Get farmerId from route
      const fId = this.route.snapshot.paramMap.get('farmerId');
      if (!fId) {
        throw new Error('شناسه کشاورز نامعتبر است.');
      }
      this.farmerId.set(fId);

      // Get the representative's dashboard to find the well
      const dashboard = await this.portalData.getRepresentativeDashboard(repId);
      if (!dashboard.well) {
        throw new Error('چاهی به حساب شما متصل نیست.');
      }
      this.wellId.set(dashboard.well.id);
      this.wellName.set(dashboard.well.name);

      // Fetch water years for this well
      const years = await this.portalData.getWaterYearsForWell(dashboard.well.id);
      this.waterYears.set(years);

      if (years.length > 0) {
        // Select the active (latest) water year by default
        const activeYear = years.find((y) => y.isActive) ?? years[0];
        this.selectedWaterYearId.set(activeYear.id);
        await this.loadFarmerDetail(fId, dashboard.well.id, activeYear.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات';
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  protected async selectWaterYear(yearId: string): Promise<void> {
    if (yearId === this.selectedWaterYearId()) return;
    this.selectedWaterYearId.set(yearId);
    this.loading.set(true);

    try {
      await this.loadFarmerDetail(this.farmerId(), this.wellId(), yearId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات';
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFarmerDetail(farmerId: string, wellId: string, waterYearId: string): Promise<void> {
    const detail = await this.portalData.getFarmerDetailForWell({
      farmerId,
      wellId,
      waterYearId,
    });
    this.farmerDetail.set(detail);
  }

  // --- Usage Modal ---
  protected openUsageModal(): void {
    this.usageHours.set('');
    this.usageDesc.set('');
    this.modalError.set('');
    this.showUsageModal.set(true);
  }

  protected closeUsageModal(): void {
    this.showUsageModal.set(false);
    this.modalError.set('');
  }

  protected async submitUsage(): Promise<void> {
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

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    const newRemaining = Math.max(0, Number((detail.remainingHours - hours).toFixed(2)));

    try {
      const result = await this.portalData.recordWaterUsage({
        allocationId: detail.allocationId,
        consumedHours: hours,
        description: this.usageDesc(),
        createdBy: repId,
        farmerPhone: detail.farmer.phone,
        farmerName: detail.farmer.name,
        remainingHours: newRemaining,
        wellId: this.wellId(),
      });

      this.closeUsageModal();
      if (result.smsSent) {
        toast.success(`مصرف ${faNumber(hours)} ساعت ثبت و پیامک ارسال شد.`);
      } else {
        toast.success(`مصرف ${faNumber(hours)} ساعت ثبت شد.`);
      }
      await this.loadFarmerDetail(this.farmerId(), this.wellId(), this.selectedWaterYearId());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت مصرف';
      this.modalError.set(msg);
      toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
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

  protected async submitQuota(): Promise<void> {
    const detail = this.farmerDetail();
    const waterYearId = this.selectedWaterYearId();

    if (!detail?.wellFarmerId || !waterYearId) {
      const msg = 'اطلاعات لازم یافت نشد.';
      this.modalError.set(msg);
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

    try {
      await this.portalData.upsertFarmerAllocation({
        waterYearId,
        wellFarmerId: detail.wellFarmerId,
        allocatedHours: hours,
      });

      this.closeQuotaModal();
      toast.success(`سهمیه ${faNumber(hours)} ساعت ذخیره شد.`);

      const selectedWy = this.selectedWaterYear();
      this.portalData
        .notifyFarmerQuotaAssigned({
          wellId: this.wellId(),
          waterYearId,
          farmerId: this.farmerId(),
          farmerPhone: detail.farmer.phone,
          farmerName: detail.farmer.name,
          allocatedHours: hours,
          hoursPerShare: selectedWy?.hoursPerShare,
          includeHoursPerShare: this.quotaModalIncludeHoursPerShare(),
        })
        .then((smsRes) => {
          if (smsRes.success) {
            toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
          }
        });

      await this.loadFarmerDetail(this.farmerId(), this.wellId(), waterYearId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ذخیره سهمیه';
      this.modalError.set(msg);
      toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
  }
}
