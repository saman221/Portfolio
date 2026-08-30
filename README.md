# Saman Majidi Portfolio

پورتفولیوی استاتیک فارسی سامان مجیدی، آمادهٔ انتشار zero-build روی Vercel.

## اجرای محلی

پروژه build step یا وابستگی npm ندارد. از ریشهٔ پروژه یک وب‌سرور استاتیک اجرا کنید:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

سپس `http://127.0.0.1:4173/` را باز کنید. بازکردن مستقیم `index.html` با `file://` برای ES modules مناسب نیست.

## پیش‌نمایش آواتار سه‌بعدی

صفحهٔ مستقل `http://127.0.0.1:4173/avatar-preview.html` مدل Rig‌شده را از
`assets/models/saman-avatar.glb` بارگذاری می‌کند. این صفحه به Navigation یا صفحهٔ اصلی متصل نیست و تمام
وابستگی‌های Three.js را به‌صورت محلی استفاده می‌کند.

فایل قابل‌ویرایش Blender در `deliverables/saman-avatar/saman-avatar.blend` قرار دارد. برای بازسازی کامل
GLB، رندر ثابت و تصاویر QA با Blender 5.2 LTS اجرا کنید:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools\build_avatar.py
```

تصاویر مرجع شخص در خروجی یا فایل Blender ذخیره نمی‌شوند. Textureهای تحویلی، به‌صورت محلی و Procedural
تولید شده‌اند.

## انتقال به GitHub

1. در GitHub یک repository خالی و **Private** بسازید؛ هنگام ساخت، README، `.gitignore` یا License اضافه نکنید.
2. URL مخزن را جایگزین `<repository-url>` کنید و از ریشهٔ پروژه اجرا کنید:

```powershell
git remote add origin <repository-url>
git push -u origin main
```

هیچ secret یا متغیر محیطی برای این سایت لازم نیست.

## اتصال به Vercel

1. در Vercel گزینهٔ **Add New → Project** را انتخاب و repository خصوصی GitHub را import کنید.
2. Framework Preset را روی **Other** بگذارید.
3. Root Directory همان ریشهٔ repository باشد.
4. Build Command، Output Directory و Install Command را خالی نگه دارید.
5. deployment را ایجاد کنید؛ Vercel فایل‌های ریشه را مستقیماً به‌صورت static ارائه می‌کند.

تنظیمات امنیتی و cache در `vercel.json` نگهداری می‌شوند؛ از واردکردن تنظیمات موازی در داشبورد خودداری کنید مگر اینکه عمداً بخواهید رفتار repository را override کنید.

## دامنهٔ اصلی

دامنهٔ canonical سایت `https://saman-majidi.ir/` است. پس از اولین deployment:

1. در **Project Settings → Domains** دامنه‌های `saman-majidi.ir` و `www.saman-majidi.ir` را اضافه کنید.
2. دامنهٔ apex را به‌عنوان دامنهٔ اصلی انتخاب و `www` را به آن redirect کنید.
3. رکوردهای DNS را دقیقاً طبق مقادیری که Vercel برای همین پروژه نمایش می‌دهد، در پنل ثبت‌کنندهٔ دامنه وارد کنید. مقدار عمومی یا حدسی را hardcode نکنید.
4. بعد از انتشار DNS، HTTPS، redirect و canonical را بررسی کنید.

در بررسی ۲۹ اوت ۲۰۲۶، apex و `www` هنوز رکورد DNS قابل‌حل نداشتند.

## بررسی پس از انتشار

```powershell
curl.exe -I https://saman-majidi.ir/
curl.exe -I https://www.saman-majidi.ir/
curl.exe -I https://saman-majidi.ir/assets/css/style.css
```

انتظار می‌رود دامنهٔ اصلی پاسخ HTTPS موفق بدهد، `www` به دامنهٔ اصلی redirect شود و پاسخ‌ها هدرهای امنیتی تعریف‌شده در `vercel.json` را داشته باشند.

## مجوز دارایی‌ها

- فایل‌های Three.js همراه با `assets/vendor/THREE-LICENSE.txt` نگهداری می‌شوند.
- افزونه‌های محلی `GLTFLoader`، `OrbitControls`، `BufferGeometryUtils` و `SkeletonUtils` دقیقاً از Three.js r185 هستند.
- مجوزهای SIL Open Font License برای Estedad و Space Grotesk در `assets/fonts/` قرار دارند.
