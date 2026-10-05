
## Vite وCloudflare deployment

تم تجهيز المشروع باستخدام `vite` و`@cloudflare/vite-plugin`.

```bash
# تشغيل التطوير عبر Vite
npm run dev

# فحص TypeScript
npm run typecheck

# إنشاء build الإنتاج
npm run build

# build ثم نشر Worker إلى Cloudflare
npm run deploy
```

يولّد Vite ملفات Worker داخل `dist/neon-store-api/` ويعيد توجيه Wrangler تلقائيًا إلى إعداد build الناتج. ضع سر Neon قبل النشر:

```bash
npx wrangler secret put DATABASE_URL
npm run deploy
```

تم اختبار `npm run deploy -- --dry-run` بنجاح.
