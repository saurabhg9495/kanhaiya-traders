/**
 * Kanhaiya Traders — Backend API Server
 * ======================================
 * Deploy this on Railway, Render, or any Node.js host.
 *
 * Install:  npm install
 * Dev:      node server.js
 * Env vars: JWT_SECRET, SYNC_API_KEY, PORT
 */

const express = require("express");
const cors    = require("cors");
const jwt     = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const JWT_SECRET   = process.env.JWT_SECRET   || "kanhaiya-jwt-secret-change-in-production";
const SYNC_API_KEY = process.env.SYNC_API_KEY || "change-this-to-a-secret-key"; // must match tally_sync.py
const PORT         = process.env.PORT         || 3000;

// ─── IN-MEMORY DATA STORE ─────────────────────────────────────────────────────
// In production: swap this for MongoDB / PostgreSQL
let store = {
  ledgers:      [],   // [{name, balance, group, phone}]
  salesToday:   [],   // [{date, party, amount, narration, voucher_no}]
  salesMonthly: { total: 0, vouchers: [] },
  stock:        [],   // [{name, qty, unit}]
  lastSync:     null,
};

// ─── USER ACCOUNTS ────────────────────────────────────────────────────────────
// In production: store in a database with bcrypt-hashed PINs
const users = [
  {
    id: 1, name: "Owner",
    phone: "9999999999", pin: "1234",
    role: "owner",
  },
  {
    id: 2, name: "Ramesh Kumar (Staff)",
    phone: "8888888888", pin: "5678",
    role: "staff",
  },
  {
    id: 3, name: "Sharma Traders",
    code: "ST001", pin: "1111",
    role: "retailer", partyName: "Sharma Traders",
  },
  {
    id: 4, name: "Gupta Hardware",
    code: "GH002", pin: "2222",
    role: "retailer", partyName: "Gupta Hardware",
  },
];

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

/** Verify JWT sent by the mobile app */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Verify the API key sent by the Tally Sync Agent */
function requireSyncKey(req, res, next) {
  if (req.headers["x-api-key"] !== SYNC_API_KEY) {
    return res.status(401).json({ error: "Invalid sync API key" });
  }
  next();
}

/** Role guard factory */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post("/api/login", (req, res) => {
  const { phone, code, pin, role } = req.body;

  let user = null;
  if (role === "retailer") {
    user = users.find(u => u.role === "retailer" && u.code === code && u.pin === pin);
  } else {
    user = users.find(u => u.phone === phone && u.pin === pin && u.role === role);
  }

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, partyName: user.partyName },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role },
  });
});

// ─── SYNC ENDPOINTS (Tally Sync Agent → This server) ─────────────────────────

app.post("/api/sync/ledgers", requireSyncKey, (req, res) => {
  store.ledgers  = Array.isArray(req.body) ? req.body : [];
  store.lastSync = new Date().toISOString();
  res.json({ ok: true, count: store.ledgers.length });
});

app.post("/api/sync/sales-today", requireSyncKey, (req, res) => {
  store.salesToday = Array.isArray(req.body) ? req.body : [];
  store.lastSync   = new Date().toISOString();
  res.json({ ok: true, count: store.salesToday.length });
});

app.post("/api/sync/sales-monthly", requireSyncKey, (req, res) => {
  store.salesMonthly = req.body || { total: 0, vouchers: [] };
  store.lastSync     = new Date().toISOString();
  res.json({ ok: true });
});

app.post("/api/sync/stock", requireSyncKey, (req, res) => {
  store.stock    = Array.isArray(req.body) ? req.body : [];
  store.lastSync = new Date().toISOString();
  res.json({ ok: true, count: store.stock.length });
});

// Sync status — visible to any authenticated user
app.get("/api/sync/status", requireAuth, (req, res) => {
  res.json({
    lastSync: store.lastSync,
    counts: {
      ledgers:    store.ledgers.length,
      salesToday: store.salesToday.length,
      stock:      store.stock.length,
    },
  });
});

// ─── OWNER ENDPOINTS ─────────────────────────────────────────────────────────

app.get("/api/owner/dashboard", requireAuth, requireRole("owner"), (req, res) => {
  const outstanding = store.ledgers
    .filter(l => l.balance > 0)
    .reduce((sum, l) => sum + l.balance, 0);

  const overdueCount = store.ledgers.filter(l => l.balance > 0).length;

  const totalStock = store.stock.reduce((sum, s) => sum + (s.qty || 0), 0);

  const todaySales = store.salesToday.reduce((sum, v) => sum + v.amount, 0);

  res.json({
    todaySales:      Math.round(todaySales),
    monthlySales:    Math.round(store.salesMonthly.total),
    totalOutstanding: Math.round(outstanding),
    overdueCount,
    totalStockBags:  Math.round(totalStock),
    todayOrderCount: store.salesToday.length,
    lastSync:        store.lastSync,
  });
});

app.get("/api/owner/ledgers", requireAuth, requireRole("owner"), (req, res) => {
  res.json(store.ledgers);
});

app.get("/api/owner/sales", requireAuth, requireRole("owner"), (req, res) => {
  res.json(store.salesToday);
});

app.get("/api/owner/monthly-sales", requireAuth, requireRole("owner"), (req, res) => {
  res.json(store.salesMonthly);
});

app.get("/api/owner/stock", requireAuth, requireRole("owner"), (req, res) => {
  res.json(store.stock);
});

// ─── STAFF ENDPOINTS ─────────────────────────────────────────────────────────

app.get("/api/staff/tasks", requireAuth, requireRole("staff"), (req, res) => {
  res.json({
    deliveries:  store.salesToday,
    collections: store.ledgers.filter(l => l.balance > 0),
    lastSync:    store.lastSync,
  });
});

// ─── RETAILER ENDPOINTS ──────────────────────────────────────────────────────

app.get("/api/retailer/ledger", requireAuth, requireRole("retailer"), (req, res) => {
  const partyName  = req.user.partyName;
  const ledger     = store.ledgers.find(l => l.name === partyName);
  const myVouchers = store.salesToday.filter(v => v.party === partyName);

  res.json({
    partyName,
    balance:      ledger ? ledger.balance : 0,
    transactions: myVouchers,
    lastSync:     store.lastSync,
  });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()) });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nKanhaiya Traders API`);
  console.log(`====================`);
  console.log(`Running on http://localhost:${PORT}`);
  console.log(`Sync key: ${SYNC_API_KEY}`);
  console.log();
});
