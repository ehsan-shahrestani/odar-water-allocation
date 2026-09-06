export type Role = 'farmer' | 'representative' | 'admin';
export const demoAccounts: Readonly<Record<string, Role>> = {
  '09120000001': 'farmer',
  '09120000002': 'representative',
  '09120000003': 'admin',
};
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
export const normalizeDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
    .replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    .trim();
export const normalizeName = (value: string) =>
  value.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
