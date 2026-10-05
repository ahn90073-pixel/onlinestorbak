
## GitHub Actions وDATABASE_URL

يوجد Workflow في `.github/workflows/deploy-cloudflare.yml` يعمل عند كل push إلى `main` أو يدويًا من تبويب Actions. يقوم بالآتي:

1. تثبيت الحزم والتحقق من TypeScript.
2. قراءة `DATABASE_URL` من GitHub Secret.
3. رفعها إلى Cloudflare كـWorker Secret باسم `DATABASE_URL`.
4. بناء ونشر Worker.

أضف هذه الأسرار في GitHub من:

`Settings → Secrets and variables → Actions → New repository secret`

```text
DATABASE_URL             قيمة اتصال Neon الكاملة
CLOUDFLARE_API_TOKEN     Cloudflare API Token بصلاحية Workers Scripts Edit
CLOUDFLARE_ACCOUNT_ID    Account ID الخاص بحساب Cloudflare
```

`DATABASE_URL` لا يتم طباعتها في سجل GitHub ولا تُحفظ داخل المستودع. استخدمنا Worker Secret لأنها قيمة حساسة، وليس Cloudflare plaintext variable.
