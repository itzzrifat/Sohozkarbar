/* SohozKarbar ERP — Service Worker v15
   Strategy: NETWORK-FIRST for HTML & Navigation (updates load instantly).
   Stale-While-Revalidate for static assets.
   Bypasses cache for all Firestore & REST APIs.
   UPDATE 208: redesigned Workstation UI (aurora-dark). Service worker keeps
   force-navigating every open app tab once on a new release (loop-guarded) so
   no device stays on an old cached page (covers ERP/Admin/Workstation/Portal).
   Focus/visibility/bfcache resume also triggers an immediate self-update. */

const CACHE_NAME = 'sohozkarbar-v240';

const CORE_ASSETS = [
  '/rifat-uddin.html','/rifat-uddin-headshot.jpg','/rifat-uddin-founder-office.jpg',
  '/founder.html','/shakil-munsi.html','/shakil-munsi-corporate.jpg','/shakil-munsi-office.jpg',
  '/license-agreement.js',
  '/sk-views.js',
  '/company.html','/products.html','/sohozkarbar-erp.html','/bank-transaction.html','/pricing.html','/demos/ecommerce.html','/demos/newspaper.html','/demos/blog.html','/demos/restaurant.html','/demos/school.html','/demos/clinic.html','/demos/realestate.html','/demos/travel.html','/demos/gym.html','/demos/salon.html','/demos/agency.html','/demos/hotel.html','/demos/photography.html','/demos/marketing-dashboard.html','/demos/ad-campaign.html','/demos/landing-offer.html','/demos/video-studio.html','/demos/motion-graphics.html','/demos/crm-app.html','/demos/delivery-app.html','/demos/pos-app.html','/demos/inventory-app.html','/demos/accounting-app.html','/demos/hr-app.html','/demo-ecommerce.jpg','/demo-newspaper.jpg','/demo-blog.jpg','/demo-restaurant.jpg','/demo-school.jpg','/demo-clinic.jpg','/demo-realestate.jpg','/demo-travel.jpg','/demo-gym.jpg','/demo-salon.jpg','/demo-agency.jpg','/demo-hotel.jpg','/demo-photography.jpg','/demo-marketing-dashboard.jpg','/demo-ad-campaign.jpg','/demo-landing-offer.jpg','/demo-video-studio.jpg','/demo-motion-graphics.jpg','/demo-crm-app.jpg','/demo-delivery-app.jpg','/demo-pos-app.jpg','/demo-inventory-app.jpg','/demo-accounting-app.jpg','/demo-hr-app.jpg','/demo-interact.js','/fonts/HindSiliguri-Regular.ttf','/fonts/HindSiliguri-Bold.ttf','/about.html','/contact.html','/support.html','/privacy.html','/terms.html','/company-pages.css',
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
  '/admin.html',
  '/erp.html',
  '/trial.html',
  '/verify.html',
  '/recovery.html',
  '/manifest.json',
  '/manifest-admin.json',
  '/manifest-customer.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/sk-app-icon-192-v197.png',
  '/sk-app-icon-512-v197.png',
  '/sk-app-icon-192-maskable-v197.png',
  '/sk-app-icon-512-maskable-v197.png',
  '/sk-favicon-v197.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon-32.png',
  '/logo.png',
  '/logo-square.png','/sk-mark-master.png','/sk-tech-solutions-logo.png',
  '/mascot.png',
  '/mascot-closed.png',
  '/sales-banner-pro.png',
  '/qr.min.js',
  '/app-updater.js',
  '/sk-bhai.png',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== 'sohozkarbar-last-good' && k !== 'sohozkarbar-recovery').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Cross-origin (Firebase, APIs, CDNs) -> network directly
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__')) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    // NETWORK-FIRST: Always fetch latest version when online
    event.respondWith(
      caches.open('sohozkarbar-recovery').then((rc) => rc.match('/__nx_recovery_flag')).then((flag) => {
        if (flag && url.pathname !== '/recovery.html') {
          return caches.open('sohozkarbar-last-good').then((lg) => lg.match(url.pathname).then((hit) => hit || lg.match(url.pathname.replace(/\/$/, '') + '.html')));
        }
        let fetchReq = req;
        const cleanPath = url.pathname.replace(/\/+$/, '');
        if (cleanPath === '/admin') {
          fetchReq = new Request(url.origin + '/admin.html' + url.search, req);
        } else if (cleanPath === '/erp') {
          fetchReq = new Request(url.origin + '/erp.html' + url.search, req);
        }
        return fetch(fetchReq, { cache: 'no-cache' }).then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); return res; }
          /* UPDATE 183 — edge 5xx (e.g. 504 Gateway Timeout): serve the cached app
             instead of surfacing the error page to the user */
          return caches.match(req)
            .then((hit) => hit || caches.match(url.pathname.replace(/\/$/, '') + '.html'))
            .then((hit) => hit || caches.match('/'))
            .then((hit) => hit || res);
        }).catch(() => caches.match(req).then((hit) => hit || caches.match('/')));
      })
    );
    return;
  }

  // Static assets (images, icons): stale-while-revalidate
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener('notificationclick',function(event){event.notification.close();var u=(event.notification.data&&event.notification.data.url)||'/admin.html#owner-mobile-dashboard';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(var i=0;i<list.length;i++){if('focus'in list[i]){list[i].navigate(u);return list[i].focus();}}if(clients.openWindow)return clients.openWindow(u);}));});


/* UPDATE 198 — universal in-app update protocol */
const APP_BUILD_VERSION = '1788740000000';
self.addEventListener('message', function(event){
  var d=event.data||{};
  if(d.type==='SKIP_WAITING')self.skipWaiting();
  if(d.type==='GET_APP_VERSION'&&event.source)event.source.postMessage({type:'APP_VERSION',version:APP_BUILD_VERSION,cache:CACHE_NAME});
});
self.addEventListener('activate', function(event){
  event.waitUntil(Promise.resolve().then(function(){
    return caches.open('sohozkarbar-recovery').then(function(c){ return c.delete('/__nx_recovery_flag'); }).catch(function(){});
  }).then(function(){
    return self.clients.matchAll({type:'window',includeUncontrolled:true});
  }).then(function(list){
    if(self.__nxForcedOnce) return Promise.resolve();
    self.__nxForcedOnce = true;
    var marker = (CACHE_NAME||'').replace('sohozkarbar-','') || 'v234';
    return Promise.all(list.map(function(c){
      try{c.postMessage({type:'APP_UPDATED',version:APP_BUILD_VERSION,cache:CACHE_NAME});}catch(e){}
      try{
        if(!navigatorIsOnline())return Promise.resolve();
        var u=c.url||'';
        if(/[?&]_nxsw=/.test(u)) return Promise.resolve();
        var sep=u.indexOf('?')>=0?'&':'?';
        var nu=u.split('#')[0]+sep+'_nxsw='+marker+(u.indexOf('#')>=0?u.slice(u.indexOf('#')):'');
        if(c.navigate)return c.navigate(nu);
        c.postMessage({type:'NX_FORCE_RELOAD',version:APP_BUILD_VERSION});
      }catch(e){}
      return Promise.resolve();
    }));
  }));
});
function navigatorIsOnline(){try{return self.navigator?self.navigator.onLine!==false:true;}catch(e){return true;}}
