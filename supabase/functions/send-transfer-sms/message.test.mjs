import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duration, transferMessage } from './message.ts';

test('formats whole hours, minutes and mixed durations without zero units', () => {
  assert.equal(duration(9), '۹ ساعت');
  assert.equal(duration(0.5), '۳۰ دقیقه');
  assert.equal(duration(1.5), '۱ ساعت و ۳۰ دقیقه');
  assert.equal(duration(0), '۰ ساعت');
  assert.equal(duration(1.9999), '۲ ساعت');
});

test('messages distinguish outgoing and incoming balances', () => {
  assert.equal(transferMessage(true, 9, 21.5, 'sale', 'تاریخ'),
    'سامانه اودار\nکاهش سهمیه/فروش\n-۹ ساعت\nمانده: ۲۱ ساعت و ۳۰ دقیقه\nتاریخ');
  assert.equal(transferMessage(false, 0.5, 9, 'sale', 'تاریخ'),
    'سامانه اودار\nافزایش سهمیه/خرید\n+۳۰ دقیقه\nمانده: ۹ ساعت\nتاریخ');
  assert.match(transferMessage(true, 1, 2, 'loan', 'تاریخ'), /کاهش سهمیه\/قرض دادن/);
  assert.match(transferMessage(false, 1, 2, 'loan', 'تاریخ'), /افزایش سهمیه\/قرض گرفتن/);
  assert.match(transferMessage(false, 1, 2, 'return', 'تاریخ'), /افزایش سهمیه\/بازپرداخت قرض/);
  assert.match(transferMessage(true, 1, 2, 'correction', 'تاریخ'), /کاهش سهمیه\/اصلاح/);
  assert.match(transferMessage(true, 1, 2, 'unknown', 'تاریخ'), /کاهش سهمیه\n/);
});
