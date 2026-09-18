/**
 * Pure TypeScript Jalali (Shamsi) Calendar Utilities
 * Accurate astronomical algorithm, zero external dependencies.
 */

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export const PERSIAN_WEEKDAYS = [
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
] as const;

export function toPersianDigits(input: number | string): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/\d/g, (d) => persianDigits[Number(d)] ?? d);
}

export function toEnglishDigits(input: string): string {
  return input.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * Checks if a given Jalali year is a leap year.
 */
export function isLeapJalaliYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const bl = breaks.length;
  let jp = breaks[0];
  let jm: number;
  let jump: number;
  let leap: number;
  let n: number;
  let i: number;

  if (jy < jp || jy >= breaks[bl - 1]) {
    return (((((jy - 474) % 2820) + 474 + 38) * 682) % 2816) < 682;
  }

  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  n = jy - jp;

  if (jump! - n < 6) {
    n = n - jump! + Math.floor((jump! + 4) / 33) * 33;
  }
  leap = ((((n + 1) % 33) - 1) % 4);
  if (leap === -1) {
    leap = 4;
  }
  return leap === 0;
}

/**
 * Returns the number of days in a Jalali month (1-12).
 */
export function getDaysInJalaliMonth(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jm === 12) {
    return isLeapJalaliYear(jy) ? 30 : 29;
  }
  return 30;
}

/**
 * Converts Jalali date (year, month, day) to Gregorian [year, month, day]
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const gyBase = jy <= 979 ? 621 : 1600;
  const currentJy = jy - (jy <= 979 ? 0 : 979);
  let gy = gyBase;

  let days =
    365 * currentJy +
    Math.floor(currentJy / 33) * 8 +
    Math.floor(((currentJy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  gy += 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let gd = days + 1;
  const isLeapG = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const salA = [0, 31, isLeapG ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;

  for (let m = 0; m < 13; m++) {
    const v = salA[m];
    if (gd <= v) {
      gm = m;
      break;
    }
    gd -= v;
  }

  return [gy, gm, gd];
}

/**
 * Converts Gregorian date (year, month, day) to Jalali [year, month, day]
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const currentGy = gy - (gy <= 1600 ? 621 : 1600);
  const gy2 = gm > 2 ? currentGy + 1 : currentGy;

  let days =
    365 * currentGy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;

  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);

  return [jy, jm, jd];
}

/**
 * Returns today's Jalali date components
 */
export function getTodayJalali(): { year: number; month: number; day: number } {
  const now = new Date();
  const [year, month, day] = gregorianToJalali(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
  return { year, month, day };
}

/**
 * Formats Jalali date to 'YYYY/MM/DD' with English digits
 */
export function formatJalali(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}/${m}/${d}`;
}

/**
 * Formats Jalali date to ISO 'YYYY-MM-DD' Gregorian date string
 */
export function jalaliToIso(year: number, month: number, day: number): string {
  const [gy, gm, gd] = jalaliToGregorian(year, month, day);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/**
 * Parses 'YYYY/MM/DD' or 'YYYY-MM-DD' Jalali string into components
 */
export function parseJalali(val: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!val) return null;
  const clean = toEnglishDigits(val.trim());
  const parts = clean.match(/\d+/g);
  if (!parts || parts.length < 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (year >= 1200 && year <= 1500 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    return { year, month, day };
  }
  return null;
}

/**
 * Parses ISO Gregorian date string ('YYYY-MM-DD') into Jalali components
 */
export function parseIsoToJalali(isoStr: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!isoStr) return null;
  const dateOnly = isoStr.split('T')[0];
  const parts = dateOnly.split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  const [jy, jm, jd] = gregorianToJalali(parts[0], parts[1], parts[2]);
  return { year: jy, month: jm, day: jd };
}

/**
 * Returns formatted readable string like: "دوشنبه، ۱ مهر ۱۴۰۴"
 */
export function formatJalaliReadable(year: number, month: number, day: number): string {
  const [gy, gm, gd] = jalaliToGregorian(year, month, day);
  const date = new Date(Date.UTC(gy, gm - 1, gd));
  const weekdayIndex = date.getUTCDay();
  const weekday = PERSIAN_WEEKDAYS[weekdayIndex] ?? '';
  const monthName = PERSIAN_MONTH_NAMES[month - 1] ?? '';
  return `${weekday}، ${toPersianDigits(day)} ${monthName} ${toPersianDigits(year)}`;
}
