import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db.js';

// Map of tenantId -> Set of client WebSocket connections
const tenantRooms = new Map();

export function setupSyncHub(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.tenantId = null;
    ws.hardwareId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error('[WebSocket] Invalid JSON message received:', err);
      }
    });

    ws.on('close', () => {
      leaveTenantRoom(ws);
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket] Connection error:', err.message);
      leaveTenantRoom(ws);
    });
  });

  // Heartbeat ping every 30 seconds
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        leaveTenantRoom(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  console.log('[SyncHub] WebSocket Live Sync engine mounted at /ws');
  return { wss, broadcastToTenant };
}

function handleClientMessage(ws, msg) {
  const { type, tenantId, licenseKey, hardwareId, ip, city, country, collection, docId, action, data } = msg;

  if (type === 'JOIN') {
    // 1. Verify License & Expiry
    if (!licenseKey && !tenantId) {
      return sendToClient(ws, { type: 'ERROR', code: 'MISSING_KEY', message: 'License key or tenantId required.' });
    }

    const stmt = db.prepare('SELECT * FROM licenses WHERE key = ? OR tenant_id = ? LIMIT 1');
    const license = stmt.get(licenseKey || '', tenantId || '');

    if (!license) {
      return sendToClient(ws, { type: 'ERROR', code: 'INVALID_LICENSE', message: 'License not found or invalid.' });
    }

    if (license.status === 'blocked') {
      return sendToClient(ws, { type: 'ERROR', code: 'LICENSE_BLOCKED', message: 'License has been blocked by administrator.' });
    }

    const now = Date.now();
    if (license.expires_at && license.expires_at > 0 && license.expires_at < now) {
      return sendToClient(ws, {
        type: 'ERROR',
        code: 'LICENSE_EXPIRED',
        message: 'License has expired. Please contact Rifat Uddin (+8801625914562) to renew.'
      });
    }

    // 2. Track & Verify Device
    const cleanTenantId = license.tenant_id;
    const cleanHwId = String(hardwareId || 'unknown_device');

    // Check device count
    const devStmt = db.prepare('SELECT hardware_id FROM tenant_devices WHERE tenant_id = ?');
    const existingDevices = devStmt.all(cleanTenantId).map(d => d.hardware_id);

    if (!existingDevices.includes(cleanHwId) && existingDevices.length >= (license.max_devices || 1)) {
      return sendToClient(ws, {
        type: 'ERROR',
        code: 'DEVICE_LIMIT_REACHED',
        message: `Device limit (${existingDevices.length}/${license.max_devices}) reached for this license.`
      });
    }

    // Register/update device
    const upsertDev = db.prepare(`
      INSERT INTO tenant_devices (tenant_id, hardware_id, ip, city, country, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, hardware_id) DO UPDATE SET
        ip = excluded.ip,
        city = excluded.city,
        country = excluded.country,
        last_seen = excluded.last_seen
    `);
    upsertDev.run(cleanTenantId, cleanHwId, ip || '', city || '', country || '', now);

    // Join room
    joinTenantRoom(ws, cleanTenantId, cleanHwId);

    sendToClient(ws, {
      type: 'JOINED',
      tenantId: cleanTenantId,
      customerName: license.customer_name,
      businessName: license.business_name,
      licenseType: license.license_type,
      expiresAt: license.expires_at,
      status: license.status,
      activeDevices: existingDevices.length + (existingDevices.includes(cleanHwId) ? 0 : 1),
      maxDevices: license.max_devices
    });

    console.log(`[SyncHub] Client joined room [${cleanTenantId}] (HW: ${cleanHwId})`);
  }

  // Real-time Mutation from client
  if (type === 'MUTATE' && ws.tenantId) {
    if (!collection || !docId || !action) return;

    const cleanData = typeof data === 'object' ? JSON.stringify(data) : String(data || '{}');
    const now = Date.now();

    if (action === 'set' || action === 'add' || action === 'update') {
      const stmt = db.prepare(`
        INSERT INTO tenant_records (tenant_id, collection_name, doc_id, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, collection_name, doc_id) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at
      `);
      stmt.run(ws.tenantId, collection, docId, cleanData, now, now);
    } else if (action === 'remove' || action === 'delete') {
      const stmt = db.prepare('DELETE FROM tenant_records WHERE tenant_id = ? AND collection_name = ? AND doc_id = ?');
      stmt.run(ws.tenantId, collection, docId);
    }

    // Broadcast change to all peers in the tenant room (Shop Cashiers, Managers, etc.)
    broadcastToTenant(ws.tenantId, {
      type: 'SYNC',
      collection,
      docId,
      action,
      data: typeof data === 'string' ? JSON.parse(data) : data,
      timestamp: now
    }, ws);
  }
}

function joinTenantRoom(ws, tenantId, hardwareId) {
  leaveTenantRoom(ws);
  ws.tenantId = tenantId;
  ws.hardwareId = hardwareId;

  if (!tenantRooms.has(tenantId)) {
    tenantRooms.set(tenantId, new Set());
  }
  tenantRooms.get(tenantId).add(ws);
}

function leaveTenantRoom(ws) {
  if (ws.tenantId && tenantRooms.has(ws.tenantId)) {
    const room = tenantRooms.get(ws.tenantId);
    room.delete(ws);
    if (room.size === 0) {
      tenantRooms.delete(ws.tenantId);
    }
  }
  ws.tenantId = null;
}

export function broadcastToTenant(tenantId, payload, excludeWs = null) {
  if (!tenantRooms.has(tenantId)) return;
  const room = tenantRooms.get(tenantId);
  const msg = JSON.stringify(payload);

  for (const client of room) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function getOnlineStats() {
  let totalOnlineSockets = 0;
  const activeTenants = [];

  for (const [tenantId, sockets] of tenantRooms.entries()) {
    totalOnlineSockets += sockets.size;
    activeTenants.push({ tenantId, usersCount: sockets.size });
  }

  return { totalOnlineSockets, activeTenantsCount: tenantRooms.size, activeTenants };
}
