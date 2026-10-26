require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

function requireDb(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "قاعدة البيانات غير موصولة بعد. أضف DATABASE_URL في إعدادات الاستضافة."
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || req.get("x-admin-token") !== expected) {
    return res.status(401).json({ success: false, message: "رمز الإدارة غير صحيح." });
  }
  next();
}

app.get("/api/health", async (req, res) => {
  if (!pool) return res.json({ success: true, server: "running", database: "not_configured" });
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, server: "running", database: "connected" });
  } catch (e) {
    res.status(500).json({ success: false, server: "running", database: "error" });
  }
});

app.get("/api/products", requireDb, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, image_url, category, stock, is_offer, created_at
       FROM products ORDER BY created_at DESC, id DESC`
    );
    res.json({ success: true, products: result.rows });
  } catch (e) {
    console.error("GET products:", e.message);
    res.status(500).json({ success: false, message: "تعذر تحميل المنتجات." });
  }
});

app.post("/api/orders", requireDb, async (req, res) => {
  const { customer_name, customer_phone, customer_address, items } = req.body || {};
  if (!customer_name || !customer_phone || !customer_address ||
      !Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ success: false, message: "راجع بيانات العميل والمنتجات." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    const validated = [];

    for (const item of items) {
      const id = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        throw new Error("بيانات أحد المنتجات غير صحيحة.");
      }
      const productResult = await client.query(
        "SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE", [id]
      );
      if (!productResult.rows.length) throw new Error("أحد المنتجات غير موجود.");
      const product = productResult.rows[0];
      if (Number(product.stock) < quantity) throw new Error("الكمية المطلوبة غير متاحة: " + product.name);
      const unitPrice = Number(product.price);
      total += unitPrice * quantity;
      validated.push({ product, quantity, unitPrice });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_phone, customer_address, total, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [String(customer_name).trim(), String(customer_phone).trim(),
       String(customer_address).trim(), total.toFixed(2)]
    );
    const orderId = orderResult.rows[0].id;

    for (const entry of validated) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, entry.product.id, entry.product.name, entry.quantity, entry.unitPrice]
      );
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2",
        [entry.quantity, entry.product.id]);
    }

    await client.query("COMMIT");
    res.status(201).json({ success: true, order_id: orderId, total: Number(total.toFixed(2)) });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: e.message || "تعذر تسجيل الطلب." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/orders", requireDb, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.customer_name, o.customer_phone, o.customer_address, o.total,
              o.status, o.created_at,
              COALESCE(json_agg(json_build_object(
                'product_name', oi.product_name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price
              )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`
    );
    res.json({ success: true, orders: result.rows });
  } catch (e) {
    console.error("GET orders:", e.message);
    res.status(500).json({ success: false, message: "تعذر تحميل الطلبات." });
  }
});

app.post("/api/admin/products", requireDb, requireAdmin, async (req, res) => {
  const { name, description = "", price, image_url = "", category = "عام", stock = 0, is_offer = false } = req.body || {};
  const numericPrice = Number(price);
  const numericStock = Number(stock);
  if (!name || !Number.isFinite(numericPrice) || numericPrice < 0 ||
      !Number.isInteger(numericStock) || numericStock < 0) {
    return res.status(400).json({ success: false, message: "راجع اسم المنتج والسعر والمخزون." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, price, image_url, category, stock, is_offer)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [String(name).trim(), String(description), numericPrice, String(image_url),
       String(category), numericStock, Boolean(is_offer)]
    );
    res.status(201).json({ success: true, product: result.rows[0] });
  } catch (e) {
    console.error("POST product:", e.message);
    res.status(500).json({ success: false, message: "تعذر إضافة المنتج." });
  }
});

app.patch("/api/admin/orders/:id/status", requireDb, requireAdmin, async (req, res) => {
  const allowed = ["pending", "confirmed", "delivered", "cancelled"];
  const status = req.body && req.body.status;
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: "حالة الطلب غير صحيحة." });
  try {
    const result = await pool.query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status",
      [status, Number(req.params.id)]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    res.json({ success: true, order: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: "تعذر تحديث الطلب." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Pharmacy store running on port ${port}`));
