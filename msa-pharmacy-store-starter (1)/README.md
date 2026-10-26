# متجر صيدليات محمد سعد

متجر عربي RTL للمستلزمات الطبية ومستحضرات التجميل والعناية الشخصية، بدون أدوية.

## الملفات
- `public/index.html`: واجهة المتجر
- `public/product.html`: تفاصيل المنتج
- `public/css/style.css`: التصميم
- `public/js/app.js`: البحث والتصنيفات والسلة والطلب عبر واتساب
- `server.js`: واجهة API واتصال Neon

## تشغيل محلي
يتطلب Node.js 18 أو أحدث:
```bash
npm install
```
انسخ `.env.example` إلى `.env` وضع بيانات الاتصال السرية هناك، ثم:
```bash
npm start
```

## إعداد Neon
أنشئ الجداول التالية في SQL Editor (متوافقة مع بنية API):
```sql
CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  category VARCHAR(100),
  stock INTEGER NOT NULL DEFAULT 0,
  is_offer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  customer_address TEXT NOT NULL,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL
);
```

## ملاحظات أمان
- لا ترفع ملف `.env` أو بيانات الاتصال إلى GitHub.
- عيّن `DATABASE_URL` و`ADMIN_TOKEN` كمتغيرات بيئة في الاستضافة.
- واجهة الإدارة API محمية برمز سري، لكن واجهة لوحة الإدارة نفسها غير مضافة في هذه النسخة.
- الصور الافتراضية في `/images/` تحتاج رفع ملفات الصور الأصلية؛ لو لم تتوفر، تظهر مساحة بديلة.
- الطلب عبر واتساب يفتح رسالة جاهزة ولا يحفظ الطلب في قاعدة البيانات تلقائيًا. حفظ الطلبات في Neon يحتاج إضافة مسار checkout server-side مع تأكيد المستخدم؛ لا تعتمد على WhatsApp فقط.
