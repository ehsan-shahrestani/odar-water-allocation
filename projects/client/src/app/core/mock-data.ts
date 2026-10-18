export type Role = 'farmer' | 'representative' | 'admin';
export const waterYear = {
  name: '۱۴۰۴ – ۱۴۰۵',
  start: '۱ مهر ۱۴۰۴',
  end: '۳۱ شهریور ۱۴۰۵',
  description:
    'سهمیه این سال آبی برای آبیاری زمین‌های زیر پوشش چاه دشت سبز در نظر گرفته شده است. همه برداشت‌ها از ابتدای مهر تا پایان شهریور از سهمیه همین سال کسر می‌شوند. مانده سهمیه فقط تا پایان این سال آبی قابل استفاده است.',
};
export const wellName = 'چاه دشت سبز';
export const farmers = [
  { id: 1, name: 'علی محمدی', quota: 12000, used: 4500 },
  { id: 2, name: 'حسن رضایی', quota: 10000, used: 6200 },
  { id: 3, name: 'مهدی احمدی', quota: 8500, used: 2000 },
  { id: 4, name: 'رضا کریمی', quota: 15000, used: 8100 },
];
export const recentUsage = [
  { id: 3, date: '۱۲ شهریور ۱۴۰۵', volume: 800 },
  { id: 2, date: '۵ شهریور ۱۴۰۵', volume: 650 },
  { id: 1, date: '۲۸ مرداد ۱۴۰۵', volume: 900 },
];
export const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value);

/**
 * Format fractional hours as "X ساعت و Y دقیقه" for display.
 * Whole-hour values display as "X ساعت".
 * Example: 2.333... → "۲ ساعت و ۲۰ دقیقه"
 */
export const formatHoursDisplay = (value: number): string => {
  if (value === 0 || isNaN(value)) return `${faNumber(0)} ساعت`;
  const isNegative = value < 0;
  const absVal = Math.abs(value);
  const totalMinutes = Math.round(absVal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const prefix = isNegative ? 'منفی ' : '';
  if (h === 0 && m === 0) return `${faNumber(0)} ساعت`;
  if (m === 0) return `${prefix}${faNumber(h)} ساعت`;
  if (h === 0) return `${prefix}${faNumber(m)} دقیقه`;
  return `${prefix}${faNumber(h)} ساعت و ${faNumber(m)} دقیقه`;
};
export const normalizeDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
    .replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    .trim();
export const normalizeName = (value: string) =>
  value.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

export const parseHoursNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  const normalized = normalizeDigits(str).replace(/[٫،]/g, '.');

  // Support "H:MM" or ":MM" format with standard or Persian/Arabic colon (e.g., "2:20", ":45", "۲:۲۰")
  const colonMatch = normalized.match(/^(\d*)\s*[:：]\s*(\d{1,2})$/);
  if (colonMatch) {
    const hours = colonMatch[1] ? parseInt(colonMatch[1], 10) : 0;
    const minutes = parseInt(colonMatch[2], 10);
    if (minutes < 0 || minutes > 59) return null;
    return Math.round((hours + minutes / 60) * 10000) / 10000;
  }

  // Support Persian text format like "2 ساعت و 20 دقیقه", "2 ساعت", "45 دقیقه"
  const textMatch = normalized.match(/^(?:(\d+)\s*ساعت)?\s*(?:و?\s*(\d+)\s*دقیقه)?$/);
  if (textMatch && (textMatch[1] || textMatch[2])) {
    const hours = textMatch[1] ? parseInt(textMatch[1], 10) : 0;
    const minutes = textMatch[2] ? parseInt(textMatch[2], 10) : 0;
    if (minutes < 0 || minutes > 59) return null;
    return Math.round((hours + minutes / 60) * 10000) / 10000;
  }

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : Math.round(parsed * 10000) / 10000;
};

/**
 * Calculates total fractional hours from separate hours and minutes inputs.
 * Returns null if invalid (e.g. non-numeric, negative, or minutes >= 60) or both empty.
 */
export const calculateTotalHours = (
  hoursStr: string | number | null | undefined,
  minutesStr: string | number | null | undefined,
): number | null => {
  const hRaw = hoursStr !== null && hoursStr !== undefined ? normalizeDigits(String(hoursStr)).trim() : '';
  const mRaw = minutesStr !== null && minutesStr !== undefined ? normalizeDigits(String(minutesStr)).trim() : '';
  if (!hRaw && !mRaw) return null;

  const h = hRaw ? parseInt(hRaw, 10) : 0;
  const m = mRaw ? parseInt(mRaw, 10) : 0;
  if (isNaN(h) || isNaN(m) || h < 0 || m < 0 || m > 59) return null;
  return Math.round((h + m / 60) * 10000) / 10000;
};

