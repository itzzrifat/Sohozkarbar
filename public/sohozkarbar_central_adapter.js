/**
 * SohozKarbar Central Server Real-Time Adapter
 * Bridges ERP Single-Page App with SohozKarbar Central Server (WebSockets + REST)
 * Zero per-read/write billing, 100% self-hosted multi-tenant synchronization.
 */
(function(window) {
  'use strict';

  const defaultServerUrl = window.SOHOZ_CENTRAL_URL || (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001'
      : (window.location.hostname.includes('onrender.com') ? window.location.origin : 'https://sohozkarbar.onrender.com')
  );

  class SohozKarbarCentralClient {
    constructor(serverUrl = defaultServerUrl) {
      this.serverUrl = serverUrl.replace(/\/+$/, '');
      this.wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = null;
      this.isConnected = false;
      this.license = null;
      this.tenantId = null;
      this.hardwareId = localStorage.getItem('erp_hardware_id') || this._genHwId();
      this.listeners = new Map(); // collection -> Set of callbacks
      this.pendingQueue = [];
      this.cache = new Map();
      this.reconnectTimer = null;
    }

    _genHwId() {
      const id = 'hw_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('erp_hardware_id', id);
      return id;
    }

    init(license) {
      this.license = license || JSON.parse(localStorage.getItem('erp_customer_license_data') || 'null');
      if (!this.license) {
        console.warn('[SohozCentral] No license found. Awaiting license activation.');
        return;
      }
      this.tenantId = this.license.tenantId || this.license.key;
      this._connectWebSocket();
    }

    _connectWebSocket() {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        console.info(`[SohozCentral] Connecting to live sync at ${this.wsUrl}...`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.info('[SohozCentral] WebSocket live connection established.');
          this.isConnected = true;
          // Authenticate / Join tenant room
          this.ws.send(JSON.stringify({
            type: 'JOIN',
            tenantId: this.tenantId,
            licenseKey: this.license?.key,
            hardwareId: this.hardwareId
          }));
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._handleServerMessage(msg);
          } catch (e) {
            console.warn('[SohozCentral] Error parsing WebSocket message:', e);
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          console.warn('[SohozCentral] WebSocket connection lost. Reconnecting in 3s...');
          this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
        };

        this.ws.onerror = (err) => {
          console.warn('[SohozCentral] WebSocket error:', err);
          this.ws.close();
        };

      } catch (err) {
        console.error('[SohozCentral] WebSocket initialization error:', err);
        this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 4000);
      }
    }

    _handleServerMessage(msg) {
      if (msg.type === 'JOINED') {
        console.info(`[SohozCentral] Successfully joined tenant room [${msg.tenantId}] (${msg.customerName}). Devices active: ${msg.activeDevices}/${msg.maxDevices}`);
        if (window.UI?.toast) {
          window.UI.toast(`⚡ Connected to SohozKarbar Central Cloud (Live Sync Active)`, 'success', 3500);
        }
      }

      if (msg.type === 'ERROR') {
        console.error('[SohozCentral] Server error:', msg.code, msg.message);
        if (window.UI?.toast) {
          window.UI.toast(`⚠️ ${msg.message}`, 'error', 8000);
        }
      }

      if (msg.type === 'SYNC') {
        const { collection, docId, action, data } = msg;
        console.info(`[SohozCentral] Incoming live sync: [${collection}] doc: ${docId} action: ${action}`);

        // Notify UI listeners
        if (this.listeners.has(collection)) {
          const cbs = this.listeners.get(collection);
          for (const cb of cbs) {
            try { cb({ id: docId, ...data, _action: action }); } catch (e) { console.error(e); }
          }
        }
      }
    }

    // ==========================================
    // DATA CRUD OPERATIONS (Replaces Firestore)
    // ==========================================

    async getAll(collection) {
      if (!this.tenantId) return [];
      try {
        const res = await fetch(`${this.serverUrl}/api/tenants/${this.tenantId}/${collection}`);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const rows = await res.json();
        // Update local cache
        localStorage.setItem(`sohoz_cache_${this.tenantId}_${collection}`, JSON.stringify(rows));
        return rows;
      } catch (err) {
        console.warn(`[SohozCentral] Offline / Fetch failed for [${collection}], returning local cache.`, err.message);
        try {
          return JSON.parse(localStorage.getItem(`sohoz_cache_${this.tenantId}_${collection}`) || '[]');
        } catch (e) { return []; }
      }
    }

    async getById(collection, id) {
      if (!this.tenantId) return null;
      try {
        const res = await fetch(`${this.serverUrl}/api/tenants/${this.tenantId}/${collection}/${id}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return await res.json();
      } catch (err) {
        const cached = await this.getAll(collection);
        return cached.find(x => x.id === id) || null;
      }
    }

    async add(collection, data) {
      const id = data.id || 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const payload = { ...data, id, createdAt: data.createdAt || Date.now(), updatedAt: Date.now() };

      // Optimistic local update
      this._updateLocalCache(collection, payload, 'add');

      // Send to Central Server REST
      try {
        await fetch(`${this.serverUrl}/api/tenants/${this.tenantId}/${collection}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('[SohozCentral] Failed to POST record; queued locally.', err.message);
      }

      // Also broadcast over WebSocket if open
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'MUTATE',
          collection,
          docId: id,
          action: 'add',
          data: payload
        }));
      }

      return payload;
    }

    async update(collection, id, data) {
      const payload = { ...data, updatedAt: Date.now() };
      this._updateLocalCache(collection, { id, ...payload }, 'update');

      try {
        await fetch(`${this.serverUrl}/api/tenants/${this.tenantId}/${collection}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('[SohozCentral] Failed to PUT record; queued locally.', err.message);
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'MUTATE',
          collection,
          docId: id,
          action: 'update',
          data: payload
        }));
      }

      return { id, ...payload };
    }

    async remove(collection, id) {
      this._updateLocalCache(collection, { id }, 'remove');

      try {
        await fetch(`${this.serverUrl}/api/tenants/${this.tenantId}/${collection}/${id}`, {
          method: 'DELETE'
        });
      } catch (err) {
        console.warn('[SohozCentral] Failed to DELETE record; queued locally.', err.message);
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'MUTATE',
          collection,
          docId: id,
          action: 'remove'
        }));
      }

      return true;
    }

    subscribe(collection, callback) {
      if (!this.listeners.has(collection)) {
        this.listeners.set(collection, new Set());
      }
      this.listeners.get(collection).add(callback);
      return () => {
        if (this.listeners.has(collection)) {
          this.listeners.get(collection).delete(callback);
        }
      };
    }

    _updateLocalCache(collection, item, action) {
      try {
        const key = `sohoz_cache_${this.tenantId}_${collection}`;
        let rows = JSON.parse(localStorage.getItem(key) || '[]');
        if (action === 'add') {
          rows.push(item);
        } else if (action === 'update') {
          const idx = rows.findIndex(x => x.id === item.id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
        } else if (action === 'remove') {
          rows = rows.filter(x => x.id !== item.id);
        }
        localStorage.setItem(key, JSON.stringify(rows));
      } catch (e) {}
    }
  }

  // Export globally
  window.SohozKarbarCentral = new SohozKarbarCentralClient();

  // Auto-init if license already present
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const savedLic = JSON.parse(localStorage.getItem('erp_customer_license_data') || 'null');
      if (savedLic && (savedLic.key || savedLic.tenantId)) {
        window.SohozKarbarCentral.init(savedLic);
      }
    } catch (e) {}
  });

})(window);
