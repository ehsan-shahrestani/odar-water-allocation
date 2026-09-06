# اُدار — سهم آب

اپ فارسی RTL با Angular 22 Standalone، Tailwind CSS v4، Signals، Signal Forms و Router. چهار صفحه با عرض پایه و حداکثر 390px؛ در نمایشگر کوچک‌تر نیز عرض تطبیق دارد. فونت Vazirmatn از `public/fonts` با مجوز OFL به‌صورت محلی بارگیری می‌شود.

نسخه production یک PWA قابل نصب است. manifest فارسی، آیکن اختصاصی و Angular Service Worker دارد و فایل‌های اصلی، فونت‌ها و آیکن‌ها را برای اجرای آفلاین ذخیره می‌کند. Service Worker در حالت development غیرفعال است و روی HTTPS یا localhost فعال می‌شود.

## اجرا و بررسی

```bash
npm ci
npm start
npm run build
npm run lint
npm run test:unit
npm run test:e2e
```

## اتصال Supabase و ورود ادمین

مقادیر `supabaseUrl` و `supabasePublishableKey` را در هر دو فایل زیر جایگزین کنید:

- `src/environments/environment.ts` برای build تولید
- `src/environments/environment.development.ts` برای اجرای development

فقط Project URL و Publishable Key مرورگر را وارد کنید. Secret Key، `service_role` و رمز دیتابیس نباید وارد کد Angular شوند.

ورود `/login` با ایمیل و رمز Supabase انجام می‌شود. پس از ورود، رکورد متناظر `profiles` خوانده می‌شود و فقط پروفایل فعال با نقش `admin` به `/admin` دسترسی دارد. نگهداری و نوسازی Session را `@supabase/supabase-js` انجام می‌دهد. guard سمت Angular فقط برای تجربه کاربری است و RLS همچنان مرجع امنیت داده‌هاست.

## محدوده نسخه

- خانه کشاورز: نام، چاه، مشخصات کامل سال آبی، سهمیه، مصرف، مانده و سه مصرف آخر.
- خانه نماینده: نام، چاه، سال آبی، دو دکمه و جستجوی فعال لیست کشاورزان.
- خانه ادمین: سه شمارنده و ورودی لیست‌ها.
- ثبت مصرف، افزودن کشاورز و لیست‌های ادمین خارج از چهار صفحه هستند؛ کنترل‌های آن‌ها پیام صریح عدم پیاده‌سازی نشان می‌دهند و مسیر جدید یا عملیات نوشتن ندارند.
- `@supabase/supabase-js` برای ورود ادمین، بازیابی Session و دریافت پروفایل استفاده می‌شود.
- بدون SSR، SCSS، NestJS، NgRx و کتابخانه UI.

## ساختار

- `src/app/features/`: صفحه ورود و route/layout/home هر نقش.
- `src/app/shared/`: button، input، card، page-header و bottom-navigation.
- `src/app/core/`: داده‌های آزمایشی، ورود و guard.
- `src/styles.css`: فونت محلی و سبک مشترک RTL.
- `.agents/skills/`: مهارت‌های رسمی `angular-developer` و `angular-new-app` از https://github.com/angular/skills.

تست مرورگر از Chrome نصب‌شده یا مسیر `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` استفاده می‌کند. سرور موقت تست با خروجی production اجرا و پس از تست متوقف می‌شود.
