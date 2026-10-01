import { normalizeDigits } from './mock-data';

/**
 * Extracts a numeric OTP code of specified length from an SMS text.
 * Supports:
 * - WebOTP standard: `@domain #1234`
 * - Persian text pattern: `رمز : 1234` or `کد تایید : 1234`
 * - Persian and Arabic digits (automatically normalized to English digits)
 */
export function extractOtpFromSms(
  sms: string | null | undefined,
  expectedLength: number | number[] = 4,
): string | null {
  if (!sms || typeof sms !== 'string') {
    return null;
  }

  const lengths = Array.isArray(expectedLength) ? expectedLength : [expectedLength];
  const normalized = normalizeDigits(sms);

  for (const len of lengths) {
    // 1. WebOTP hash pattern: `@odar.ir #025877` or `#025877`
    const hashRegex = new RegExp(`#(\\d{${len}})(?:\\b|\\s|$)`);
    const hashMatch = normalized.match(hashRegex);
    if (hashMatch?.[1]) {
      return hashMatch[1];
    }

    // 2. Persian label pattern: `رمز : 025877` or `کد : 025877` or `کد تایید : 025877`
    const labelRegex = new RegExp(
      `(?:رمز|کد(?:\\s*تایید)?)\\s*[:=\\-]\\s*(\\d{${len}})(?:\\b|\\s|$)`,
    );
    const labelMatch = normalized.match(labelRegex);
    if (labelMatch?.[1]) {
      return labelMatch[1];
    }

    // 3. Fallback: isolated number matching exact length
    const standaloneRegex = new RegExp(
      `(?:^|\\s|[^\t\r\n\\d])(\\d{${len}})(?:$|\\s|[^\t\r\n\\d])`,
    );
    const standaloneMatch = normalized.match(standaloneRegex);
    if (standaloneMatch?.[1]) {
      return standaloneMatch[1];
    }
  }

  return null;
}
