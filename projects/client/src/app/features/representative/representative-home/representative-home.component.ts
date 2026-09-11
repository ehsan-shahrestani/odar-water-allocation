import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';
import { AuthService } from '../../../core/auth.service';
import {
  PortalDataService,
  RepresentativeDashboardData,
  RepresentativeFarmerItem,
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { CardComponent } from '../../../shared/card/card.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';
import { PersianDatepickerComponent } from '../../../shared/persian-datepicker/persian-datepicker.component';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/ی/g, 'ي').replace(/ک/g, 'ك');
}

@Component({
  selector: 'app-representative-home',
  imports: [ButtonComponent, CardComponent, RouterLink, PersianDatepickerComponent],
  templateUrl: './representative-home.component.html',
  styleUrl: './representative-home.component.css',
})
export class RepresentativeHomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);

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
  protected readonly submitting = signal(false);
  protected readonly modalError = signal('');

  // Usage form state
  protected readonly selectedFarmerForUsage = signal('');
  protected readonly usageHours = signal('');
  protected readonly usageDesc = signal('');

  // Add Farmer form state
  protected readonly loadingAvailable = signal(false);
  protected readonly availableFarmers = signal<Array<{ id: string; full_name: string; phone: string }>>([]);
  protected readonly selectedFarmerToAdd = signal('');
  protected readonly addFarmerQuota = signal('');
  protected readonly addFarmerIncludeHoursPerShare = signal(true);

  // Add Water Year form state
  protected readonly showAddWaterYearModal = signal(false);
  protected readonly wyDesc = signal('');
  protected readonly wyHoursPerShare = signal('');
  protected readonly wyStartDate = signal('1404/07/01');
  protected readonly wyEndDate = signal('1405/06/31');
  protected readonly wyStartIso = signal('2025-09-23');
  protected readonly wyEndIso = signal('2026-09-22');
  protected readonly submittingWY = signal(false);
  protected readonly wyModalError = signal('');

  protected readonly repName = computed(() => this.auth.currentProfile()?.full_name || 'نماینده محترم');

  protected readonly filteredFarmers = computed<RepresentativeFarmerItem[]>(() => {
    const list = this.dashboard()?.farmers || [];
    const q = normalizeName(this.searchQuery());
    if (!q) return list;
    return list.filter(
      (f) => normalizeName(f.name).includes(q) || f.phone.includes(q),
    );
  });

  protected readonly totalStats = computed(() => {
    const farmers = this.dashboard()?.farmers || [];
    const totalQuota = farmers.reduce((s, f) => s + f.quotaHours, 0);
    const totalUsed = farmers.reduce((s, f) => s + f.usedHours, 0);
    const totalRemaining = farmers.reduce((s, f) => s + f.remainingHours, 0);
    return { count: farmers.length, totalQuota, totalUsed, totalRemaining };
  });

  protected readonly totalUsagePercent = computed(() => {
    const stats = this.totalStats();
    if (stats.totalQuota <= 0) return 0;
    return Math.min(100, Math.round((stats.totalUsed / stats.totalQuota) * 100));
  });

  protected readonly totalUsageLevel = computed(() => {
    const pct = this.totalUsagePercent();
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'normal';
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
    void this.loadData();
  }

  protected async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const profile = this.auth.currentProfile();
      if (!profile?.id) {
        await this.auth.initializeSession();
      }

      const currentId = this.auth.currentProfile()?.id;
      if (!currentId) {
        throw new Error('اطلاعات کاربری نماینده یافت نشد. لطفاً مجدداً وارد شوید.');
      }

      const data = await this.portalData.getRepresentativeDashboard(currentId);
      this.dashboard.set(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در دریافت اطلاعات چاه';
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  // --- Usage Modal Logic ---
  protected openRecordUsageModal(): void {
    this.selectedFarmerForUsage.set('');
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
    if (!farmer?.allocationId) {
      const msg = 'برای این کشاورز هنوز سهمیه‌ای ثبت نشده است. ابتدا سهمیه او را ثبت کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    const newRemaining = Math.max(0, Number((farmer.remainingHours - hours).toFixed(2)));

    try {
      const result = await this.portalData.recordWaterUsage({
        allocationId: farmer.allocationId,
        consumedHours: hours,
        description: this.usageDesc(),
        createdBy: repId,
        farmerPhone: farmer.phone,
        farmerName: farmer.name,
        remainingHours: newRemaining,
        wellId: this.dashboard()?.well?.id,
      });

      this.closeUsageModal();
      if (result.smsSent) {
        toast.success(
          `مصرف ${faNumber(hours)} ساعت برای «${farmer.name}» ثبت شد و پیامک ارسال گردید.`
        );
      } else {
        toast.success(
          `مصرف ${faNumber(hours)} ساعت برای «${farmer.name}» ثبت شد (مانده: ${faNumber(newRemaining)} ساعت).`
        );
        if (result.message) {
          toast.warning(`وضعیت پیامک: ${result.message}`);
        }
      }
      await this.loadData();
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'خطا در ثبت مصرف آب';
      const isForbidden =
        rawMsg.includes('policy') ||
        rawMsg.includes('permission') ||
        rawMsg.includes('42501') ||
        rawMsg.includes('security');
      const msg = isForbidden
        ? 'دسترسی شما به این چاه توسط مدیر لغو گردیده است.'
        : rawMsg;
      this.modalError.set(msg);
      toast.error(msg);
      if (isForbidden) {
        this.closeUsageModal();
        await this.loadData();
      }
    } finally {
      this.submitting.set(false);
    }
  }

  // --- Add Farmer Modal Logic ---
  protected async openAddFarmerModal(): Promise<void> {
    const wellId = this.dashboard()?.well?.id;
    if (!wellId) return;

    this.showAddFarmerModal.set(true);
    this.loadingAvailable.set(true);
    this.modalError.set('');
    this.selectedFarmerToAdd.set('');
    this.addFarmerQuota.set('');
    this.addFarmerIncludeHoursPerShare.set(true);

    try {
      const list = await this.portalData.getAvailableFarmersForWell(wellId);
      this.availableFarmers.set(list);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'خطا در بارگذاری لیست کشاورزان';
      const isForbidden =
        rawMsg.includes('policy') ||
        rawMsg.includes('permission') ||
        rawMsg.includes('42501') ||
        rawMsg.includes('security');
      const msg = isForbidden
        ? 'دسترسی شما به این چاه توسط مدیر لغو گردیده است.'
        : rawMsg;
      this.modalError.set(msg);
      toast.error(msg);
      if (isForbidden) {
        this.closeAddFarmerModal();
        await this.loadData();
      }
    } finally {
      this.loadingAvailable.set(false);
    }
  }

  protected closeAddFarmerModal(): void {
    this.showAddFarmerModal.set(false);
    this.modalError.set('');
  }

  protected async submitAddFarmer(): Promise<void> {
    const wellId = this.dashboard()?.well?.id;
    const farmerId = this.selectedFarmerToAdd();
    const quota = parseHoursNumber(this.addFarmerQuota()) ?? undefined;
    const waterYearId = this.dashboard()?.waterYear?.id;

    if (!wellId || !farmerId) {
      const msg = 'لطفاً کشاورز را انتخاب کنید.';
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    this.submitting.set(true);
    this.modalError.set('');

    try {
      await this.portalData.addFarmerToWell({
        wellId,
        farmerId,
        allocatedHours: quota,
        waterYearId,
      });

      this.closeAddFarmerModal();
      toast.success('کشاورز با موفقیت به چاه افزوده شد.');

      if (quota !== undefined && quota > 0 && waterYearId) {
        const farmerItem = this.availableFarmers().find((f) => f.id === farmerId);
        const activeWy = this.dashboard()?.waterYear;
        this.portalData
          .notifyFarmerQuotaAssigned({
            wellId,
            wellName: this.dashboard()?.well?.name,
            waterYearId,
            farmerId,
            farmerPhone: farmerItem?.phone,
            farmerName: farmerItem?.full_name,
            allocatedHours: quota,
            hoursPerShare: activeWy?.hoursPerShare,
            includeHoursPerShare: this.addFarmerIncludeHoursPerShare(),
          })
          .then((smsRes) => {
            if (smsRes.success) {
              toast.success('پیامک سهمیه سال آبی برای کشاورز ارسال شد.');
            }
          });
      }

      await this.loadData();
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'خطا در افزودن کشاورز';
      const isForbidden =
        rawMsg.includes('policy') ||
        rawMsg.includes('permission') ||
        rawMsg.includes('42501') ||
        rawMsg.includes('security');
      const msg = isForbidden
        ? 'دسترسی شما به این چاه توسط مدیر لغو گردیده است.'
        : rawMsg;
      this.modalError.set(msg);
      toast.error(msg);
      if (isForbidden) {
        this.closeAddFarmerModal();
        await this.loadData();
      }
    } finally {
      this.submitting.set(false);
    }
  }

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

  protected async submitAddWaterYear(): Promise<void> {
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

    try {
      await this.portalData.createWaterYear({
        wellId,
        description: desc,
        startDate: startIso,
        endDate: endIso,
        hoursPerShare,
      });

      this.closeAddWaterYearModal();
      toast.success(`دوره جدید سال آبی «${desc}» با موفقیت ثبت شد.`);
      await this.loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ثبت سال آبی';
      this.wyModalError.set(msg);
      toast.error(msg);
    } finally {
      this.submittingWY.set(false);
    }
  }

  protected async logout(): Promise<void> {
    toast.info('در حال خروج از حساب...');
    await this.auth.logout();
  }
}

