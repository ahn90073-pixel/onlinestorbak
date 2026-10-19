
## GitHub Actions وDATABASE_URL

يوجد Workflow في `.github/workflows/deploy-cloudflare.yml` يعمل عند كل push إلى `main` أو يدويًا من تبويب Actions. يقوم بالآتي:

1. تثبيت الحزم والتحقق من TypeScript.
2. تطبيق migration آمن ومتكرر لإضافة PostGIS وحقول الموقع التقريبي إلى `app.device_tokens`.
3. تطبيق migration آمن ومتكرر لإضافة المحافظة إلى `app.device_tokens` و`public.notification_contacts`.
4. قراءة `DATABASE_URL` من GitHub Secret.
5. رفعها إلى Cloudflare كـWorker Secret باسم `DATABASE_URL`.
6. بناء ونشر Worker.

يسجل `POST /api/v1/notifications/token` توكن FCM في `app.device_tokens`. عند توفر المحافظة التي اختارها العميل في عنوان التوصيل، تُحفظ قيمتها المعيارية كذلك لتصفية حملات الإشعارات. ويستخرج Cloudflare أسماء المدينة والمنطقة والبلد ونقطة جغرافية تقريبية من IP عند توفرها؛ لا يطلب التطبيق إذن GPS ولا يخزن عنوان IP الخام.

أضف هذه الأسرار في GitHub من:

`Settings → Secrets and variables → Actions → New repository secret`

```text
DATABASE_URL             قيمة اتصال Neon الكاملة
CLOUDFLARE_API_TOKEN     Cloudflare API Token بصلاحية Workers Scripts Edit
CLOUDFLARE_ACCOUNT_ID    Account ID الخاص بحساب Cloudflare
```

`DATABASE_URL` لا يتم طباعتها في سجل GitHub ولا تُحفظ داخل المستودع. استخدمنا Worker Secret لأنها قيمة حساسة، وليس Cloudflare plaintext variable.
