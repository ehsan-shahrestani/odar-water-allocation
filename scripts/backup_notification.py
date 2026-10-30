#!/usr/bin/env python3
"""Notify about a completed backup without printing provider responses or secrets."""
import json
import os
import sys
from urllib.error import HTTPError
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

    try:
        with urlopen(request, timeout=15) as response:
            result = json.load(response)
    except HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            err_msg = err_body.get('return', {}).get('message', '')
            err_status = err_body.get('return', {}).get('status', e.code)
            raise RuntimeError(f"HTTP {e.code}: {err_status} - {err_msg}")
        except Exception:
            raise RuntimeError(f"HTTP {e.code}: {e.reason}")

    ret = result.get('return') or {}
    status = ret.get('status')
    if status not in (200, 201):
        raise RuntimeError(f"Kavenegar rejected with status {status}: {ret.get('message', 'unknown')}")

    entries = result.get('entries') or []
    if not entries or any(entry.get('status') not in (1, 2, 4, 5, 10) for entry in entries):
        entry_status = entries[0].get('status') if entries else 'empty'
        entry_text = entries[0].get('statustext') if entries else 'no entry'
        raise RuntimeError(f"SMS notification rejected by carrier: {entry_status} ({entry_text})")
    print('Backup notification accepted by provider.')

if __name__ == '__main__':
    key = os.environ.get('KAVENEGAR_API_KEY', '').strip()
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in ('success', 'failure'):
            raise ValueError('Expected success or failure')
        send(sys.argv[1])
    except Exception as exc:
        clean_msg = str(exc).replace(key, '***') if key else str(exc)
        print(f'::warning::Backup notification failed: {clean_msg}; the backup result is unchanged.')
        sys.exit(1)
