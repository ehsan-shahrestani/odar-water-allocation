import { describe, expect, it } from 'vitest';
import { calculateTotalHours, formatHoursDisplay, parseHoursNumber } from './mock-data';

describe('calculateTotalHours', () => {
  it('calculates hours and minutes accurately', () => {
    // 2 hours and 20 minutes = 2.3333
    expect(calculateTotalHours('2', '20')).toBe(2.3333);
    expect(calculateTotalHours('۲', '۲۰')).toBe(2.3333);
    // Hours only
    expect(calculateTotalHours('2', '')).toBe(2);
    expect(calculateTotalHours('2', '0')).toBe(2);
    // Minutes only
    expect(calculateTotalHours('', '30')).toBe(0.5);
    expect(calculateTotalHours('0', '45')).toBe(0.75);
    expect(calculateTotalHours('', '15')).toBe(0.25);
  });

  it('returns null for empty or invalid inputs', () => {
    expect(calculateTotalHours('', '')).toBeNull();
    expect(calculateTotalHours(null, null)).toBeNull();
    expect(calculateTotalHours(undefined, undefined)).toBeNull();
    // Minutes >= 60
    expect(calculateTotalHours('1', '60')).toBeNull();
    expect(calculateTotalHours('1', '75')).toBeNull();
    // Negative values
    expect(calculateTotalHours('-1', '10')).toBeNull();
    expect(calculateTotalHours('1', '-5')).toBeNull();
    // Non-numeric
    expect(calculateTotalHours('abc', 'xyz')).toBeNull();
  });
});

describe('parseHoursNumber', () => {

  it('parses whole numbers and decimals correctly', () => {
    expect(parseHoursNumber('2')).toBe(2);
    expect(parseHoursNumber('2.5')).toBe(2.5);
    expect(parseHoursNumber('۲٫۵')).toBe(2.5);
    expect(parseHoursNumber('2.2')).toBe(2.2);
  });

  it('parses colon format (H:MM or HH:MM) into fractional hours', () => {
    // 2 hours 20 minutes = 2 + 20/60 = 2.3333
    expect(parseHoursNumber('2:20')).toBe(2.3333);
    expect(parseHoursNumber('۲:۲۰')).toBe(2.3333);
    expect(parseHoursNumber('2 : 20')).toBe(2.3333);
    // 1 hour 30 minutes
    expect(parseHoursNumber('1:30')).toBe(1.5);
    // 0 hours 45 minutes
    expect(parseHoursNumber(':45')).toBe(0.75);
    expect(parseHoursNumber('0:45')).toBe(0.75);
  });

  it('parses Persian text format', () => {
    expect(parseHoursNumber('2 ساعت و 20 دقیقه')).toBe(2.3333);
    expect(parseHoursNumber('۲ ساعت و ۲۰ دقیقه')).toBe(2.3333);
    expect(parseHoursNumber('2 ساعت 20 دقیقه')).toBe(2.3333);
    expect(parseHoursNumber('3 ساعت')).toBe(3);
    expect(parseHoursNumber('۳۰ دقیقه')).toBe(0.5);
    expect(parseHoursNumber('45 دقیقه')).toBe(0.75);
  });

  it('returns null for invalid inputs', () => {
    expect(parseHoursNumber('')).toBeNull();
    expect(parseHoursNumber('   ')).toBeNull();
    expect(parseHoursNumber(null)).toBeNull();
    expect(parseHoursNumber(undefined)).toBeNull();
    expect(parseHoursNumber('abc')).toBeNull();
    // Minutes out of bounds
    expect(parseHoursNumber('2:65')).toBeNull();
  });
});

describe('formatHoursDisplay', () => {
  it('formats whole hours as "X ساعت"', () => {
    expect(formatHoursDisplay(0)).toBe('۰ ساعت');
    expect(formatHoursDisplay(3)).toBe('۳ ساعت');
  });

  it('formats minutes only as "Y دقیقه"', () => {
    expect(formatHoursDisplay(0.5)).toBe('۳۰ دقیقه');
  });

  it('formats hours and minutes as "X ساعت و Y دقیقه"', () => {
    expect(formatHoursDisplay(2.3333)).toBe('۲ ساعت و ۲۰ دقیقه');
    expect(formatHoursDisplay(2.5)).toBe('۲ ساعت و ۳۰ دقیقه');
    expect(formatHoursDisplay(2.2)).toBe('۲ ساعت و ۱۲ دقیقه');
  });

  it('handles negative numbers', () => {
    expect(formatHoursDisplay(-1.5)).toBe('منفی ۱ ساعت و ۳۰ دقیقه');
  });
});
