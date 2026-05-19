const express = require("express");
const cors    = require("cors");
const jwt     = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET   = process.env.JWT_SECRET   || "kanhaiya2025secret";
const SYNC_API_KEY = process.env.SYNC_API_KEY || "tally2025kanhaiya";
const PORT         = process.env.PORT         || 3000;

// ── IN-MEMORY STORE ───────────────────────────────────────────────────────────
let store = {
  ledgers:      [],
  salesToday:   [],
  salesMonthly: { total: 0, vouchers: [] },
  stock:        [],
  lastSync:     null,
  orders:       [],
  registrations:[],
};

// ── USERS ─────────────────────────────────────────────────────────────────────
let users = [
  { id:1,  name:"Owner",          phone:"9999999999", pin:"1234",  role:"owner"    },
  { id:2,  name:"Ramesh Kumar",   phone:"8888888888", pin:"5678",  role:"staff"    },
  { id:10, name:"Sharma Traders", code:"RT001",       pin:"1111",  role:"retailer", partyName:"Sharma Traders"  },
  { id:11, name:"Gupta Hardware", code:"RT002",       pin:"2222",  role:"retailer", partyName:"Gupta Hardware"  },
  { id:12, name:"Verma Cement",   code:"RT003",       pin:"3333",  role:"retailer", partyName:"Verma Cement"    },
  { id:13, name:"Singh Suppliers",code:"RT004",       pin:"4444",  role:"retailer", partyName:"Singh Suppliers" },
];

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

function requireSyncKey(req, res, next) {
  if (req.headers["x-api-key"] !== SYNC_API_KEY)
    return res.status(401).json({ error: "Invalid sync key" });
  next();
}

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
});

app.get("/", (req, res) => {
  res.json({ app: "Kanhaiya Traders API", status: "running" });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { phone, code, pin, role } = req.body;
  let user = null;
  if (role === "retailer") {
    user = users.find(u => u.role === "retailer" && u.code === code && u.pin === pin);
  } else if (role === "owner" || role === "staff") {
    user = users.find(u => u.phone === phone && u.pin === pin && u.role === role);
  } else if (role === "management") {
    if (code === "admin" && pin === "0000")
      user = { id:0, name:"Owner", role:"management" };
  }
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign(
    { id:user.id, role:user.role, name:user.name, partyName:user.partyName },
    JWT_SECRET, { expiresIn: "7d" }
  );
  res.json({ token, user: { id:user.id, name:user.name, role:user.role } });
});

// ── TALLY SYNC ENDPOINTS ─────────────────────────────────────────────────────
app.post("/api/sync/ledgers", requireSyncKey, (req, res) => {
  store.ledgers = Array.isArray(req.body) ? req.body : [];
  store.lastSync = new Date().toISOString();
  res.json({ ok:true, count:store.ledgers.length });
});

app.post("/api/sync/sales-today", requireSyncKey, (req, res) => {
  store.salesToday = Array.isArray(req.body) ? req.body : [];
  store.lastSync = new Date().toISOString();
  res.json({ ok:true, count:store.salesToday.length });
});

app.post("/api/sync/sales-monthly", requireSyncKey, (req, res) => {
  store.salesMonthly = req.body || { total:0, vouchers:[] };
  store.lastSync = new Date().toISOString();
  res.json({ ok:true });
});

app.post("/api/sync/stock", requireSyncKey, (req, res) => {
  store.stock = Array.isArray(req.body) ? req.body : [];
  store.lastSync = new Date().toISOString();
  res.json({ ok:true, count:store.stock.length });
});

app.get("/api/sync/status", requireAuth, (req, res) => {
  res.json({ lastSync:store.lastSync, counts:{ ledgers:store.ledgers.length, salesToday:store.salesToday.length, stock:store.stock.length } });
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
// Retailer places order
app.post("/api/orders", requireAuth, (req, res) => {
  const order = {
    id: "ORD-" + Date.now(),
    retailer: req.user.partyName,
    retailerCode: req.body.retailerCode,
    brand: req.body.brand,
    qty: req.body.qty,
    rate: req.body.rate,
    total: req.body.total,
    area: req.body.area,
    date: new Date().toISOString().split("T")[0],
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  store.orders.unshift(order);
  res.json({ ok:true, order });
});

// Management gets all orders
app.get("/api/orders", requireAuth, (req, res) => {
  res.json(store.orders);
});

// Management approves or rejects
app.patch("/api/orders/:id", requireAuth, (req, res) => {
  const order = store.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.status = req.body.status;
  res.json({ ok:true, order });
});

// Retailer's own orders
app.get("/api/orders/mine", requireAuth, (req, res) => {
  const mine = store.orders.filter(o => o.retailer === req.user.partyName);
  res.json(mine);
});

// ── REGISTRATIONS ─────────────────────────────────────────────────────────────
// New retailer registers
app.post("/api/register", (req, res) => {
  const reg = {
    id: "REG-" + Date.now(),
    name: req.body.name,
    mobile: req.body.mobile,
    area: req.body.area,
    gst: req.body.gst || "",
    date: new Date().toISOString().split("T")[0],
    status: "pending",
  };
  store.registrations.unshift(reg);
  res.json({ ok:true, reg });
});

// Management gets all registrations
app.get("/api/registrations", requireAuth, (req, res) => {
  res.json(store.registrations);
});

// Management approves registration — creates retailer account
app.post("/api/registrations/:id/approve", requireAuth, (req, res) => {
  const reg = store.registrations.find(r => r.id === req.params.id);
  if (!reg) return res.status(404).json({ error: "Not found" });
  reg.status = "approved";

  // Generate new retailer code and PIN
  const retailerCount = users.filter(u => u.role === "retailer").length;
  const newCode = "RT" + String(retailerCount + 1).padStart(3, "0");
  const newPin  = String(Math.floor(1000 + Math.random() * 9000));

  users.push({
    id: Date.now(), name: reg.name,
    code: newCode, pin: newPin,
    role: "retailer", partyName: reg.name,
  });

  reg.assignedCode = newCode;
  reg.assignedPin  = newPin;

  res.json({ ok:true, code:newCode, pin:newPin, name:reg.name });
});

// Management rejects registration
app.post("/api/registrations/:id/reject", requireAuth, (req, res) => {
  const reg = store.registrations.find(r => r.id === req.params.id);
  if (reg) reg.status = "rejected";
  res.json({ ok:true });
});

// ── LEDGER DATA ───────────────────────────────────────────────────────────────
app.get("/api/ledger", requireAuth, (req, res) => {
  const partyName = req.user.partyName;
  const ledger    = store.ledgers.find(l => l.name === partyName);
  const txns      = store.salesToday.filter(v => v.party === partyName);
  res.json({ balance: ledger?.balance || 0, transactions: txns, lastSync: store.lastSync });
});

app.get("/api/owner/ledgers", requireAuth, (req, res) => {
  res.json(store.ledgers);
});

app.get("/api/owner/dashboard", requireAuth, (req, res) => {
  const outstanding = store.ledgers.filter(l => l.balance > 0).reduce((s,l) => s+l.balance, 0);
  res.json({
    todaySales:      store.salesToday.reduce((s,v) => s+v.amount, 0),
    monthlySales:    store.salesMonthly.total,
    totalOutstanding: outstanding,
    overdueCount:    store.ledgers.filter(l => l.balance > 0).length,
    totalStockBags:  store.stock.reduce((s,i) => s+(i.qty||0), 0),
    todayOrderCount: store.salesToday.length,
    lastSync:        store.lastSync,
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("Kanhaiya Traders API running on port", PORT);
});
