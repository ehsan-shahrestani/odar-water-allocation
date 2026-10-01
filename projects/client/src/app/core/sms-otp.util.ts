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
  expectedLength = 4,
): string | null {
  if (!sms || typeof sms !== 'string') {
    return null;
  }

  const normalized = normalizeDigits(sms);

  // 1. WebOTP hash pattern: `@odar.ir #1234` or `#1234`
  const hashRegex = new RegExp(`#(\\d{${expectedLength}})(?:\\b|\\s|$)`);
  const hashMatch = normalized.match(hashRegex);
  if (hashMatch?.[1]) {
    return hashMatch[1];
  }

  // 2. Persian label pattern: `رمز : 1234` or `کد : 1234` or `کد تایید : 1234`
  const labelRegex = new RegExp(
    `(?:رمز|کد(?:\\s*تایید)?)\\s*[:=\\-]\\s*(\\d{${expectedLength}})(?:\\b|\\s|$)`,
  );
  const labelMatch = normalized.match(labelRegex);
  if (labelMatch?.[1]) {
    return labelMatch[1];
  }

  // 3. Fallback: isolated number matching exact length
  const standaloneRegex = new RegExp(
    `(?:^|\\s|[^\t\r\n\\d])(\\d{${expectedLength}})(?:$|\\s|[^\t\r\n\\d])`,
  );
  const standaloneMatch = normalized.match(standaloneRegex);
  if (standaloneMatch?.[1]) {
    return standaloneMatch[1];
  }

  return null;
}
