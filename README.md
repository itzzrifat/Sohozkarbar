# SohozKarbar ERP Central Server — Multi-Tenant Cloud Architecture

**Owner & Creator:** Rifat Uddin (Founder of Sohoz Karbar Tech Solutions & Creator of SohozKarbar ERP)  
**Architecture:** Node.js + Express + WebSocket Live Sync (`ws`) + SQLite (WAL Mode)

---

## 🌟 Key Capabilities
1. **100% Founder Owned & Controlled:** Zero reliance on Google Firebase for database operations. Zero unexpected cloud bills.
2. **Infinite Scaling with $0 Cost:** SQLite Write-Ahead Logging (WAL) handles 50,000+ operations/sec without per-read or per-write meter billing.
3. **Multi-Tenant Room Isolation:** 1 License Key = 1 Dedicated Company Room. Multiple users (8–20 staff) in the same company see live updates in real time (<50ms). Companies cannot see each other's data.
4. **Automated 3-Day Free Trial:** Generates unique trial keys (`SK-TRIA-XXXX-XXXX-XXXX`) with strict 3-day expiration and hardware anti-abuse detection.
5. **Master Admin Control:** Full administrative REST API with secret key authentication to create licenses, extend validity, reset device limits, and download full database backups.

---

## 🚀 How to Run

### Option A: Windows (Local / Office PC)
Simply double click `start_server.bat` or run in terminal:
```powershell
node server.js
```
The server will boot up at:
* **HTTP API:** `http://localhost:3001`
* **WebSocket Sync:** `ws://localhost:3001/ws`
* **Health Check:** `http://localhost:3001/health`

### Option B: Cloud VPS (Oracle Cloud Always Free / DigitalOcean / Ubuntu)
On any standard Linux VPS:
```bash
git clone / copy files to VPS
cd sohozkarbar_central_server
npm install --production
npm install -g pm2
pm2 start server.js --name sohoz-central
pm2 save
pm2 startup
```

---

## 📁 File Structure
```
sohozkarbar_central_server/
├── db.js                 # SQLite engine with WAL mode & table schemas
├── sync_hub.js           # WebSocket Live Sync hub (multi-tenant rooms)
├── server.js             # Express REST API + Master Admin + Trial endpoints
├── test_suite.js         # Automated end-to-end test suite
├── start_server.bat      # 1-click Windows launcher
├── backup_db.ps1         # 1-click timestamped database backup
├── sohozkarbar_master.db # Master centralized SQLite database
└── backups/              # Automated database snapshots
```

---

## 🛡️ Master Admin API Reference
Include header: `X-Admin-Key: SK-MASTER-BOSS-RIFAT-2026`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server uptime, tenant count & connection statistics |
| `GET` | `/api/admin/licenses` | List all client licenses, active devices & expiration |
| `POST` | `/api/admin/licenses` | Create new paid license (custom validity, max devices) |
| `PUT` | `/api/admin/licenses/:key` | Extend validity, block/unblock, adjust max devices |
| `POST` | `/api/admin/licenses/:key/reset-devices` | Reset active device registrations |
| `GET` | `/api/admin/backup` | Download raw `sohozkarbar_master.db` backup file |

---

## ⚡ Client Integration
In `01_Web_and_ERP_Source/sohozkarbar_central_adapter.js`:
This adapter connects your ERP frontends (`erp.html`, `admin.html`, `trial.html`) to your Central Server over WebSockets and REST API.
