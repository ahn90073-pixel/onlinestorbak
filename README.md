# Online Store Backend API

Cloudflare Worker API مبني على **Hono + Neon PostgreSQL** ومطابق لاسكيما المتجر متعددة الشركات.

## التشغيل

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

المتغيرات:

```env
DATABASE_URL="postgresql://..."
ALLOWED_ORIGINS="https://frontend.example.com,http://localhost:3000"
```

## قاعدة البيانات

1. نفّذ `schema.sql` مرة واحدة على Neon.
2. نفّذ `migrations/001_customer_auth.sql` لإضافة `password_hash` وجدول الجلسات.
3. فعّل المتجر:

```sql
update app.companies set status = 'active' where slug = 'demo-store';
```

لا يتم وضع `DATABASE_URL` داخل الواجهة أو داخل Git.

## اختيار المتجر

كل endpoint يحتاج `?store=demo-store` أو الهيدر `X-Store-Slug: demo-store`. لا يتم قبول `company_id` من العميل.

## مصادقة العملاء

المصادقة تستخدم **PBKDF2-SHA-256** لكلمات المرور، وopaque bearer tokens مخزنة كـSHA-256 فقط في قاعدة البيانات. مدة الجلسة 30 يومًا.

### تسجيل عميل

```http
POST /api/v1/auth/register
Content-Type: application/json
X-Store-Slug: demo-store

{
  "email": "customer@example.com",
  "password": "strong-password-123",
  "fullName": "Customer Name",
  "phone": "+201000000000"
}
```

### تسجيل الدخول

```http
POST /api/v1/auth/login
X-Store-Slug: demo-store
Content-Type: application/json

{"email":"customer@example.com","password":"strong-password-123"}
```

يُستخدم الـtoken الناتج هكذا:

```http
Authorization: Bearer <token>
X-Store-Slug: demo-store
```

Endpoints إضافية:

- `GET /api/v1/auth/me?store=demo-store`
- `POST /api/v1/auth/logout`

## سلة التسوق

السلة تعمل بطريقتين:

- العميل المسجّل: أرسل `Authorization`، ويتم ربط السلة تلقائيًا بـ`customer_id`.
- الزائر: أنشئ مفتاحًا عشوائيًا من الواجهة وأرسله في كل طلب كـ`X-Cart-Key`. لا تستخدم بريد العميل أو رقم الهاتف كمفتاح.

Endpoints:

- `GET /api/v1/cart?store=demo-store`
- `POST /api/v1/cart/items?store=demo-store`
- `PATCH /api/v1/cart/items/:itemId?store=demo-store`
- `DELETE /api/v1/cart/items/:itemId?store=demo-store`
- `DELETE /api/v1/cart?store=demo-store`

إضافة منتج:

```http
POST /api/v1/cart/items?store=demo-store
X-Cart-Key: random-client-cart-key
Content-Type: application/json

{"productId":"<uuid>","variantId":null,"quantity":2}
```

لتحويل سلة الزائر بعد تسجيل الدخول، استدعِ `GET /api/v1/cart` أولًا بالمفتاح القديم، ثم أضف عناصرها بعد تسجيل الدخول. يمكن إضافة endpoint merge لاحقًا إذا كانت الواجهة تحتاج دمجًا ذريًا.

## Catalog endpoints

- `GET /health`
- `GET /api/v1/stores/:slug`
- `GET /api/v1/categories?store=demo-store`
- `GET /api/v1/products?store=demo-store&page=1&limit=24&search=phone&category=electronics&sort=price_asc`
- `GET /api/v1/products/:slug?store=demo-store`

## النشر

```bash
npx wrangler secret put DATABASE_URL
npm run deploy
```

تم اختبار المشروع عبر:

```bash
npm run typecheck
npx wrangler deploy --dry-run
```
