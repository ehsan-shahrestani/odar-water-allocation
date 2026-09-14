import { describe, expect, it } from 'vitest';
import { maskIranianMobile, normalizeIranianMobile, phoneStorageVariants } from './farmer-input';

describe('representative farmer phone helpers', () => {
  it('normalizes local, E.164, Persian, and Arabic digit mobile numbers', () => {
    expect(normalizeIranianMobile('0912 123 4567')).toBe('09121234567');
    expect(normalizeIranianMobile('+989121234567')).toBe('09121234567');
    expect(normalizeIranianMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(normalizeIranianMobile('٠٩١٢١٢٣٤٥٦٧')).toBe('09121234567');
  });

  it('rejects invalid Iranian mobile numbers', () => {
    expect(normalizeIranianMobile('02112345678')).toBeNull();
    expect(normalizeIranianMobile('0912123')).toBeNull();
  });

  it('produces known storage formats and a safe log representation', () => {
    expect(phoneStorageVariants('09121234567')).toEqual([
      '09121234567',
      '9121234567',
      '+989121234567',
      '00989121234567',
      '989121234567',
    ]);
    expect(maskIranianMobile('09121234567')).toBe('0912***4567');
  });
});
