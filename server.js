const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SHOP_NAME = process.env.SHOP_NAME || "Nanda's Creative";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nandas2026";
const SHOP_WHATSAPP = process.env.SHOP_WHATSAPP || "";
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 50);
const FREE_DELIVERY_ABOVE = Number(process.env.FREE_DELIVERY_ABOVE || 500);

const DATA = path.join(__dirname, "data");
const productsFile = path.join(DATA, "products.json");
const ordersFile = path.join(DATA, "orders.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function makeId() {
  return "ORD-" + Date.now().toString(36).toUpperCase() + "-" +
    Math.random().toString(36).slice(2, 7).toUpperCase();
}

app.get("/api/config", (req, res) => {
  res.json({
    shopName: SHOP_NAME,
    whatsapp: SHOP_WHATSAPP,
    deliveryFee: DELIVERY_FEE,
    freeDeliveryAbove: FREE_DELIVERY_ABOVE
  });
});

app.get("/api/products", (req, res) => {
  res.json(readJson(productsFile, []));
});

app.post("/api/orders", (req, res) => {
  const { customer, items, paymentMethod = "cod", notes = "" } = req.body || {};

  if (!customer || !customer.name || !customer.phone || !customer.address) {
    return res.status(400).json({ error: "Name, phone and delivery address are required." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty." });
  }

  const products = readJson(productsFile, []);
  const normalized = [];

  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    const qty = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    if (!product) return res.status(400).json({ error: "Invalid product in cart." });
    normalized.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
      lineTotal: product.price * qty
    });
  }

  const subtotal = normalized.reduce((sum, i) => sum + i.lineTotal, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  const order = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    customer: {
      name: String(customer.name).trim(),
      phone: String(customer.phone).trim(),
      address: String(customer.address).trim(),
      city: String(customer.city || "").trim(),
      pincode: String(customer.pincode || "").trim()
    },
    items: normalized,
    subtotal,
    deliveryFee,
    total,
    paymentMethod,
    notes: String(notes || "").trim(),
    status: "Received"
  };

  const orders = readJson(ordersFile, []);
  orders.unshift(order);
  writeJson(ordersFile, orders);

  let whatsappUrl = "";
  if (SHOP_WHATSAPP) {
    const lines = [
      `New order ${order.id} - ${SHOP_NAME}`,
      `Customer: ${order.customer.name}`,
      `Phone: ${order.customer.phone}`,
      `Address: ${order.customer.address}`,
      order.customer.city ? `City: ${order.customer.city}` : "",
      order.customer.pincode ? `PIN: ${order.customer.pincode}` : "",
      "",
      ...order.items.map(i => `${i.name} x ${i.quantity} = ₹${i.lineTotal}`),
      "",
      `Subtotal: ₹${order.subtotal}`,
      `Delivery: ₹${order.deliveryFee}`,
      `Total: ₹${order.total}`,
      `Payment: ${order.paymentMethod}`,
      order.notes ? `Notes: ${order.notes}` : ""
    ].filter(Boolean);
    whatsappUrl = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  res.status(201).json({ order, whatsappUrl });
});

function requireAdmin(req, res, next) {
  const supplied = req.headers["x-admin-password"];
  if (!supplied || supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid admin password." });
  }
  next();
}

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json(readJson(ordersFile, []));
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const allowed = ["Received", "Confirmed", "Baking", "Out for delivery", "Delivered", "Cancelled"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });

  const orders = readJson(ordersFile, []);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeJson(ordersFile, orders);
  res.json(order);
});

app.get("/api/orders/:id", (req, res) => {
  const orders = readJson(ordersFile, []);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({
    id: order.id,
    createdAt: order.createdAt,
    total: order.total,
    status: order.status,
    items: order.items,
    customer: { name: order.customer.name, city: order.customer.city }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`${SHOP_NAME} running at http://localhost:${PORT}`);
});
