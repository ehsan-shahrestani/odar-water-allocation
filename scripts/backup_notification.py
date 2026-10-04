#!/usr/bin/env python3
"""Notify about a completed backup without printing provider responses or secrets."""
import json
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen


def send(kind):
    key = os.environ.get('KAVENEGAR_API_KEY', '').strip()
    phone = os.environ.get('ADMIN_PHONE', '').strip()
    if not key or not phone:
        print('::warning::Backup notification credentials are not configured.')
        return
    if kind == 'success':
        message = f"سامانه اُدار: بکاپ دیتابیس ایجاد، دانلود و بررسی شد.\nفایل: {os.environ['BACKUP_FILE']}\nحجم: {int(os.environ['FILESIZE']) // 1024} کیلوبایت"
    else:
        message = 'هشدار سامانه اُدار: ایجاد یا اعتبارسنجی بکاپ دیتابیس ناموفق بود. GitHub Actions را بررسی کنید.'
    request = Request(f'https://api.kavenegar.com/v1/{quote(key, safe="")}/sms/send.json',
                      data=urlencode({'receptor': phone, 'message': message}).encode(), method='POST')
    with urlopen(request, timeout=15) as response:
        result = json.load(response)
    if result.get('return', {}).get('status') not in (200, 201):
        raise RuntimeError('SMS provider rejected the notification')
    entries = result.get('entries') or []
    if not entries or any(entry.get('status') not in (1, 2, 4, 5, 10) for entry in entries):
        raise RuntimeError('SMS notification was rejected or has an unknown status')
    print('Backup notification accepted by provider.')

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in ('success', 'failure'):
            raise ValueError('Expected success or failure')
        send(sys.argv[1])
    except Exception:
        # Exception text may include a provider URL containing the API key.
        print('::warning::Backup notification failed; the backup result is unchanged.')
        sys.exit(1)
