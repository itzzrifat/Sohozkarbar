import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db, initDatabase, resetAllLicenses, DB_PATH } from './db.js';
import { setupSyncHub, broadcastToTenant, getOnlineStats } from './sync_hub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Schema
initDatabase();

const app = express();
const server = http.createServer(app);

// Mount WebSocket Live Sync
setupSyncHub(server);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve Frontend Static Web Files (Landing page, ERP, Admin, Workstation, etc.)
const publicDir = path.resolve(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  console.log(`[Static] Serving public web directory from: ${publicDir}`);
}

// Master Admin Security Key
const MASTER_ADMIN_KEY = process.env.MASTER_ADMIN_KEY || 'SK-MASTER-BOSS-RIFAT-2026';

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-key'] || req.query.adminKey;
  if (!token || token !== MASTER_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid master admin key.' });
  }
  next();
}

// ==========================================
// 1. HEALTH & GENERAL STATUS
// ==========================================
app.get('/health', (req, res) => {
  const stats = getOnlineStats();
  const licCount = db.prepare('SELECT COUNT(*) as count FROM licenses').get();
  const recCount = db.prepare('SELECT COUNT(*) as count FROM tenant_records').get();

  res.json({
    status: 'healthy',
    server: 'SohozKarbar Central Engine',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    database: 'SQLite (WAL Mode)',
    stats: {
      totalLicenses: licCount.count,
      totalStoredRecords: recCount.count,
      onlineConnections: stats.totalOnlineSockets,
      activeTenantsOnline: stats.activeTenantsCount
    }
  });
});

// ==========================================
// 2. PUBLIC TRIAL REGISTRATION (3-DAY EXPIRY)
// ==========================================
app.post('/api/trial/register', (req, res) => {
  try {
    const { name, phone, business, email, device_fp } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
    }

    const cleanFp = String(device_fp || '').trim();

    // Anti-Abuse Check: Has this device already registered a trial?
    if (cleanFp) {
      const existing = db.prepare('SELECT * FROM trial_leads WHERE device_fp = ? LIMIT 1').get(cleanFp);
      if (existing) {
        // Return existing trial license if not expired
        const lic = db.prepare('SELECT * FROM licenses WHERE key = ? LIMIT 1').get(existing.license_key);
        if (lic) {
          return res.json({
            ok: true,
            isExisting: true,
            key: lic.key,
            customerName: lic.customer_name,
            businessName: lic.business_name,
            expiresAt: lic.expires_at,
            message: 'Existing trial license restored for this device.'
          });
        }
      }
    }

    // Generate unique 3-day trial key
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const newKey = `SK-TRIA-${block()}-${block()}-${block()}`;
    const tenantId = `tenant-${block().toLowerCase()}-${block().toLowerCase()}`;
    const now = Date.now();
    const expiresAt = now + 3 * 24 * 60 * 60 * 1000; // Exact 3 days

    // Insert license
    const insLic = db.prepare(`
      INSERT INTO licenses (
        key, id, customer_name, business_name, tenant_id,
        license_type, plan, trial_days, max_devices, expires_at,
        status, mobile, email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insLic.run(
      newKey,
      `lic_${Date.now()}_${block()}`,
      name.trim(),
      business ? business.trim() : 'Retail Shop',
      tenantId,
      'trial',
      'trial-3d',
      3,
      1,
      expiresAt,
      'active',
      phone.trim(),
      email ? email.trim() : '',
      now,
      now
    );

    // Record lead
    const insLead = db.prepare(`
      INSERT INTO trial_leads (name, phone, business, email, license_key, device_fp, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insLead.run(name.trim(), phone.trim(), business || '', email || '', newKey, cleanFp, clientIp, now);

    console.log(`[Trial] New 3-day trial issued: ${newKey} for ${name} (${phone})`);

    res.json({
      ok: true,
      key: newKey,
      tenantId,
      customerName: name,
      businessName: business || 'Shop',
      expiresAt,
      trialDays: 3,
      message: '🎉 3-day trial license created successfully!'
    });

  } catch (err) {
    console.error('[Trial Error]', err);
    res.status(500).json({ error: 'Failed to issue trial key: ' + err.message });
  }
});

// ==========================================
// 3. TENANT DATA CRUD (Match FirebaseService)
// ==========================================

// Middleware: Validate tenant & license active status
function requireValidTenant(req, res, next) {
  const { tenantId } = req.params;
  const lic = db.prepare('SELECT * FROM licenses WHERE tenant_id = ? OR key = ? LIMIT 1').get(tenantId, tenantId);

  if (!lic) {
    return res.status(404).json({ error: 'License or Tenant not found.' });
  }

  if (lic.status === 'blocked') {
    return res.status(403).json({ error: 'License is blocked by administrator.' });
  }

  const now = Date.now();
  if (lic.expires_at && lic.expires_at > 0 && lic.expires_at < now) {
    return res.status(403).json({ error: 'License has expired. Please contact Rifat Uddin to renew.' });
  }

  req.license = lic;
  req.cleanTenantId = lic.tenant_id;
  next();
}

// GET all docs in a collection
app.get('/api/tenants/:tenantId/:collection', requireValidTenant, (req, res) => {
  try {
    const { collection } = req.params;
    const rows = db.prepare(`
      SELECT doc_id, data, updated_at FROM tenant_records
      WHERE tenant_id = ? AND collection_name = ?
    `).all(req.cleanTenantId, collection);

    const result = rows.map(r => {
      try {
        const parsed = JSON.parse(r.data);
        return { id: r.doc_id, ...parsed };
      } catch (e) {
        return { id: r.doc_id, raw: r.data };
      }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single doc
app.get('/api/tenants/:tenantId/:collection/:id', requireValidTenant, (req, res) => {
  try {
    const { collection, id } = req.params;
    const row = db.prepare(`
      SELECT doc_id, data FROM tenant_records
      WHERE tenant_id = ? AND collection_name = ? AND doc_id = ?
    `).get(req.cleanTenantId, collection, id);

    if (!row) return res.status(404).json({ error: 'Document not found' });
    const data = JSON.parse(row.data);
    res.json({ id: row.doc_id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / PUT document
app.post('/api/tenants/:tenantId/:collection', requireValidTenant, (req, res) => {
  try {
    const { collection } = req.params;
    const docData = req.body;
    const docId = String(docData.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const now = Date.now();

    const payload = { ...docData, id: docId, updatedAt: now };
    const rawData = JSON.stringify(payload);

    db.prepare(`
      INSERT INTO tenant_records (tenant_id, collection_name, doc_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, collection_name, doc_id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(req.cleanTenantId, collection, docId, rawData, now, now);

    // Live broadcast to all users in this tenant's room
    broadcastToTenant(req.cleanTenantId, {
      type: 'SYNC',
      collection,
      docId,
      action: 'set',
      data: payload,
      timestamp: now
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tenants/:tenantId/:collection/:id', requireValidTenant, (req, res) => {
  try {
    const { collection, id } = req.params;
    const docData = req.body;
    const now = Date.now();

    const payload = { ...docData, id, updatedAt: now };
    const rawData = JSON.stringify(payload);

    db.prepare(`
      INSERT INTO tenant_records (tenant_id, collection_name, doc_id, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, collection_name, doc_id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(req.cleanTenantId, collection, id, rawData, now, now);

    broadcastToTenant(req.cleanTenantId, {
      type: 'SYNC',
      collection,
      docId: id,
      action: 'update',
      data: payload,
      timestamp: now
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE document
app.delete('/api/tenants/:tenantId/:collection/:id', requireValidTenant, (req, res) => {
  try {
    const { collection, id } = req.params;
    db.prepare(`
      DELETE FROM tenant_records
      WHERE tenant_id = ? AND collection_name = ? AND doc_id = ?
    `).run(req.cleanTenantId, collection, id);

    broadcastToTenant(req.cleanTenantId, {
      type: 'SYNC',
      collection,
      docId: id,
      action: 'remove',
      timestamp: Date.now()
    });

    res.json({ ok: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. MASTER ADMIN API (Rifat Master Control)
// ==========================================

// List all licenses with device count & expiry
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
  try {
    const licenses = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
    const result = licenses.map(l => {
      const devs = db.prepare('SELECT * FROM tenant_devices WHERE tenant_id = ?').all(l.tenant_id);
      return {
        ...l,
        devices: devs,
        activeDeviceCount: devs.length
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new license
app.post('/api/admin/licenses', requireAdmin, (req, res) => {
  try {
    const { customerName, businessName, maxDevices, validityDays, plan, notes, mobile, email, customKey } = req.body;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const key = customKey ? customKey.toUpperCase() : `SK-STD-${block()}-${block()}-${block()}`;
    const tenantId = `tenant-${block().toLowerCase()}-${block().toLowerCase()}`;
    const now = Date.now();
    const days = Number(validityDays);
    const expiresAt = days === -1 ? null : (now + days * 86400000);

    const stmt = db.prepare(`
      INSERT INTO licenses (
        key, id, customer_name, business_name, tenant_id,
        license_type, plan, trial_days, max_devices, expires_at,
        status, mobile, email, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      key,
      `lic_${Date.now()}_${block()}`,
      customerName || 'Standard Client',
      businessName || 'Business Shop',
      tenantId,
      'standard',
      plan || 'pro',
      0,
      Number(maxDevices || 5),
      expiresAt,
      'active',
      mobile || '',
      email || '',
      notes || '',
      now,
      now
    );

    res.json({ ok: true, key, tenantId, customerName, expiresAt, maxDevices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update / Extend / Block License
app.put('/api/admin/licenses/:key', requireAdmin, (req, res) => {
  try {
    const { key } = req.params;
    const updates = req.body;
    const lic = db.prepare('SELECT * FROM licenses WHERE key = ? OR id = ?').get(key, key);

    if (!lic) return res.status(404).json({ error: 'License not found' });

    const newStatus = updates.status !== undefined ? updates.status : lic.status;
    const newExpiresAt = updates.expiresAt !== undefined ? updates.expiresAt : lic.expires_at;
    const newMaxDevices = updates.maxDevices !== undefined ? Number(updates.maxDevices) : lic.max_devices;
    const newNotes = updates.notes !== undefined ? updates.notes : lic.notes;

    db.prepare(`
      UPDATE licenses SET
        status = ?,
        expires_at = ?,
        max_devices = ?,
        notes = ?,
        updated_at = ?
      WHERE key = ?
    `).run(newStatus, newExpiresAt, newMaxDevices, newNotes, Date.now(), lic.key);

    res.json({ ok: true, message: 'License updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Devices
app.post('/api/admin/licenses/:key/reset-devices', requireAdmin, (req, res) => {
  try {
    const { key } = req.params;
    const lic = db.prepare('SELECT tenant_id FROM licenses WHERE key = ? OR id = ?').get(key, key);
    if (!lic) return res.status(404).json({ error: 'License not found' });

    db.prepare('DELETE FROM tenant_devices WHERE tenant_id = ?').run(lic.tenant_id);
    res.json({ ok: true, message: `Devices reset for tenant [${lic.tenant_id}].` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Master SQLite Backup Download (.db file)
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  try {
    // Flush WAL checkpoint to ensure all data is in the primary db file
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) { console.error('WAL checkpoint err:', e); }
    const dbFile = DB_PATH;
    if (!fs.existsSync(dbFile)) {
      return res.status(404).json({ error: `Database file not found at ${dbFile}` });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.download(dbFile, `sohozkarbar_master_backup_${timestamp}.db`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full Master JSON Data Export Backup
app.get('/api/admin/backup-json', requireAdmin, (req, res) => {
  try {
    const licenses = db.prepare('SELECT * FROM licenses').all();
    const devices = db.prepare('SELECT * FROM tenant_devices').all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500').all();
    const tenantData = db.prepare('SELECT tenant_id, data_key, updated_at FROM tenant_data').all();
    
    const dump = {
      export_date: new Date().toISOString(),
      system: 'SohozKarbar Master Cloud ERP Hub',
      total_licenses: licenses.length,
      total_devices: devices.length,
      licenses,
      devices,
      tenantData,
      auditLogs
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=sohozkarbar_backup_${Date.now()}.json`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Master Reset All Licenses (Preserves Founder Master License)
app.all('/api/admin/reset-licenses', requireAdmin, (req, res) => {
  try {
    resetAllLicenses();
    res.json({
      success: true,
      message: 'All licenses reset successfully. Only Founder Master Lifetime License remains active.',
      founderLicense: {
        key: 'SK-RIFAT-BOSS-2209-1996',
        owner: 'Rifat Uddin',
        plan: 'founder_unlimited',
        maxDevices: 'Unlimited',
        validity: 'Lifetime'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STATIC FRONTEND ROUTE FALLBACKS
// ==========================================
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/health')) {
    return next();
  }
  const publicDir = path.resolve(__dirname, 'public');
  if (req.path === '/workstation' || req.path === '/workstation/') {
    const wsIndex = path.join(publicDir, 'workstation', 'index.html');
    if (fs.existsSync(wsIndex)) return res.sendFile(wsIndex);
  }
  const filePath = path.join(publicDir, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  const htmlPath = path.join(publicDir, req.path + '.html');
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
  =======================================================
  🚀 SOHOZKARBAR ERP CENTRAL MULTI-TENANT SERVER STARTED
  -------------------------------------------------------
  🌐 HTTP API:       http://localhost:${PORT}
  ⚡ WebSocket Sync:  ws://localhost:${PORT}/ws
  📊 Health Check:   http://localhost:${PORT}/health
  🛡️ Master Admin:   X-Admin-Key: ${MASTER_ADMIN_KEY}
  💾 Database:       SQLite WAL (sohozkarbar_master.db)
  =======================================================
  `);
});
