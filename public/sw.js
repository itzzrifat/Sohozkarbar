/* SohozKarbar ERP — Service Worker v16 (Clean Direct Network-First)
   Strategy: NETWORK-FIRST for HTML & Navigation (updates load instantly).
   Stale-While-Revalidate for static assets.
   Bypasses cache for all Firestore & REST APIs.
*/

const CACHE_NAME = 'sohozkarbar-v245';
const APP_BUILD_VERSION = '1790172500000';

const CORE_ASSETS = [
  '/rifat-uddin.html','/rifat-uddin-headshot.jpg','/rifat-uddin-founder-office.jpg',
  '/founder.html','/shakil-munsi.html','/shakil-munsi-corporate.jpg','/shakil-munsi-office.jpg',
  '/license-agreement.js',
  '/sk-views.js',
  '/company.html','/products.html','/sohozkarbar-erp.html','/bank-transaction.html','/pricing.html',
  '/about.html','/contact.html','/support.html','/privacy.html','/terms.html','/company-pages.css',
  '/biometric-login.js',
  '/security-center.js',
  '/karbar-desk.js',
  '/profile-avatar.js',
  '/vendor/firebase/firebase-app-compat.js',
  '/vendor/firebase/firebase-auth-compat.js',
  '/vendor/firebase/firebase-firestore-compat.js',
  '/vendor/firebase/firebase-storage-compat.js',
  '/vendor/firebase/firebase-analytics-compat.js',
  '/',
  '/admin/index.html',
  '/admin.html',
  '/erp/index.html',
  '/erp.html',
  '/trial.html',
  '/verify.html',
  '/manifest.json',
  '/manifest-admin.json',
  '/manifest-customer.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon-32.png',
  '/logo.png',
  '/logo-square.png',
  '/portal.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((res) => (res && res.ok ? cache.put(url, res) : undefined))
            .catch(() => undefined)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Cross-origin (Firebase, APIs, CDNs) -> network directly
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__') || url.pathname.startsWith('/api')) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    // NETWORK-FIRST: Always fetch latest version directly from network
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }
          return caches.match(req)
            .then((hit) => hit || caches.match(url.pathname.replace(/\/$/, '') + '.html'))
            .then((hit) => hit || caches.match('/admin/index.html') || caches.match('/admin.html') || res);
        })
        .catch(() => {
          return caches.match(req)
            .then((hit) => hit || caches.match(url.pathname.replace(/\/$/, '') + '.html'))
            .then((hit) => hit || (url.pathname.includes('admin') ? (caches.match('/admin/index.html') || caches.match('/admin.html')) : null))
            .then((hit) => hit || (url.pathname.includes('erp') ? (caches.match('/erp/index.html') || caches.match('/erp.html')) : null))
            .then((hit) => hit || caches.match('/'));
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_APP_VERSION' && event.source) {
    event.source.postMessage({ type: 'APP_VERSION', version: APP_BUILD_VERSION, cache: CACHE_NAME });
  }
});
