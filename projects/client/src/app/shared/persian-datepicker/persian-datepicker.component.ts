import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  afterNextRender,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-persian-datepicker',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="datepicker-container">
      @if (label()) {
        <label [attr.for]="pickerId()" class="datepicker-label">
          {{ label() }}
          @if (required()) {
            <span class="text-rose-500 mr-1" aria-hidden="true">*</span>
          }
        </label>
      }

      <div class="picker-wrapper">
        <persian-datepicker-element
          #pickerRef
          [id]="pickerId()"
          [attr.value]="value() || null"
          [attr.placeholder]="placeholder()"
          [attr.format]="format()"
          [attr.disabled]="disabled() ? '' : null"
          show-holidays
          rtl
          class="block w-full"
        ></persian-datepicker-element>
      </div>

      @if (hint() && !error()) {
        <p class="datepicker-hint">{{ hint() }}</p>
      }

      @if (error()) {
        <p class="datepicker-error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      --jdp-primary: #08633f;
      --jdp-primary-hover: #07482d;
      --jdp-primary-foreground: #ffffff;
      --jdp-border-radius: 0.75rem;
      --jdp-font-family: Vazirmatn, sans-serif;
      --jdp-font-size: 14px;
      --jdp-day-cell-size: 36px;
      --jdp-border: #d7e5dc;
      --jdp-ring: #08633f;
    }

    .datepicker-container {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .datepicker-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #173b2b;
    }

    .picker-wrapper {
      position: relative;
      width: 100%;
    }

    persian-datepicker-element {
      display: block;
      width: 100%;
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

  private readonly pickerRef = viewChild<ElementRef<HTMLElement>>('pickerRef');
  private dateLib: {
    PersianDate: {
      gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number];
      jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number];
    };
    DateFormatter: {
      formatDate(date: [number, number, number], format?: string): string;
    };
  } | null = null;

  constructor() {
    afterNextRender(() => {
      import('persian-datepicker-element/dist/persian-datepicker-element.min.esm.js').then((lib) => {
        this.dateLib = lib;
        const el = this.pickerRef()?.nativeElement as (HTMLElement & {
          setValue?(y: number, m: number, d: number): void;
        }) | undefined;

        if (el) {
          el.addEventListener('change', this.handleDateChange);
          this.syncElementValue(el);
        }
      });
    });

    effect(() => {
      const el = this.pickerRef()?.nativeElement as (HTMLElement & {
        setValue?(y: number, m: number, d: number): void;
      }) | undefined;
      this.value();
      this.isoValue();

      if (el && this.dateLib) {
        this.syncElementValue(el);
      }
    });
  }

  private syncElementValue(el: HTMLElement & { setValue?(y: number, m: number, d: number): void }): void {
    if (!this.dateLib) return;

    const iso = this.isoValue();
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const parts = iso.split('T')[0].split('-').map(Number);
      const gy = parts[0];
      const gm = parts[1];
      const gd = parts[2];
      if (gy && gm && gd) {
        const [jy, jm, jd] = this.dateLib.PersianDate.gregorianToJalali(gy, gm, gd);
        el.setValue?.(jy, jm, jd);
        const formatted = this.dateLib.DateFormatter.formatDate([jy, jm, jd], this.format());
        if (this.value() !== formatted) {
          this.value.set(formatted);
        }
        return;
      }
    }

    const val = this.value();
    if (val) {
      const clean = val.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      const parts = clean.match(/\d+/g);
      if (parts && parts.length >= 3) {
        const jy = Number(parts[0]);
        const jm = Number(parts[1]);
        const jd = Number(parts[2]);
        if (jy >= 1200 && jy <= 1500) {
          el.setValue?.(jy, jm, jd);
          const [gy, gm, gd] = this.dateLib.PersianDate.jalaliToGregorian(jy, jm, jd);
          const isoDate = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
          if (this.isoValue() !== isoDate) {
            this.isoValue.set(isoDate);
          }
        }
      }
    }
  }

  private readonly handleDateChange = (event: Event): void => {
    const detail = (event as CustomEvent<{
      jalali?: [number, number, number];
      gregorian?: [number, number, number];
      formattedDate?: string;
      isoString?: string;
    }>).detail;

    if (!detail) return;

    const newDate = detail.formattedDate || '';
    this.value.set(newDate);

    let isoDate = '';
    if (detail.gregorian && detail.gregorian.length === 3) {
      const [gy, gm, gd] = detail.gregorian;
      isoDate = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    } else if (detail.isoString) {
      isoDate = detail.isoString.split('T')[0];
    }

    this.isoValue.set(isoDate);
    this.dateSelected.emit(newDate);
  };
}
