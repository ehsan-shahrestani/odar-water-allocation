import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  PERSIAN_MONTH_NAMES,
  formatJalali,
  formatJalaliReadable,
  getDaysInJalaliMonth,
  getTodayJalali,
  jalaliToIso,
  parseIsoToJalali,
  parseJalali,
  toPersianDigits,
} from './jalali-utils';

@Component({
  selector: 'app-persian-datepicker',
  template: `
    <div class="datepicker-root" [class.datepicker--disabled]="disabled()">
      @if (label()) {
        <label [attr.for]="pickerId()" class="datepicker-label">
          {{ label() }}
          @if (required()) {
            <span class="text-rose-500 mr-1" aria-hidden="true">*</span>
          }
        </label>
      }

      <!-- Input Trigger Field -->
      <div class="input-wrapper">
        <button
          type="button"
          [id]="pickerId()"
          class="datepicker-trigger"
          [class.has-error]="!!error()"
          [class.is-open]="isOpen()"
          [disabled]="disabled()"
          (click)="openPicker()"
          [attr.aria-haspopup]="'dialog'"
          [attr.aria-expanded]="isOpen()"
          [attr.aria-label]="label() || placeholder()"
        >
          <div class="trigger-content">
            <svg
              class="calendar-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            <span class="value-text" [class.placeholder]="!displayValue()">
              {{ displayValue() || placeholder() }}
            </span>
          </div>

          @if (value() && !disabled()) {
            <span
              role="button"
              tabindex="0"
              class="clear-btn"
              (click)="clearValue($event)"
              (keydown.enter)="clearValue($event)"
              aria-label="پاک کردن تاریخ"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-4 h-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          }
        </button>
      </div>

      @if (hint() && !error()) {
        <p class="datepicker-hint">{{ hint() }}</p>
      }

      @if (error()) {
        <p class="datepicker-error" role="alert">{{ error() }}</p>
      }

      <!-- Wheel Modal / Bottom Sheet -->
      @if (isOpen()) {
        <div class="wheel-portal" role="presentation">
          <button
            type="button"
            class="wheel-backdrop"
            tabindex="-1"
            (click)="closePicker()"
            aria-label="بستن انتخاب‌گر تاریخ"
          ></button>

          <div
            class="wheel-modal"
            role="dialog"
            aria-modal="true"
            aria-label="انتخاب چرخشی تاریخ"
            (keydown.escape)="closePicker()"
          >
            <!-- Mobile Grab Handle -->
            <div class="sheet-handle" aria-hidden="true"></div>

            <!-- Header -->
            <div class="wheel-header">
              <div class="header-info">
                <span class="header-kicker">انتخاب تاریخ</span>
                <strong class="header-date">{{ formattedComposed() }}</strong>
              </div>
              <button
                type="button"
                class="today-pill"
                (click)="goToToday()"
                aria-label="انتخاب تاریخ امروز"
              >
                امروز
              </button>
            </div>

            <!-- Three-Column Wheel Picker -->
            <div class="wheel-viewport" role="group" aria-label="ستون‌های انتخاب تاریخ">
              <!-- Day Column (روز) -->
              <div class="wheel-column-wrap">
                <span class="column-caption">روز</span>
                <div
                  #dayCol
                  class="wheel-col"
                  (scroll)="onColumnScroll('day', dayCol)"
                >
                  <span class="wheel-spacer" aria-hidden="true"></span>
                  @for (d of dayList(); track d) {
                    <button
                      type="button"
                      class="wheel-item"
                      [class.wheel-item--active]="d === activeDay()"
                      [attr.data-value]="d"
                      (click)="onDayItemClick(d)"
                    >
                      {{ toPersian(d) }}
                    </button>
                  }
                  <span class="wheel-spacer" aria-hidden="true"></span>
                </div>
              </div>

              <!-- Month Column (ماه) -->
              <div class="wheel-column-wrap">
                <span class="column-caption">ماه</span>
                <div
                  #monthCol
                  class="wheel-col"
                  (scroll)="onColumnScroll('month', monthCol)"
                >
                  <span class="wheel-spacer" aria-hidden="true"></span>
                  @for (m of monthList; track m; let i = $index) {
                    <button
                      type="button"
                      class="wheel-item"
                      [class.wheel-item--active]="i + 1 === activeMonth()"
                      [attr.data-value]="i + 1"
                      (click)="onMonthItemClick(i + 1)"
                    >
                      {{ m }}
                    </button>
                  }
                  <span class="wheel-spacer" aria-hidden="true"></span>
                </div>
              </div>

              <!-- Year Column (سال) -->
              <div class="wheel-column-wrap">
                <span class="column-caption">سال</span>
                <div
                  #yearCol
                  class="wheel-col"
                  (scroll)="onColumnScroll('year', yearCol)"
                >
                  <span class="wheel-spacer" aria-hidden="true"></span>
                  @for (y of yearList(); track y) {
                    <button
                      type="button"
                      class="wheel-item"
                      [class.wheel-item--active]="y === activeYear()"
                      [attr.data-value]="y"
                      (click)="onYearItemClick(y)"
                    >
                      {{ toPersian(y) }}
                    </button>
                  }
                  <span class="wheel-spacer" aria-hidden="true"></span>
                </div>
              </div>

              <!-- Center Highlight Overlay Bar -->
              <div class="wheel-focus" aria-hidden="true"></div>
            </div>

            <!-- Footer Actions -->
            <div class="wheel-footer">
              <button
                type="button"
                class="wheel-btn wheel-btn--cancel"
                (click)="closePicker()"
              >
                انصراف
              </button>
              <button
                type="button"
                class="wheel-btn wheel-btn--confirm"
                (click)="confirmSelection()"
              >
                تایید تاریخ
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      font-family: Vazirmatn, sans-serif;
    }

    .datepicker-root {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      position: relative;
      width: 100%;
      direction: rtl;
    }

    .datepicker-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #173b2b;
    }

    .input-wrapper {
      position: relative;
      width: 100%;
    }

    .datepicker-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 42px;
      padding: 0.5rem 0.875rem;
      background-color: #ffffff;
      border: 1px solid #d7e5dc;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      color: #173b2b;
      cursor: pointer;
      outline: none;
      transition: all 160ms ease-in-out;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    }

    .datepicker-trigger:hover:not(:disabled) {
      border-color: #08633f;
      background-color: #fafdfb;
    }

    .datepicker-trigger:focus-visible,
    .datepicker-trigger.is-open {
      border-color: #08633f;
      box-shadow: 0 0 0 3px rgba(8, 99, 63, 0.15);
    }

    .datepicker-trigger.has-error {
      border-color: #dc2626;
    }

    .datepicker-trigger:disabled {
      background-color: #f1f5f3;
      border-color: #e2e8e5;
      color: #8c9b93;
      cursor: not-allowed;
    }

    .trigger-content {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow: hidden;
    }

    .calendar-icon {
      width: 1.125rem;
      height: 1.125rem;
      color: #08633f;
      flex-shrink: 0;
    }

    .value-text {
      font-weight: 500;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .value-text.placeholder {
      color: #8c9b93;
      font-weight: 400;
    }

    .clear-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
      border-radius: 0.375rem;
      color: #8c9b93;
      transition: color 150ms ease, background-color 150ms ease;
    }

    .clear-btn:hover {
      color: #dc2626;
      background-color: #fee2e2;
    }

    .datepicker-hint {
      font-size: 0.75rem;
      color: #567064;
    }

    .datepicker-error {
      font-size: 0.75rem;
      color: #dc2626;
      font-weight: 500;
    }

    /* Modal / Bottom Sheet Portal */
    .wheel-portal {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    @media (min-width: 640px) {
      .wheel-portal {
        align-items: center;
        padding: 1.5rem;
      }
    }

    .wheel-backdrop {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
      padding: 0;
      margin: 0;
      background-color: rgba(6, 55, 34, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: fadeIn 200ms ease-out;
      cursor: default;
    }

    .wheel-modal {
      position: relative;
      width: 100%;
      max-width: 380px;
      background-color: #ffffff;
      border-radius: 1.5rem 1.5rem 0 0;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      direction: rtl;
      display: flex;
      flex-direction: column;
      animation: slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @media (min-width: 640px) {
      .wheel-modal {
        border-radius: 1.5rem;
        animation: scaleUp 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
    }

    .sheet-handle {
      width: 36px;
      height: 4px;
      background-color: #d7e5dc;
      border-radius: 9999px;
      margin: 10px auto 0;
    }

    @media (min-width: 640px) {
      .sheet-handle {
        display: none;
      }
    }

    .wheel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1.25rem 0.875rem;
      border-bottom: 1px solid #edf2ef;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .header-kicker {
      font-size: 0.6875rem;
      font-weight: 700;
      color: #567064;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .header-date {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #063722;
    }

    .today-pill {
      padding: 0.3125rem 0.75rem;
      background-color: #e5f5eb;
      color: #08633f;
      border: none;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 150ms ease;
    }

    .today-pill:hover {
      background-color: #d1ecdc;
    }

    /* Wheel Viewport */
    .wheel-viewport {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1.3fr 1fr;
      gap: 0.5rem;
      padding: 0.75rem 1rem 1rem;
      background: linear-gradient(180deg, #fbfdfc 0%, #f4f8f6 100%);
      user-select: none;
    }

    .wheel-column-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .column-caption {
      font-size: 0.6875rem;
      font-weight: 600;
      color: #748b80;
    }

    .wheel-col {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 216px;
      overflow-y: auto;
      scrollbar-width: none;
      scroll-snap-type: y mandatory;
      -webkit-overflow-scrolling: touch;
      mask-image: linear-gradient(to bottom, transparent 0%, #000 24%, #000 76%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 24%, #000 76%, transparent 100%);
    }

    .wheel-col::-webkit-scrollbar {
      display: none;
    }

    .wheel-spacer {
      flex: 0 0 90px;
      height: 90px;
    }

    .wheel-item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 36px;
      flex: 0 0 36px;
      margin: 0;
      padding: 0 0.25rem;
      border: none;
      border-radius: 0.625rem;
      background: transparent;
      color: #567064;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      scroll-snap-align: center;
      transition: color 140ms ease, background-color 140ms ease, transform 140ms ease, font-weight 140ms ease;
    }

    .wheel-item:hover {
      color: #08633f;
      background-color: rgba(8, 99, 63, 0.06);
    }

    .wheel-item--active {
      background: #08633f !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      box-shadow: 0 4px 12px rgba(8, 99, 63, 0.28);
      transform: scale(1.06);
      z-index: 2;
    }

    .wheel-focus {
      position: absolute;
      z-index: 1;
      top: 111px; /* 90px spacer + caption offset + padding */
      right: 0.75rem;
      left: 0.75rem;
      height: 36px;
      border-top: 1.5px solid rgba(8, 99, 63, 0.22);
      border-bottom: 1.5px solid rgba(8, 99, 63, 0.22);
      border-radius: 0.75rem;
      background: rgba(8, 99, 63, 0.05);
      pointer-events: none;
    }

    .wheel-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.625rem;
      padding: 0.875rem 1.25rem 1rem;
      border-top: 1px solid #edf2ef;
      background-color: #ffffff;
    }

    .wheel-btn {
      padding: 0.5625rem 1.125rem;
      border-radius: 0.625rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .wheel-btn--cancel {
      border: 1px solid #d7e5dc;
      background-color: #ffffff;
      color: #567064;
    }

    .wheel-btn--cancel:hover {
      background-color: #f4f8f6;
      color: #173b2b;
    }

    .wheel-btn--confirm {
      border: none;
      background-color: #08633f;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(8, 99, 63, 0.25);
    }

    .wheel-btn--confirm:hover {
      background-color: #064e31;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes scaleUp {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `,
})
export class PersianDatepickerComponent {
  readonly value = model<string>('');
  readonly isoValue = model<string>('');
  readonly label = input<string>('');
  readonly placeholder = input<string>('انتخاب تاریخ');
  readonly format = input<string>('YYYY/MM/DD');
  readonly disabled = input<boolean>(false);
  readonly required = input<boolean>(false);
  readonly hint = input<string>('');
  readonly error = input<string>('');
  readonly pickerId = input<string>(`pdp-${Math.random().toString(36).substring(2, 9)}`);

  readonly dateSelected = output<string>();

  protected readonly isOpen = signal(false);
  protected readonly activeYear = signal(1404);
  protected readonly activeMonth = signal(1);
  protected readonly activeDay = signal(1);

  protected readonly monthList = PERSIAN_MONTH_NAMES;

  protected readonly yearList = signal<number[]>(
    Array.from({ length: 41 }, (_, i) => 1380 + i)
  );

  protected readonly dayList = computed(() => {
    const y = this.activeYear();
    const m = this.activeMonth();
    const count = getDaysInJalaliMonth(y, m);
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  protected readonly formattedComposed = computed(() => {
    return formatJalaliReadable(this.activeYear(), this.activeMonth(), this.activeDay());
  });

  protected readonly displayValue = computed(() => {
    const val = this.value();
    if (!val) return '';
    const parsed = parseJalali(val);
    if (parsed) {
      return `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    }
    return toPersianDigits(val);
  });

  private readonly dayCol = viewChild<ElementRef<HTMLElement>>('dayCol');
  private readonly monthCol = viewChild<ElementRef<HTMLElement>>('monthCol');
  private readonly yearCol = viewChild<ElementRef<HTMLElement>>('yearCol');

  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private isProgrammaticScrolling = false;

  constructor() {
    effect(() => {
      // Sync incoming external value changes
      const val = this.value();
      const iso = this.isoValue();

      if (val) {
        const parsed = parseJalali(val);
        if (parsed) {
          const isoExpected = jalaliToIso(parsed.year, parsed.month, parsed.day);
          if (this.isoValue() !== isoExpected) {
            this.isoValue.set(isoExpected);
          }
        }
      } else if (iso) {
        const parsedIso = parseIsoToJalali(iso);
        if (parsedIso) {
          const jalaliFormatted = formatJalali(parsedIso.year, parsedIso.month, parsedIso.day);
          if (this.value() !== jalaliFormatted) {
            this.value.set(jalaliFormatted);
          }
        }
      }
    });

    // When dayList changes, clamp activeDay if needed
    effect(() => {
      const days = this.dayList();
      const current = this.activeDay();
      if (current > days.length) {
        this.activeDay.set(days.length);
      }
    });
  }

  protected toPersian(n: number | string): string {
    return toPersianDigits(n);
  }

  protected openPicker(): void {
    if (this.disabled()) return;

    // Initialize picker position from current value or today
    let initialDate = parseJalali(this.value());
    if (!initialDate && this.isoValue()) {
      initialDate = parseIsoToJalali(this.isoValue());
    }
    if (!initialDate) {
      initialDate = getTodayJalali();
    }

    this.activeYear.set(initialDate.year);
    this.activeMonth.set(initialDate.month);
    const maxDays = getDaysInJalaliMonth(initialDate.year, initialDate.month);
    this.activeDay.set(Math.min(initialDate.day, maxDays));

    // Ensure year is present in yearList
    const years = this.yearList();
    if (!years.includes(initialDate.year)) {
      const start = Math.min(initialDate.year - 20, 1380);
      const end = Math.max(initialDate.year + 20, 1430);
      this.yearList.set(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    }

    this.isOpen.set(true);

    // Center columns on next animation frame
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.centerAllColumns(false);
      }, 30);
    });
  }

  protected closePicker(): void {
    this.isOpen.set(false);
  }

  protected clearValue(event: Event): void {
    event.stopPropagation();
    this.value.set('');
    this.isoValue.set('');
    this.dateSelected.emit('');
  }

  protected goToToday(): void {
    const today = getTodayJalali();
    this.activeYear.set(today.year);
    this.activeMonth.set(today.month);
    this.activeDay.set(today.day);
    this.centerAllColumns(true);
  }

  protected confirmSelection(): void {
    const y = this.activeYear();
    const m = this.activeMonth();
    const d = this.activeDay();

    const formatted = formatJalali(y, m, d);
    const iso = jalaliToIso(y, m, d);

    this.value.set(formatted);
    this.isoValue.set(iso);
    this.dateSelected.emit(formatted);

    this.closePicker();
  }

  protected onDayItemClick(day: number): void {
    this.activeDay.set(day);
    this.centerColumn(this.dayCol()?.nativeElement, day - 1, true);
  }

  protected onMonthItemClick(month: number): void {
    this.activeMonth.set(month);
    const maxDays = getDaysInJalaliMonth(this.activeYear(), month);
    if (this.activeDay() > maxDays) {
      this.activeDay.set(maxDays);
    }
    this.centerColumn(this.monthCol()?.nativeElement, month - 1, true);
  }

  protected onYearItemClick(year: number): void {
    this.activeYear.set(year);
    const maxDays = getDaysInJalaliMonth(year, this.activeMonth());
    if (this.activeDay() > maxDays) {
      this.activeDay.set(maxDays);
    }
    const idx = this.yearList().indexOf(year);
    if (idx >= 0) {
      this.centerColumn(this.yearCol()?.nativeElement, idx, true);
    }
  }

  protected onColumnScroll(type: 'day' | 'month' | 'year', col: HTMLElement): void {
    if (this.isProgrammaticScrolling) return;

    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }

    this.scrollTimer = setTimeout(() => {
      if (!col.isConnected) return;
      const index = Math.round(col.scrollTop / 36);

      if (type === 'day') {
        const days = this.dayList();
        const clampedIndex = Math.max(0, Math.min(index, days.length - 1));
        const selected = days[clampedIndex];
        if (selected !== undefined && selected !== this.activeDay()) {
          this.activeDay.set(selected);
        }
      } else if (type === 'month') {
        const clampedMonth = Math.max(1, Math.min(index + 1, 12));
        if (clampedMonth !== this.activeMonth()) {
          this.activeMonth.set(clampedMonth);
        }
      } else if (type === 'year') {
        const years = this.yearList();
        const clampedIndex = Math.max(0, Math.min(index, years.length - 1));
        const selected = years[clampedIndex];
        if (selected !== undefined && selected !== this.activeYear()) {
          this.activeYear.set(selected);
        }
      }
    }, 100);
  }

  private centerAllColumns(smooth: boolean): void {
    const dayEl = this.dayCol()?.nativeElement;
    const monthEl = this.monthCol()?.nativeElement;
    const yearEl = this.yearCol()?.nativeElement;

    if (dayEl) {
      this.centerColumn(dayEl, this.activeDay() - 1, smooth);
    }
    if (monthEl) {
      this.centerColumn(monthEl, this.activeMonth() - 1, smooth);
    }
    if (yearEl) {
      const yIdx = this.yearList().indexOf(this.activeYear());
      if (yIdx >= 0) {
        this.centerColumn(yearEl, yIdx, smooth);
      }
    }
  }

  private centerColumn(col: HTMLElement | undefined, itemIndex: number, smooth: boolean): void {
    if (!col) return;
    const targetTop = itemIndex * 36;
    this.isProgrammaticScrolling = true;

    col.scrollTo({
      top: targetTop,
      behavior: smooth ? 'smooth' : 'auto',
    });

    setTimeout(() => {
      this.isProgrammaticScrolling = false;
    }, smooth ? 250 : 50);
  }
}
