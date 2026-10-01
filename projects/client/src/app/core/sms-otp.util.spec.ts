import { describe, expect, it } from 'vitest';
import { extractOtpFromSms } from './sms-otp.util';

describe('extractOtpFromSms', () => {
  it('extracts a 4-digit OTP from standard Odar SMS format with English digits', () => {
    const sms = `تایید ورود به اودار\n\nرمز : 2587\n\n@odar.ir #2587`;
    expect(extractOtpFromSms(sms, 4)).toBe('2587');
  });

  it('extracts a 6-digit OTP from standard Odar SMS format when requested', () => {
    const sms = `تایید ورود به اودار\n\nرمز : 025877\n\n@odar.ir #025877`;
    expect(extractOtpFromSms(sms, 6)).toBe('025877');
  });

  it('extracts 4-digit OTP when SMS contains Persian numerals', () => {
    const sms = `تایید ورود به اودار\n\nرمز : ۲۵۸۷\n\n@odar.ir #۲۵۸۷`;
    expect(extractOtpFromSms(sms, 4)).toBe('2587');
  });

  it('extracts 4-digit OTP when SMS contains Arabic numerals', () => {
    const sms = `تایید ورود به اودار\n\nرمز : ٢٥٨٧\n\n@odar.ir #٢٥٨٧`;
    expect(extractOtpFromSms(sms, 4)).toBe('2587');
  });

  it('extracts OTP from WebOTP hash format directly', () => {
    const sms = `@odar.ir #7890`;
    expect(extractOtpFromSms(sms, 4)).toBe('7890');
  });

  it('extracts OTP from Persian label variants (کد تایید : 1234)', () => {
    const sms = `کد تایید ورود به سامانه: 4321`;
    expect(extractOtpFromSms(sms, 4)).toBe('4321');
  });

  it('extracts standalone 4-digit code in sentence', () => {
    const sms = `کد شما 9812 است.`;
    expect(extractOtpFromSms(sms, 4)).toBe('9812');
  });

  it('returns null for unrelated text without numbers', () => {
    const sms = `سلام، برداشت آب چاه شماره یک ثبت شد.`;
    expect(extractOtpFromSms(sms, 4)).toBeNull();
  });

  it('returns null when number length does not match expectedLength', () => {
    const sms = `رمز : 12345\n@odar.ir #12345`;
    expect(extractOtpFromSms(sms, 4)).toBeNull();
  });

  it('handles null, undefined, or empty inputs gracefully', () => {
    expect(extractOtpFromSms('')).toBeNull();
    expect(extractOtpFromSms(null)).toBeNull();
    expect(extractOtpFromSms(undefined)).toBeNull();
  });
});
