import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'sohozkarbar_master.db');
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
      custom_slug TEXT,
      customer_username TEXT,
      customer_password TEXT,
      allowed_modules TEXT DEFAULT '["pos","sales","stock","due","reports"]',
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

  // Safely ensure new columns exist for existing databases
  const existingCols = db.prepare('PRAGMA table_info(licenses)').all().map(c => c.name);
  if (!existingCols.includes('custom_slug')) {
    try { db.exec('ALTER TABLE licenses ADD COLUMN custom_slug TEXT;'); } catch (e) {}
  }
  if (!existingCols.includes('customer_username')) {
    try { db.exec('ALTER TABLE licenses ADD COLUMN customer_username TEXT;'); } catch (e) {}
  }
  if (!existingCols.includes('customer_password')) {
    try { db.exec('ALTER TABLE licenses ADD COLUMN customer_password TEXT;'); } catch (e) {}
  }
  if (!existingCols.includes('allowed_modules')) {
    try { db.exec('ALTER TABLE licenses ADD COLUMN allowed_modules TEXT DEFAULT \'["pos","sales","stock","due","reports"]\';'); } catch (e) {}
  }

  // Ensure index on custom_slug & customer_username
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_slug ON licenses(custom_slug) WHERE custom_slug IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_username ON licenses(customer_username) WHERE customer_username IS NOT NULL;
    `);
  } catch (e) {}

  // 1.5 Tenant Staff Users (Created from PC Desktop Software with mobile toggle)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_staff_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT,
      pin TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      can_access_mobile INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_staff_tenant ON tenant_staff_users(tenant_id);
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

  // Seed / Ensure Founder Master Lifetime License exists
  const founderKey = 'SK-RIFAT-BOSS-2209-1996';
  const existingFounder = db.prepare('SELECT key FROM licenses WHERE key = ?').get(founderKey);
  if (!existingFounder) {
    db.prepare(`
      INSERT INTO licenses (
        key, id, customer_name, business_name, tenant_id,
        license_type, plan, trial_days, max_devices, expires_at,
        status, mobile, email, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      founderKey,
      'lic_rifat_founder_master',
      'Rifat Uddin',
      'Sohoz Karbar Tech Solutions',
      'tenant_rifat_boss',
      'master_lifetime',
      'founder_unlimited',
      0,
      999999, // Unlimited devices
      4102444799000, // Year 2100 - Lifetime
      'active',
      '+8801625914562',
      'rifat4440@gmail.com',
      'Official Founder Master Lifetime License — Unlimited Devices & Full SaaS Capability',
      Date.now(),
      Date.now()
    );
    console.log(`[Database] 👑 Founder Master Lifetime License seeded: ${founderKey}`);
  }
}

export function resetAllLicenses() {
  db.exec('DELETE FROM tenant_devices;');
  db.exec('DELETE FROM tenant_records;');
  db.exec('DELETE FROM trial_leads;');
  db.prepare('DELETE FROM licenses WHERE key != ?').run('SK-RIFAT-BOSS-2209-1996');
  console.log('[Database] 🧹 All licenses reset. Founder Master License preserved.');
}
