/* SohozKarbar — Website view analytics beacon (v1, build 178837)
 * Public, privacy-light, non-blocking. Records one view per page visit into
 * Firestore license_customers/_nx_lp_views_<YYYYMMDD> (public-writable per the
 * _nx_lp_ prefix in firestore.rules). Counters: total, pages, devices, OS,
 * browsers, countries, cities, mobile/pc. Location from the visitor's IP via
 * free geojs/ipapi fallbacks (no GPS, no PII). Read/aggregated in Workstation. */
(function () {
  if (window.__SKV) return; window.__SKV = 1;
  var KEY = 'AIzaSyC0Mmh2vN77NxKaxTFOW531fc-ZXBrZK6Y';
  var PROJ = 'karbarnew';
  function fbDoc(id) { return 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents/license_customers/' + id + '?key=' + KEY; }
  function dayStr() { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
  function pageName() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    if (p === '/' || p === '') return 'home';
    var f = p.split('/').pop().replace(/\.html?$/, '');
    if (f === 'erp' || f === 'admin' || f === 'trial' || f === 'workstation') return f;
    return f || 'home';
  }
  function detect() {
    var ua = navigator.userAgent, plat = navigator.platform || '', uaMob = /Mobi|Android|iPhone|iPod|iPad|Windows Phone/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    var os = 'Other';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = 'iOS';
    else if (/Windows|Win32|Win64/i.test(ua) || /Win/i.test(plat)) os = 'Windows';
    else if (/Mac OS X|Macintosh|MacPPC|MacIntel/i.test(ua) || /Mac/i.test(plat)) os = 'macOS';
    else if (/Linux|X11|CrOS/i.test(ua)) os = 'ChromeOS/Linux';
    var br = 'Other';
    if (/Edg\//i.test(ua)) br = 'Edge';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) br = 'Opera';
    else if (/SamsungBrowser/i.test(ua)) br = 'Samsung Internet';
    else if (/Chrome|CriOS/i.test(ua)) br = 'Chrome';
    else if (/Firefox|FxiOS/i.test(ua)) br = 'Firefox';
    else if (/Safari/i.test(ua)) br = 'Safari';
    var devClass = (os === 'Android' || os === 'iOS') ? 'mobile' : 'pc';
    if (uaMob && devClass === 'pc') devClass = 'mobile';
    return { os: os, browser: br, device: devClass };
  }
  function jget(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function geo() {
    // geojs first (free, https, no key); fallback to ipapi
    return jget('https://get.geojs.io/v1/ip/geo.json').then(function (g) {
      if (g && g.country) return { country: g.country_code || g.country || 'Unknown', city: g.city || '', ip: g.ip || '' };
      return jget('https://ipapi.co/json/').then(function (q) {
        if (q && q.country_code) return { country: q.country_code, city: q.city || '', ip: q.ip || '' };
        return { country: 'Unknown', city: '', ip: '' };
      });
    }).catch(function () { return { country: 'Unknown', city: '', ip: '' }; });
  }
  function S(v) { return { stringValue: String(v == null ? '' : v) }; }
  function I(v) { return { integerValue: String(v | 0) }; }
  function M(obj) { var f = {}; for (var k in obj) f[k] = I(obj[k]); return { mapValue: { fields: f } }; }
  function patchCounter(id, body, mask) {
    return fetch(fbDoc(id) + (mask ? '&updateMask.fieldPaths=' + mask.join('&updateMask.fieldPaths=') : ''), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.status; }).catch(function (e) { return 0; });
  }
  function run() {
    try {
      var d = detect();
      var page = pageName();
      var day = dayStr();
      var id = '_nx_lp_views_' + day;
      geo().then(function (loc) {
        var country = (loc.country || 'Unknown').slice(0, 2).toUpperCase();
        var city = (loc.city || 'Unknown').replace(/[^A-Za-z .'-]/g, '').slice(0, 40) || 'Unknown';
        // 1) durable raw visit doc (backup / uniqueness later)
        var sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        fetch(fbDoc('_nx_lp_visitv_' + day + '_' + sid), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: {
            ts: I(Date.now()), page: S(page), os: S(d.os), browser: S(d.browser),
            device: S(d.device), country: S(country), city: S(city), host: S(location.hostname)
          } })
        }).catch(function () {});
        // 2) read-modify-write the daily aggregate counter
        jget(fbDoc(id)).then(function (cur) {
          var f = (cur && cur.fields) || {};
          function num(name) { var v = f[name] && f[name].integerValue; return v ? parseInt(v, 10) || 0 : 0; }
          function map(name) { var m = f[name] && f[name].mapValue && f[name].mapValue.fields || {}; var o = {}; for (var k in m) { o[k] = (m[k].integerValue ? parseInt(m[k].integerValue, 10) : 0) || 0; } return o; }
          var inc = function (o, k) { o[k] = (o[k] || 0) + 1; return o; };
          var total = num('total') + 1;
          var pages = inc(map('pages'), page);
          var devices = inc(map('devices'), d.device);
          var osM = inc(map('os'), d.os);
          var brows = inc(map('browsers'), d.browser);
          var countries = inc(map('countries'), country);
          var cities = inc(map('cities'), city);
          var first = f.firstTs ? f.firstTs : I(Date.now());
          patchCounter(id, { fields: {
            date: S(day), total: I(total), firstTs: first, lastTs: I(Date.now()),
            pages: M(pages), devices: M(devices), os: M(osM), browsers: M(brows),
            countries: M(countries), cities: M(cities)
          } }, ['total', 'lastTs', 'pages', 'devices', 'os', 'browsers', 'countries', 'cities', 'date']);
        }).catch(function () {});
      }).catch(function () {});
    } catch (e) {}
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(run, 300);
  else window.addEventListener('DOMContentLoaded', function () { setTimeout(run, 300); });
})();
