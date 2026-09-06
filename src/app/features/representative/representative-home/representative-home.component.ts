import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import {
  PortalDataService,
  RepresentativeDashboardData,
  RepresentativeFarmerItem,
} from '../../../core/portal-data.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { CardComponent } from '../../../shared/card/card.component';
import { InputComponent } from '../../../shared/input/input.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';
import { faNumber, parseHoursNumber } from '../../../core/mock-data';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/ی/g, 'ي').replace(/ک/g, 'ك');
}

@Component({
  selector: 'app-representative-home',
  imports: [ButtonComponent, InputComponent, CardComponent, PageHeaderComponent],
  template: `
    <app-page-header
      eyebrow="اُدار · خانه نماینده"
      [title]="repName()"
      [subtitle]="dashboard()?.well?.name || 'در انتظار انتساب چاه'"
    />

    <div class="page-content space-y-5">
      @if (loading()) {
        <div class="card p-8 text-center space-y-3">
          <div class="loading-spinner mx-auto" aria-hidden="true"></div>
          <p class="text-sm text-ink-muted">در حال دریافت اطلاعات چاه و کشاورزان…</p>
        </div>
      } @else if (error()) {
        <div class="card p-6 border-red-200 bg-red-50 text-red-700 text-center space-y-3">
          <p class="font-medium">{{ error() }}</p>
          <button app-button variant="secondary" (click)="loadData()">تلاش مجدد</button>
        </div>
      } @else if (!dashboard()?.well) {
        <app-card>
          <div class="py-6 text-center space-y-3">
            <span class="text-4xl" aria-hidden="true">💧</span>
            <h2 class="text-lg font-bold text-ink">به سامانه نمایندگان اُدار خوش آمدید</h2>
            <p class="text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
              حساب کاربری نماینده شما فعال است، اما هنوز هیچ چاهی به شما اختصاص داده نشده است.
              لطفاً با <strong>مدیر سامانه</strong> تماس بگیرید تا چاه مربوطه به حساب شما متصل شود.
            </p>
            <div class="pt-2">
              <button app-button variant="secondary" (click)="loadData()">
                بررسی مجدد انتساب چاه
              </button>
            </div>
          </div>
        </app-card>
      } @else {
        <!-- Water Year Banner -->
        <div class="current-year flex items-center justify-between p-3 bg-mint-50 border border-mint-200 rounded-xl">
          <span class="text-xs text-ink-muted">سال آبی جاری</span>
          <strong class="text-sm font-bold text-forest-900">
            {{ dashboard()?.waterYear?.name || 'تعریف نشده' }}
          </strong>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-3">
          <button
            app-button
            type="button"
            (click)="openRecordUsageModal()"
            [disabled]="!dashboard()?.farmers?.length"
          >
            <span aria-hidden="true">＋</span> ثبت مصرف
          </button>
          <button
            app-button
            variant="secondary"
            type="button"
            (click)="openAddFarmerModal()"
          >
            افزودن کشاورز
          </button>
        </div>

        @if (statusMessage()) {
          <p class="status-message text-center text-sm font-medium py-2 rounded-lg"
             [class.text-forest-800]="!statusIsError()"
             [class.bg-forest-50]="!statusIsError()"
             [class.text-red-700]="statusIsError()"
             [class.bg-red-50]="statusIsError()"
             role="status">
            {{ statusMessage() }}
          </p>
        }

        <!-- Farmers List Section -->
        <section aria-labelledby="farmers-heading" class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 id="farmers-heading" class="section-title mb-0">کشاورزان چاه</h2>
            <span class="text-xs text-ink-muted font-mono">
              {{ number(filteredFarmers().length) }} نفر
            </span>
          </div>

          <app-input inputId="farmer-search" label="جستجوی کشاورز">
            <input
              id="farmer-search"
              type="search"
              placeholder="نام یا شماره کشاورز را جستجو کنید"
              [value]="searchQuery()"
              (input)="searchQuery.set($any($event.target).value)"
              autocomplete="off"
            />
          </app-input>

          <div class="farmer-list space-y-3" aria-live="polite">
            @for (farmer of filteredFarmers(); track farmer.id) {
              <app-card>
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-forest-50 gap-2">
                  <div>
                    <h3 class="font-bold text-forest-900">{{ farmer.name }}</h3>
                    <span dir="ltr" class="text-xs font-mono text-ink-muted">{{ farmer.phone }}</span>
                  </div>
                  <button
                    type="button"
                    class="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer"
                    [class.text-emerald-800]="farmer.allocationId"
                    [class.bg-emerald-50]="farmer.allocationId"
                    [class.border-emerald-200]="farmer.allocationId"
                    [class.hover:bg-emerald-100]="farmer.allocationId"
                    [class.text-amber-800]="!farmer.allocationId"
                    [class.bg-amber-50]="!farmer.allocationId"
                    [class.border-amber-200]="!farmer.allocationId"
                    [class.hover:bg-amber-100]="!farmer.allocationId"
                    (click)="openEditQuotaModal(farmer)"
                  >
                    {{ farmer.allocationId ? 'تغییر سهمیه' : '＋ ثبت سهمیه' }}
                  </button>
                </div>
                <dl class="farmer-quota">
                  <div>
                    <dt>سهمیه کل <small>(ساعت)</small></dt>
                    <dd>{{ number(farmer.quotaHours) }}</dd>
                  </div>
                  <div>
                    <dt>مصرف‌شده <small>(ساعت)</small></dt>
                    <dd>{{ number(farmer.usedHours) }}</dd>
                  </div>
                  <div>
                    <dt>مانده <small>(ساعت)</small></dt>
                    <dd class="remaining font-bold text-primary">{{ number(farmer.remainingHours) }}</dd>
                  </div>
                </dl>
              </app-card>
            } @empty {
              @if (dashboard()?.farmers?.length) {
                <p class="empty-state">کشاورزی با این نام یا شماره پیدا نشد.</p>
              } @else {
                <div class="card p-6 text-center space-y-3">
                  <p class="text-sm text-ink-muted">هنوز هیچ کشاورزی به این چاه اضافه نشده است.</p>
                  <button app-button variant="secondary" (click)="openAddFarmerModal()">
                    افزودن اولین کشاورز
                  </button>
                </div>
              }
            }
          </div>
        </section>
      }

      <div class="pt-4 text-center">
        <button
          app-button
          variant="secondary"
          type="button"
          (click)="logout()"
          class="text-xs"
        >
          خروج از حساب کاربری
        </button>
      </div>
    </div>

    <!-- Modal: Record Usage (ثبت مصرف) -->
    @if (showUsageModal()) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-modal-title"
        tabindex="-1"
        (keydown.escape)="closeUsageModal()"
      >
        <button
          type="button"
          class="modal-overlay"
          aria-label="بستن پنجره"
          (click)="closeUsageModal()"
        ></button>
        <div class="modal-dialog">
          <h3 id="usage-modal-title" class="modal-title">ثبت مصرف آب برای کشاورز</h3>

          <form (submit)="submitUsage(); $event.preventDefault()" class="space-y-4 pt-2">
            <div>
              <label for="usage-farmer" class="block text-xs font-medium text-ink-muted mb-1">انتخاب کشاورز</label>
              <select
                id="usage-farmer"
                class="w-full px-3 py-2 border border-ink-light rounded-xl text-sm bg-white"
                [value]="selectedFarmerForUsage()"
                (change)="selectedFarmerForUsage.set($any($event.target).value)"
              >
                <option value="">-- لطفاً کشاورز را انتخاب کنید --</option>
                @for (f of dashboard()?.farmers; track f.id) {
                  <option [value]="f.id">
                    {{ f.name }} (مانده: {{ number(f.remainingHours) }} ساعت)
                  </option>
                }
              </select>
            </div>

            <app-input label="مدت زمان مصرف (ساعت)" inputId="usage-hours">
              <input
                id="usage-hours"
                type="number"
                step="any"
                min="0.1"
                required
                placeholder="مثلاً ۲٫۵ یا ۳"
                [value]="usageHours()"
                (input)="usageHours.set($any($event.target).value)"
              />
            </app-input>

            <app-input label="توضیحات (اختیاری)" inputId="usage-desc">
              <input
                id="usage-desc"
                type="text"
                placeholder="مثلاً نوبت اول مدار بهاره"
                [value]="usageDesc()"
                (input)="usageDesc.set($any($event.target).value)"
              />
            </app-input>

            @if (modalError()) {
              <p class="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{{ modalError() }}</p>
            }

            <div class="flex gap-2 justify-end pt-2">
              <button app-button variant="secondary" type="button" (click)="closeUsageModal()">
                انصراف
              </button>
              <button app-button type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  در حال ثبت…
                } @else {
                  ثبت مصرف
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: Add Farmer to Well (افزودن کشاورز) -->
    @if (showAddFarmerModal()) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-farmer-title"
        tabindex="-1"
        (keydown.escape)="closeAddFarmerModal()"
      >
        <button
          type="button"
          class="modal-overlay"
          aria-label="بستن پنجره"
          (click)="closeAddFarmerModal()"
        ></button>
        <div class="modal-dialog">
          <h3 id="add-farmer-title" class="modal-title">افزودن کشاورز به چاه</h3>

          <form (submit)="submitAddFarmer(); $event.preventDefault()" class="space-y-4 pt-2">
            @if (loadingAvailable()) {
              <p class="text-sm text-center text-ink-muted py-4">در حال دریافت لیست کشاورزان فعال…</p>
            } @else if (!availableFarmers().length) {
              <div class="text-center py-4 space-y-2">
                <p class="text-sm text-ink-muted">
                  کشاورز ثبت‌نام‌شده‌ای که به این چاه متصل نباشد یافت نشد.
                </p>
                <p class="text-xs text-ink-muted">
                  (کشاورز جدید باید ابتدا با شماره موبایل خود وارد سامانه شود یا توسط مدیر ثبت شود.)
                </p>
              </div>
            } @else {
              <div>
                <label for="add-farmer-select" class="block text-xs font-medium text-ink-muted mb-1">
                  انتخاب کشاورز ثبت‌شده
                </label>
                <select
                  id="add-farmer-select"
                  class="w-full px-3 py-2 border border-ink-light rounded-xl text-sm bg-white"
                  [value]="selectedFarmerToAdd()"
                  (change)="selectedFarmerToAdd.set($any($event.target).value)"
                >
                  <option value="">-- انتخاب کنید --</option>
                  @for (f of availableFarmers(); track f.id) {
                    <option [value]="f.id">
                      {{ f.full_name }} ({{ f.phone }})
                    </option>
                  }
                </select>
              </div>

              <app-input label="سهمیه اولیه سال آبی جاری (ساعت)" inputId="add-quota">
                <input
                  id="add-quota"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="مثلاً ۱۲ یا ۲٫۵"
                  [value]="addFarmerQuota()"
                  (input)="addFarmerQuota.set($any($event.target).value)"
                />
              </app-input>
            }

            @if (modalError()) {
              <p class="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{{ modalError() }}</p>
            }

            <div class="flex gap-2 justify-end pt-2">
              <button app-button variant="secondary" type="button" (click)="closeAddFarmerModal()">
                انصراف
              </button>
              @if (availableFarmers().length) {
                <button app-button type="submit" [disabled]="submitting() || !selectedFarmerToAdd()">
                  @if (submitting()) {
                    در حال افزودن…
                  } @else {
                    افزودن به چاه
                  }
                </button>
              }
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal: Edit / Set Farmer Quota (ثبت یا تغییر سهمیه کشاورز) -->
    @if (editingFarmer(); as currentFarmer) {
      <div
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-quota-title"
        tabindex="-1"
        (keydown.escape)="closeEditQuotaModal()"
      >
        <button
          type="button"
          class="modal-overlay"
          aria-label="بستن پنجره"
          (click)="closeEditQuotaModal()"
        ></button>
        <div class="modal-dialog">
          <h3 id="edit-quota-title" class="modal-title">
            {{ currentFarmer.allocationId ? 'تغییر سهمیه آب' : 'ثبت سهمیه آب' }} - {{ currentFarmer.name }}
          </h3>
          <p class="text-xs text-ink-muted mt-1">
            سال آبی: {{ dashboard()?.waterYear?.name || 'سال آبی جاری' }}
          </p>

          <form (submit)="submitEditQuota(); $event.preventDefault()" class="space-y-4 pt-4">
            <app-input label="سهمیه کل سال آبی (ساعت)" inputId="edit-farmer-quota">
              <input
                id="edit-farmer-quota"
                type="number"
                step="any"
                min="0"
                required
                placeholder="مثلاً ۱۲ یا ۲٫۵"
                [value]="editQuotaValue()"
                (input)="editQuotaValue.set($any($event.target).value)"
              />
            </app-input>

            @if (modalError()) {
              <p class="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{{ modalError() }}</p>
            }

            <div class="flex gap-2 justify-end pt-2">
              <button app-button variant="secondary" type="button" (click)="closeEditQuotaModal()">
                انصراف
              </button>
              <button app-button type="submit" [disabled]="submitting()">
                {{ submitting() ? 'در حال ثبت…' : 'ذخیره سهمیه' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      border: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .modal-dialog {
      position: relative;
      z-index: 10;
      background: white;
      border-radius: 1.25rem;
      width: 100%;
      max-width: 28rem;
      padding: 1.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    }
    .modal-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #064e3b;
      margin: 0;
    }
  `,
})
export class RepresentativeHomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly portalData = inject(PortalDataService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly statusMessage = signal('');
  protected readonly statusIsError = signal(false);
  protected readonly dashboard = signal<RepresentativeDashboardData | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly number = faNumber;

  // Modals
  protected readonly showUsageModal = signal(false);
  protected readonly showAddFarmerModal = signal(false);
  protected readonly editingFarmer = signal<RepresentativeFarmerItem | null>(null);
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

  // Edit Quota form state
  protected readonly editQuotaValue = signal('');

  protected get repName(): () => string {
    return () => this.auth.currentProfile()?.full_name || 'نماینده محترم';
  }

  protected readonly filteredFarmers = computed<RepresentativeFarmerItem[]>(() => {
    const list = this.dashboard()?.farmers || [];
    const q = normalizeName(this.searchQuery());
    if (!q) return list;
    return list.filter(
      (f) => normalizeName(f.name).includes(q) || f.phone.includes(q)
    );
  });

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
      this.error.set(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات چاه');
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
      this.modalError.set('لطفاً کشاورز مورد نظر را انتخاب کنید.');
      return;
    }
    if (hours === null || hours <= 0) {
      this.modalError.set('مدت زمان مصرف باید یک عدد بزرگتر از صفر (ساعت) باشد.');
      return;
    }

    const farmer = this.dashboard()?.farmers.find((f) => f.id === farmerId);
    if (!farmer?.allocationId) {
      this.modalError.set('برای این کشاورز هنوز سهمیه‌ای ثبت نشده است. ابتدا سهمیه او را ثبت کنید.');
      return;
    }

    const repId = this.auth.currentProfile()?.id;
    if (!repId) return;

    this.submitting.set(true);
    this.modalError.set('');

    try {
      await this.portalData.recordWaterUsage({
        allocationId: farmer.allocationId,
        consumedHours: hours,
        description: this.usageDesc(),
        createdBy: repId,
      });

      this.closeUsageModal();
      this.statusIsError.set(false);
      this.statusMessage.set(`مصرف ${faNumber(hours)} ساعت برای «${farmer.name}» با موفقیت ثبت شد.`);
      await this.loadData();
    } catch (err: unknown) {
      this.modalError.set(err instanceof Error ? err.message : 'خطا در ثبت مصرف آب');
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

    try {
      const list = await this.portalData.getAvailableFarmersForWell(wellId);
      this.availableFarmers.set(list);
    } catch (err: unknown) {
      this.modalError.set(err instanceof Error ? err.message : 'خطا در بارگذاری لیست کشاورزان');
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
      this.modalError.set('لطفاً کشاورز را انتخاب کنید.');
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
      this.statusIsError.set(false);
      this.statusMessage.set('کشاورز با موفقیت به چاه افزوده شد.');
      await this.loadData();
    } catch (err: unknown) {
      this.modalError.set(err instanceof Error ? err.message : 'خطا در افزودن کشاورز');
    } finally {
      this.submitting.set(false);
    }
  }

  // --- Edit Quota Modal Logic ---
  protected openEditQuotaModal(farmer: RepresentativeFarmerItem): void {
    this.editingFarmer.set(farmer);
    this.editQuotaValue.set(farmer.quotaHours > 0 ? String(farmer.quotaHours) : '');
    this.modalError.set('');
  }

  protected closeEditQuotaModal(): void {
    this.editingFarmer.set(null);
    this.modalError.set('');
  }

  protected async submitEditQuota(): Promise<void> {
    const farmer = this.editingFarmer();
    const waterYearId = this.dashboard()?.waterYear?.id;

    if (!farmer) return;
    if (!waterYearId) {
      this.modalError.set('سال آبی فعال برای این چاه یافت نشد.');
      return;
    }

    const hours = parseHoursNumber(this.editQuotaValue());
    if (hours === null || hours < 0) {
      this.modalError.set('لطفاً میزان سهمیه را به صورت عدد معتبر (ساعت) وارد کنید.');
      return;
    }

    this.submitting.set(true);
    this.modalError.set('');

    try {
      await this.portalData.upsertFarmerAllocation({
        waterYearId,
        wellFarmerId: farmer.wellFarmerId,
        allocatedHours: hours,
      });

      this.closeEditQuotaModal();
      this.statusIsError.set(false);
      this.statusMessage.set(`سهمیه ${faNumber(hours)} ساعت برای «${farmer.name}» با موفقیت ذخیره شد.`);
      await this.loadData();
    } catch (err: unknown) {
      this.modalError.set(err instanceof Error ? err.message : 'خطا در ذخیره سهمیه');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}
