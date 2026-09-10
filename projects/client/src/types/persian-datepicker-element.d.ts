declare module 'persian-datepicker-element' {
  export interface PersianDateType {
    g_days_in_month: number[];
    j_days_in_month: number[];
    jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number];
    gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number];
    isLeapJalaliYear(jy: number): boolean;
    getDaysInMonth(jy: number, jm: number): number;
    getMonthName(jm: number): string;
    getDayOfWeek(jy: number, jm: number, jd: number): number;
    getDaysInYear(jy: number): number;
    isValidDate(jy: number, jm: number, jd: number): boolean;
  }

  export interface DateFormatterType {
    formatDate(date: [number, number, number], format?: string): string;
    formatDateRange(start: [number, number, number], end: [number, number, number], format?: string): string;
    toPersianNum(val: number | string): string;
    fromPersianNum(val: string): number;
    persianMonths: string[];
    weekdays: string[];
  }

  export interface DateUtilsType {
    toPersianNum(val: number | string): string;
    fromPersianNum(val: string): number;
    compareDates(d1: [number, number, number], d2: [number, number, number]): number;
    jalaliToISOString(date: [number, number, number], persianDate: PersianDateType): string;
  }

  export interface PersianDatePickerElement extends HTMLElement {
    setValue(year: number, month: number, day: number): void;
    getValue(): [number, number, number] | null;
    open(): void;
    close(): void;
    clear(): void;
    setMinDate(year: number, month: number, day: number): void;
    setMaxDate(year: number, month: number, day: number): void;
  }

  export const PersianDate: PersianDateType;
  export const DateFormatter: DateFormatterType;
  export const DateUtils: DateUtilsType;
  export const PersianDatePickerElement: { new(): PersianDatePickerElement };
  export default PersianDatePickerElement;
}

declare module 'persian-datepicker-element/dist/persian-datepicker-element.min.esm.js' {
  export * from 'persian-datepicker-element';
}
