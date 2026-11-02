const digits = (value: number) => String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

export function duration(hours: number): string {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `${digits(wholeHours)} ساعت`;
  if (!wholeHours) return `${digits(minutes)} دقیقه`;
  return `${digits(wholeHours)} ساعت و ${digits(minutes)} دقیقه`;
}

export function transferMessage(outgoing: boolean, hours: number, remaining: number, kind: string, date: string): string {
  const names: Record<string, string> = {
    sale: outgoing ? 'فروش' : 'خرید',
    loan: outgoing ? 'قرض دادن' : 'قرض گرفتن',
    return: 'بازپرداخت قرض',
    correction: 'اصلاح',
  };
  return [
    'سامانه اودار',
    `${outgoing ? 'کاهش' : 'افزایش'} سهمیه${names[kind] ? `/${names[kind]}` : ''}`,
    `${outgoing ? '-' : '+'}${duration(hours)}`,
    `مانده: ${duration(remaining)}`,
    date,
  ].join('\n');
}
