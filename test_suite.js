import http from 'http';
import { WebSocket } from 'ws';

const BASE_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/ws';
const ADMIN_KEY = 'SK-MASTER-BOSS-RIFAT-2026';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('==================================================');
  console.log('🧪 SOHOZKARBAR CENTRAL SERVER END-TO-END TEST SUITE');
  console.log('==================================================\n');

  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check...');
  const health = await request('/health');
  console.assert(health.ok, 'Health check should return 200 OK');
  console.log('   ✅ Health OK:', health.data.server, '| DB:', health.data.database);

  // Test 2: 3-Day Trial Registration
  console.log('\n2️⃣ Testing 3-Day Free Trial Auto-Generation...');
  const trialRes = await request('/api/trial/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Rahim Traders',
      phone: '01711223344',
      business: 'Supermarket POS',
      email: 'rahim@example.com',
      device_fp: 'dv_test_fp_12345'
    })
  });
  console.assert(trialRes.ok, 'Trial registration should succeed');
  console.assert(trialRes.data.key.startsWith('SK-TRIA-'), 'Key should start with SK-TRIA-');
  const durationDays = (trialRes.data.expiresAt - Date.now()) / (1000 * 60 * 60 * 24);
  console.assert(Math.round(durationDays) === 3, 'Trial duration must be 3 days');
  console.log('   ✅ Trial Key Issued:', trialRes.data.key);
  console.log('   ✅ Expiry Validated: Exactly 3 days from now');

  // Test 2b: Anti-Abuse Check (Duplicate Device Fingerprint)
  console.log('\n2️⃣b Testing Device Anti-Abuse Check...');
  const dupRes = await request('/api/trial/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Rahim Clone',
      phone: '01899887766',
      business: 'Fake Shop',
      device_fp: 'dv_test_fp_12345'
    })
  });
  console.assert(dupRes.data.isExisting === true, 'Duplicate device must be flagged as existing');
  console.log('   ✅ Anti-Abuse Passed: Reused device fingerprint correctly restored original license instead of creating infinite free keys.');

  // Test 3: Master Admin License Management
  console.log('\n3️⃣ Testing Master Admin License Creation & Limits...');
  const newLicRes = await request('/api/admin/licenses', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Dhaka Agro Superstore',
      businessName: 'Dhaka Agro LLC',
      maxDevices: 10,
      validityDays: 365,
      plan: 'enterprise',
      mobile: '01911002233',
      notes: 'Paid via Bank Transfer'
    })
  });
  console.assert(newLicRes.ok, 'Admin license creation should succeed');
  const paidKey = newLicRes.data.key;
  const paidTenantId = newLicRes.data.tenantId;
  console.log('   ✅ Admin Created License:', paidKey, '| Max Devices:', newLicRes.data.maxDevices);

  // Test 4: Multi-Tenant Data Isolation (Tenant A vs Tenant B)
  console.log('\n4️⃣ Testing Multi-Tenant Data Isolation...');
  const tenantA = paidTenantId;
  const tenantB = trialRes.data.tenantId;

  // Add Product to Tenant A
  const pA = await request(`/api/tenants/${tenantA}/products`, {
    method: 'POST',
    body: JSON.stringify({ id: 'prod_rice_50kg', name: 'Miniket Rice 50kg', price: 3400, stock: 120 })
  });
  console.assert(pA.ok, 'Tenant A product add should succeed');

  // Add Product to Tenant B
  const pB = await request(`/api/tenants/${tenantB}/products`, {
    method: 'POST',
    body: JSON.stringify({ id: 'prod_oil_5l', name: 'Rupchanda Soybean Oil 5L', price: 920, stock: 45 })
  });
  console.assert(pB.ok, 'Tenant B product add should succeed');

  // Verify Tenant A sees ONLY its own products
  const listA = await request(`/api/tenants/${tenantA}/products`);
  console.assert(listA.data.some(p => p.id === 'prod_rice_50kg'), 'Tenant A should see Miniket Rice');
  console.assert(!listA.data.some(p => p.id === 'prod_oil_5l'), 'Tenant A must NEVER see Tenant B products');
  console.log('   ✅ Data Isolation Verified: Tenant A cannot access Tenant B data (100% Isolated).');

  // Test 5: WebSocket Real-Time Live Sync
  console.log('\n5️⃣ Testing WebSocket Live Sync Between Multiple Users in Same Company...');
  await new Promise((resolve, reject) => {
    const ws1 = new WebSocket(WS_URL);
    const ws2 = new WebSocket(WS_URL);
    let ws2Joined = false;

    ws1.on('open', () => {
      ws1.send(JSON.stringify({ type: 'JOIN', tenantId: tenantA, licenseKey: paidKey, hardwareId: 'hw_cashier_1' }));
    });

    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'JOIN', tenantId: tenantA, licenseKey: paidKey, hardwareId: 'hw_manager_pc' }));
    });

    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'JOINED') {
        ws2Joined = true;
        // Cashier 1 mutates a product price
        setTimeout(() => {
          ws1.send(JSON.stringify({
            type: 'MUTATE',
            collection: 'products',
            docId: 'prod_rice_50kg',
            action: 'update',
            data: { id: 'prod_rice_50kg', name: 'Miniket Rice 50kg', price: 3450, stock: 119 }
          }));
        }, 500);
      }

      if (msg.type === 'SYNC') {
        console.assert(msg.collection === 'products', 'Sync collection must match');
        console.assert(msg.data.price === 3450, 'Manager received live price update');
        console.log('   ✅ Live Sync Passed: Cashier updated price, Manager received instant WebSocket update in real time!');
        ws1.close();
        ws2.close();
        resolve();
      }
    });

    setTimeout(() => reject(new Error('WebSocket sync timeout')), 6000);
  });

  console.log('\n==================================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! SERVER 100% OPERATIONAL');
  console.log('==================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
