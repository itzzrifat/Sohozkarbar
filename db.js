import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'sohozkarbar_master.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode (Write-Ahead Logging) for high-performance concurrent reads & writes
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');

console.log(`[Database] SQLite connected at ${DB_PATH} (WAL mode enabled)`);

export function initDatabase() {
  // 1. Licenses Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      key TEXT PRIMARY KEY,
      id TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      business_name TEXT,
      tenant_id TEXT UNIQUE NOT NULL,
      license_type TEXT DEFAULT 'standard',
      plan TEXT DEFAULT 'standard',
      trial_days INTEGER DEFAULT 3,
      max_devices INTEGER DEFAULT 1,
      expires_at INTEGER,
      status TEXT DEFAULT 'active',
      mobile TEXT,
      email TEXT,
      notes TEXT,
      firebase_config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
  `);

  // 2. Tenant Registered Devices Table (Enforces maxDevices & tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      hardware_id TEXT NOT NULL,
      ip TEXT,
      city TEXT,
      country TEXT,
      last_seen INTEGER NOT NULL,
      UNIQUE(tenant_id, hardware_id)
    );
    CREATE INDEX IF NOT EXISTS idx_devices_tenant ON tenant_devices(tenant_id);
  `);

  // 3. Multi-Tenant Records Table (All ERP Collections: products, sales, customers, counters, nxsettings, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_records (
      tenant_id TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, collection_name, doc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_lookup ON tenant_records(tenant_id, collection_name);
  `);

  // 4. Trial Leads Table (Prevents multi-trial abuse per device & logs leads)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trial_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      business TEXT,
      email TEXT,
      license_key TEXT NOT NULL,
      device_fp TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trial_fp ON trial_leads(device_fp);
  `);

  // 5. Admin Audit Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  console.log('[Database] All core tables and indexes initialized successfully.');
}
