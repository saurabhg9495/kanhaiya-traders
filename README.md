# Kanhaiya Traders App — Setup Guide

A mobile app for cement wholesale business with Tally Prime integration.

---

## Project Structure

```
kanhaiya-traders/
├── sync-agent/
│   ├── tally_sync.py       ← Runs on your office PC (reads Tally)
│   └── requirements.txt
├── backend/
│   ├── server.js           ← Deploy to cloud (Railway / Render)
│   └── package.json
└── frontend/               ← React Native / Expo app
    (built separately using the app design)
```

---

## Step 1 — Deploy the Backend API

### Option A: Railway (Recommended, free tier available)
1. Go to https://railway.app and sign up
2. Click "New Project" → "Deploy from GitHub"
3. Upload the `backend/` folder
4. Set these environment variables in Railway dashboard:
   ```
   JWT_SECRET    = any-long-random-string-here
   SYNC_API_KEY  = another-long-random-string-here
   PORT          = 3000
   ```
5. Copy your Railway deployment URL (e.g. `https://kanhaiya-traders.up.railway.app`)

### Option B: Render (Also free)
1. Go to https://render.com
2. New → Web Service → connect your repo
3. Set the same environment variables as above

---

## Step 2 — Configure the Sync Agent

Edit `sync-agent/tally_sync.py` and update these lines at the top:

```python
TALLY_URL  = "http://localhost:9000"           # Keep this as-is
API_URL    = "https://your-railway-url.com"    # ← Paste your Railway URL here
API_KEY    = "another-long-random-string-here" # ← Must match SYNC_API_KEY in Railway
```

### Enable Tally HTTP Server
In Tally Prime on your PC:
1. Press `F12` (Configure)
2. Go to **Advanced Configuration**
3. Enable **ODBC Server** → set port to `9000`
4. Press `Ctrl+A` to save

### Run the Sync Agent
```bash
cd sync-agent
pip install -r requirements.txt
python tally_sync.py
```

Keep this terminal open while working. It will sync every 15 minutes automatically.

To run it in the background (Windows):
```
pythonw tally_sync.py
```

---

## Step 3 — Add Your Users

Edit `backend/server.js` to add your actual staff and retailer accounts:

```javascript
const users = [
  // Owner
  { id: 1, name: "Kanhaiya Ji", phone: "YOUR_PHONE", pin: "YOUR_PIN", role: "owner" },

  // Staff members
  { id: 2, name: "Ramesh Kumar", phone: "STAFF_PHONE", pin: "STAFF_PIN", role: "staff" },

  // Retailers — partyName must match EXACTLY how it appears in Tally
  { id: 3, name: "Sharma Traders", code: "ST001", pin: "1111",
    role: "retailer", partyName: "Sharma Traders" },
  { id: 4, name: "Gupta Hardware", code: "GH002", pin: "2222",
    role: "retailer", partyName: "Gupta Hardware" },
  // Add more retailers...
];
```

---

## API Endpoints Reference

### Auth
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/login` | `{phone, pin, role}` or `{code, pin, role:"retailer"}` |

### Owner (requires JWT)
| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/owner/dashboard` | Sales, outstanding, stock summary |
| GET | `/api/owner/ledgers` | All retailer ledger balances |
| GET | `/api/owner/sales` | Today's sales vouchers |
| GET | `/api/owner/stock` | Stock item list |

### Staff (requires JWT)
| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/staff/tasks` | Today's deliveries + collections |

### Retailer (requires JWT)
| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/retailer/ledger` | Own balance + transactions |

### Sync (requires X-API-Key header)
| Method | Endpoint | Called by |
|--------|----------|-----------|
| POST | `/api/sync/ledgers` | tally_sync.py |
| POST | `/api/sync/sales-today` | tally_sync.py |
| POST | `/api/sync/sales-monthly` | tally_sync.py |
| POST | `/api/sync/stock` | tally_sync.py |
| GET | `/api/sync/status` | Mobile app |

---

## Tally Data Mapping

| App Feature | Tally Source |
|-------------|-------------|
| Outstanding dues | Sundry Debtors ledger closing balance |
| Today's sales | Sales vouchers for today |
| Monthly sales | Sales vouchers for current month |
| Stock / bags | Stock item closing quantity |
| Retailer name | Must match Tally ledger name exactly |

---

## Troubleshooting

**"Cannot connect to Tally"**
→ Make sure Tally Prime is open on your PC
→ Enable ODBC/HTTP server in Tally F12 settings
→ Try visiting http://localhost:9000 in your browser — you should see Tally's response

**"Invalid API key"**
→ Check that SYNC_API_KEY in Railway matches API_KEY in tally_sync.py

**"Party not found in ledger"**
→ The partyName in users[] must match the Tally ledger name character-for-character

**Sync showing 0 records**
→ Make sure the active company in Tally has vouchers for today
→ Check that Sundry Debtors group exists in your Chart of Accounts

---

## Next Steps (to make it production-ready)

1. Replace in-memory store with a database (MongoDB Atlas — free tier)
2. Hash PINs with bcrypt instead of storing plaintext
3. Build the React Native / Expo frontend using the app design
4. Add WhatsApp integration for payment reminders (Twilio API)
5. Add push notifications for new orders (Firebase Cloud Messaging)

---

Built for Kanhaiya Traders, Faizabad, UP.
