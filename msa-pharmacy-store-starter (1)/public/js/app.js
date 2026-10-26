const FALLBACK_PRODUCTS = [
  { id: 1, name: "مجموعة كابكسي الكاملة", oldPrice: 3500, newPrice: 2900, price: 2900, image: "/images/capixy.jpg", description: "شامبو + بلسم + سيرم + ماسك", category: "العناية بالشعر", is_offer: true, stock: 10 },
  { id: 2, name: "واقي شمس بيوديرما", oldPrice: 850, newPrice: 699, price: 699, image: "/images/bioderma.jpg", description: "SPF50 حماية عالية", category: "العناية بالبشرة", is_offer: true, stock: 10 },
  { id: 3, name: "سيرم فيتامين سي", oldPrice: 1200, newPrice: 999, price: 999, image: "/images/vitc.jpg", description: "تفتيح ونضارة البشرة", category: "العناية بالبشرة", is_offer: true, stock: 10 }
];

const WHATSAPP_NUMBER = "201010031279";
let products = [];
let cart = [];
let activeCategory = "الكل";

const $ = (selector) => document.querySelector(selector);
const money = (value) => `${Number(value || 0).toLocaleString("ar-EG")} جنيه`;
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function normalizeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || "",
    price: Number(p.price ?? p.newPrice ?? 0),
    oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
    image: p.image_url || p.image || "",
    category: p.category || "عام",
    is_offer: Boolean(p.is_offer ?? p.oldPrice),
    stock: Number(p.stock ?? 99)
  };
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("API not ready");
    const data = await response.json();
    if (!data.success || !Array.isArray(data.products)) throw new Error("Invalid products");
    products = data.products.map(normalizeProduct);
    $("#dataNotice").textContent = "المنتجات معروضة من قاعدة البيانات.";
  } catch (_) {
    products = FALLBACK_PRODUCTS.map(normalizeProduct);
    $("#dataNotice").textContent = "وضع التجربة: بنعرض المنتجات الافتراضية. بعد تشغيل السيرفر وربط Neon هتظهر المنتجات المحفوظة في قاعدة البيانات.";
  }
  renderProducts();
}

function renderProducts() {
  const query = ($("#searchInput").value || "").trim().toLocaleLowerCase("ar");
  const filtered = products.filter(p => {
    const matchesSearch = `${p.name} ${p.description} ${p.category}`.toLocaleLowerCase("ar").includes(query);
    const matchesCategory = activeCategory === "الكل" ||
      (activeCategory === "العروض" ? p.is_offer : p.category === activeCategory);
    return matchesSearch && matchesCategory;
  });
  $("#resultCount").textContent = `${filtered.length} منتج`;
  if (!filtered.length) {
    $("#productGrid").innerHTML = '<div class="no-products">مفيش منتجات مطابقة للبحث دلوقتي.</div>';
    return;
  }
  $("#productGrid").innerHTML = filtered.map(p => `
    <article class="product-card">
      <div class="product-image">
        ${p.is_offer ? '<span class="offer-tag">عرض مميز</span>' : ""}
        ${p.image ? `<img src="${safe(p.image)}" alt="${safe(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` : ""}
        <span class="image-placeholder" ${p.image ? 'style="display:none"' : ""}>✧</span>
      </div>
      <div class="product-info">
        <span class="product-category">${safe(p.category)}</span>
        <h3>${safe(p.name)}</h3>
        <p>${safe(p.description)}</p>
        <div class="price-row"><span class="new-price">${money(p.price)}</span>${p.oldPrice && p.oldPrice > p.price ? `<span class="old-price">${money(p.oldPrice)}</span>` : ""}</div>
        <div class="card-actions"><button class="add-button" data-add="${safe(p.id)}">أضف للسلة +</button><a class="details-link" href="/product.html?id=${encodeURIComponent(p.id)}">التفاصيل</a></div>
      </div>
    </article>`).join("");
}

function renderCart() {
  $("#cartCount").textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (!cart.length) {
    $("#cartItems").innerHTML = '<p class="empty-cart">لسه ما ضفتش منتجات للسلة.</p>';
  } else {
    $("#cartItems").innerHTML = cart.map(item => `
      <div class="cart-item">
        <div><strong>${safe(item.product.name)}</strong><small>${money(item.product.price)} × ${item.quantity}</small></div>
        <div class="qty-control"><button data-qty="-1" data-id="${safe(item.product.id)}" aria-label="تقليل الكمية">−</button><span>${item.quantity}</span><button data-qty="1" data-id="${safe(item.product.id)}" aria-label="زيادة الكمية">+</button></div>
      </div>`).join("");
  }
  $("#cartTotal").textContent = money(cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0));
}

function openCart() {
  document.body.classList.add("cart-open");
  $("#cartDrawer").setAttribute("aria-hidden", "false");
}
function closeCart() {
  document.body.classList.remove("cart-open");
  $("#cartDrawer").setAttribute("aria-hidden", "true");
}

$("#productGrid").addEventListener("click", event => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const product = products.find(p => String(p.id) === button.dataset.add);
  if (!product) return;
  const existing = cart.find(item => String(item.product.id) === String(product.id));
  if (existing) existing.quantity += 1;
  else cart.push({ product, quantity: 1 });
  renderCart();
  button.textContent = "اتضافت ✓";
  setTimeout(() => { if (button.isConnected) button.textContent = "أضف للسلة +"; }, 1000);
});

$("#cartItems").addEventListener("click", event => {
  const button = event.target.closest("[data-qty]");
  if (!button) return;
  const item = cart.find(i => String(i.product.id) === button.dataset.id);
  if (!item) return;
  item.quantity += Number(button.dataset.qty);
  if (item.quantity <= 0) cart = cart.filter(i => i !== item);
  renderCart();
});

$("#openCart").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#drawerBackdrop").addEventListener("click", closeCart);
$("#searchInput").addEventListener("input", renderProducts);
$("#categoryList").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  document.querySelectorAll(".category").forEach(b => b.classList.toggle("active", b === button));
  renderProducts();
});
$("#menuButton").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
$("#mainNav").addEventListener("click", event => {
  if (event.target.closest("a")) $("#mainNav").classList.remove("open");
});

$("#checkoutForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!cart.length) {
    alert("ضيف منتج واحد على الأقل للسلة الأول.");
    return;
  }
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  const address = String(form.get("address") || "").trim();
  if (!name || !phone || !address) return;
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const lines = cart.map(item => `- ${item.product.name} × ${item.quantity} = ${item.product.price * item.quantity} جنيه`);
  const message = [
    "طلب جديد من متجر صيدليات محمد سعد",
    `الاسم: ${name}`, `الموبايل: ${phone}`, `العنوان: ${address}`,
    "", ...lines, "", `الإجمالي التقريبي: ${total} جنيه`,
    "", "برجاء تأكيد توافر المنتجات والسعر قبل اعتماد الطلب."
  ].join("\n");
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
});

$("#year").textContent = new Date().getFullYear();
renderCart();
loadProducts();
