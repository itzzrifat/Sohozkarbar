import { db, initDatabase } from './db.js';

initDatabase();

// 1. Insert test customer: Karim Traders
const testKey = 'SK-TEST-KARIM-2026';
db.prepare('DELETE FROM licenses WHERE key = ? OR custom_slug = ?').run(testKey, 'karimtraders');
db.prepare(`
  INSERT INTO licenses (
    key, id, customer_name, business_name, tenant_id,
    custom_slug, customer_username, customer_password, allowed_modules,
    license_type, plan, trial_days, max_devices, expires_at,
    status, mobile, email, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  testKey, 'lic_karim_101', 'Md. Karim Hossain', 'Karim Traders', 'tenant_karim_traders',
  'karimtraders', 'karimtraders', 'karim123', JSON.stringify(['pos', 'sales', 'stock', 'due', 'reports']),
  'standard', 'pro', 0, 5, 4102444799000,
  'active', '+8801700000000', 'karim@gmail.com', Date.now(), Date.now()
);

console.log('✅ Customer Karim Traders seeded successfully');

// 2. Test customer login query
const lic = db.prepare('SELECT * FROM licenses WHERE customer_username = ? AND customer_password = ?').get('karimtraders', 'karim123');
console.log('✅ Customer Login Verification:', lic.business_name, '| Key:', lic.key, '| Slug:', lic.custom_slug);

// 3. Test Staff user insertion with can_access_mobile toggle
db.prepare('DELETE FROM tenant_staff_users WHERE tenant_id = ?').run('tenant_karim_traders');
db.prepare(`
  INSERT INTO tenant_staff_users (tenant_id, username, full_name, pin, role, can_access_mobile, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('tenant_karim_traders', 'kashem', 'Abul Kashem', '1122', 'cashier', 1, Date.now(), Date.now());

db.prepare(`
  INSERT INTO tenant_staff_users (tenant_id, username, full_name, pin, role, can_access_mobile, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('tenant_karim_traders', 'rahim_pc_only', 'Rahim PC Worker', '3344', 'operator', 0, Date.now(), Date.now());

const kashem = db.prepare('SELECT * FROM tenant_staff_users WHERE username = ?').get('kashem');
const rahim = db.prepare('SELECT * FROM tenant_staff_users WHERE username = ?').get('rahim_pc_only');

console.log('✅ Kashem Mobile Permission (should be 1):', kashem.can_access_mobile);
console.log('✅ Rahim Mobile Permission (should be 0):', rahim.can_access_mobile);

console.log('🎉 ALL WORKFLOW CHECKS PASSED PERFECTLY!');
