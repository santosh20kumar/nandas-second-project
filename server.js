const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const SHOP_NAME = process.env.SHOP_NAME || "Nanda's Creative";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CHANGE_THIS_ADMIN_PASSWORD";
const SHOP_WHATSAPP = process.env.SHOP_WHATSAPP || "919000000000";
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 50);
const FREE_DELIVERY_ABOVE = Number(process.env.FREE_DELIVERY_ABOVE || 299);

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

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

function calculateCart(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Your cart is empty.");
  const products = readJson(productsFile, []);
  const normalized = [];
  for (const item of items) {
    const product = products.find(p => p.id === Number(item.productId));
    const qty = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    if (!product) throw new Error("Invalid product in cart.");
    normalized.push({
      productId: product.id, name: product.name, price: product.price,
      quantity: qty, lineTotal: product.price * qty
    });
  }
  const subtotal = normalized.reduce((sum, i) => sum + i.lineTotal, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  return { normalized, subtotal, deliveryFee, total: subtotal + deliveryFee };
}

function validateCustomer(customer) {
  if (!customer || !customer.name || !customer.phone || !customer.address) {
    throw new Error("Name, phone and delivery address are required.");
  }
  return {
    name: String(customer.name).trim(),
    phone: String(customer.phone).trim(),
    address: String(customer.address).trim(),
    city: String(customer.city || "").trim(),
    pincode: String(customer.pincode || "").trim()
  };
}

function makeWhatsappUrl(order) {
  if (!SHOP_WHATSAPP) return "";
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
    order.paymentId ? `Payment ID: ${order.paymentId}` : "",
    order.notes ? `Notes: ${order.notes}` : ""
  ].filter(Boolean);
  return `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function saveOrder({ customer, cart, paymentMethod, status, razorpayOrderId = "", paymentId = "", notes = "" }) {
  const order = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    customer,
    items: cart.normalized,
    subtotal: cart.subtotal,
    deliveryFee: cart.deliveryFee,
    total: cart.total,
    paymentMethod,
    paymentStatus: paymentId ? "Paid" : (paymentMethod === "online" ? "Pending" : "Unpaid"),
    razorpayOrderId,
    paymentId,
    notes: String(notes || "").trim(),
    status
  };
  const orders = readJson(ordersFile, []);
  orders.unshift(order);
  writeJson(ordersFile, orders);
  return order;
}

app.get("/api/config", (req, res) => {
  res.json({
    shopName: SHOP_NAME, whatsapp: SHOP_WHATSAPP,
    deliveryFee: DELIVERY_FEE, freeDeliveryAbove: FREE_DELIVERY_ABOVE,
    razorpayKeyId: RAZORPAY_KEY_ID,
    onlinePaymentsEnabled: Boolean(razorpay)
  });
});

app.get("/api/products", (req, res) => res.json(readJson(productsFile, [])));

app.post("/api/orders", (req, res) => {
  try {
    const { customer, items, paymentMethod = "cod", notes = "" } = req.body || {};
    const cleanCustomer = validateCustomer(customer);
    const cart = calculateCart(items);
    if (paymentMethod === "online") {
      return res.status(400).json({ error: "For online payment, use the online payment button." });
    }
    const order = saveOrder({ customer: cleanCustomer, cart, paymentMethod, status: "Received", notes });
    res.status(201).json({ order, whatsappUrl: makeWhatsappUrl(order) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not place order." });
  }
});

app.post("/api/payment/create-order", async (req, res) => {
  try {
    if (!razorpay) return res.status(503).json({ error: "Online payment is not configured yet." });
    const { customer, items, notes = "" } = req.body || {};
    const cleanCustomer = validateCustomer(customer);
    const cart = calculateCart(items);
    const rpOrder = await razorpay.orders.create({
      amount: Math.round(cart.total * 100), currency: "INR",
      receipt: `NANDA-${Date.now()}`
    });
    const order = saveOrder({
      customer: cleanCustomer, cart, paymentMethod: "online",
      status: "Payment Pending", razorpayOrderId: rpOrder.id, notes
    });
    res.json({
      keyId: RAZORPAY_KEY_ID, razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount, currency: rpOrder.currency,
      localOrderId: order.id, customer: cleanCustomer
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Could not create payment order." });
  }
});

app.post("/api/payment/verify", (req, res) => {
  try {
    if (!RAZORPAY_KEY_SECRET) return res.status(503).json({ error: "Online payment is not configured yet." });
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Incomplete payment response." });
    }
    const generatedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Payment verification failed." });
    }
    const orders = readJson(ordersFile, []);
    const order = orders.find(o => o.razorpayOrderId === razorpay_order_id);
    if (!order) return res.status(404).json({ success: false, error: "Local order not found." });
    order.paymentId = razorpay_payment_id;
    order.paymentStatus = "Paid";
    order.status = "Received";
    order.updatedAt = new Date().toISOString();
    writeJson(ordersFile, orders);
    res.json({ success: true, order, whatsappUrl: makeWhatsappUrl(order) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Could not verify payment." });
  }
});

function requireAdmin(req, res, next) {
  const supplied = req.headers["x-admin-password"];
  if (!supplied || supplied !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid admin password." });
  next();
}
app.get("/api/admin/orders", requireAdmin, (req, res) => res.json(readJson(ordersFile, [])));

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const allowed = ["Payment Pending", "Received", "Confirmed", "Baking", "Out for delivery", "Delivered", "Cancelled"];
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
  const order = readJson(ordersFile, []).find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({
    id: order.id, createdAt: order.createdAt, total: order.total,
    status: order.status, paymentStatus: order.paymentStatus,
    items: order.items, customer: { name: order.customer.name, city: order.customer.city }
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`${SHOP_NAME} running at http://localhost:${PORT}`));
