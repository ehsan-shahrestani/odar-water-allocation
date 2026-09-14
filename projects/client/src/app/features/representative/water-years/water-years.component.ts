import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { PortalDataService, WaterYearItem } from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { PersianDatepickerComponent } from '../../../shared/persian-datepicker/persian-datepicker.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-water-years',
  imports: [ButtonComponent, PersianDatepickerComponent],
  templateUrl: './water-years.component.html',
  styleUrl: './water-years.component.css',
})
export class WaterYearsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly wellId = signal('');
  protected readonly wellName = signal('');
  protected readonly waterYears = signal<WaterYearItem[]>([]);

  // Add Water Year Modal State
  protected readonly showModal = signal(false);
  protected readonly submitting = signal(false);
  protected readonly modalError = signal('');
  protected readonly wyDesc = signal('');
  protected readonly wyHoursPerShare = signal('');
  protected readonly wyStartDate = signal('1404/07/01');
  protected readonly wyEndDate = signal('1405/06/31');
  protected readonly wyStartIso = signal('2025-09-23');
  protected readonly wyEndIso = signal('2026-09-22');

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
        throw new Error('اطلاعات کاربری نماینده یافت نشد.');
      }

      const dashboard = await this.portalData.getRepresentativeDashboard(currentId);
      if (dashboard.well?.id) {
        this.wellId.set(dashboard.well.id);
        this.wellName.set(dashboard.well.name);
        const list = await this.portalData.getWaterYearsForWell(dashboard.well.id);
        this.waterYears.set(list);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در دریافت سال‌های آبی';
      this.error.set(msg);
      toast.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  protected openModal(): void {
    this.wyDesc.set('');
    this.wyHoursPerShare.set('');
    this.wyStartDate.set('1404/07/01');
    this.wyEndDate.set('1405/06/31');
    this.wyStartIso.set('2025-09-23');
    this.wyEndIso.set('2026-09-22');
    this.modalError.set('');
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  protected async submitAddWaterYear(): Promise<void> {
    const wellId = this.wellId();
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
      this.modalError.set(msg);
      toast.error(msg);
      return;
    }

    this.submitting.set(true);
    this.modalError.set('');

    try {
      await this.portalData.createWaterYear({
        wellId,
        description: desc,
        startDate: startIso,
        endDate: endIso,
        hoursPerShare,
      });

      this.closeModal();
      toast.success(`دوره سال آبی «${desc}» با موفقیت تعریف شد.`);
      await this.loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در تعریف سال آبی';
      this.modalError.set(msg);
      toast.error(msg);
    } finally {
      this.submitting.set(false);
    }
  }
}
