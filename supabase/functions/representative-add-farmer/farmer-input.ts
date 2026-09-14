const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);

    const arabicIndex = ARABIC_DIGITS.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  });
}

export function normalizeIranianMobile(value: string): string | null {
  const compact = toEnglishDigits(value).replace(/[^\d+]/g, '');
  let localPhone = compact;

  if (compact.startsWith('+98')) {
    localPhone = `0${compact.slice(3)}`;
  } else if (compact.startsWith('0098')) {
    localPhone = `0${compact.slice(4)}`;
  } else if (/^98\d{10}$/.test(compact)) {
    localPhone = `0${compact.slice(2)}`;
  } else if (/^9\d{9}$/.test(compact)) {
    localPhone = `0${compact}`;
  }

  return /^09\d{9}$/.test(localPhone) ? localPhone : null;
}

export function phoneStorageVariants(localPhone: string): string[] {
  const subscriber = localPhone.slice(1);
  return [localPhone, subscriber, `+98${subscriber}`, `0098${subscriber}`, `98${subscriber}`];
}

export function maskIranianMobile(localPhone: string): string {
  return `${localPhone.slice(0, 4)}***${localPhone.slice(-4)}`;
}
