/* SohozKarbar — Biometric / Passkey Login add-on (WebAuthn + PRF)
 * Works for both ERP (erp.html) and Admin (admin.html).
 * - No plaintext password is ever stored: the password is sealed with AES-256-GCM
 *   using a key derived ONLY from the device passkey's PRF secret (WebAuthn prf extension).
 *   The biometric/PIN (Windows Hello / Touch ID / Face ID / Android fingerprint) is the
 *   only way to unseal it. Nothing biometric leaves the device.
 * - Pure add-on: does not modify core app code; calls the existing window.AuthService.login().
 * - Graceful: if WebAuthn/PRF is unavailable, passkey UI stays hidden and normal login works.
 */
(function () {
  'use strict';
  if (window.__NXBIO_LOADED__) return;
  window.__NXBIO_LOADED__ = true;

  var LS_KEY = 'nx_biometric_v1';
  var RP_NAME = (window.APP_CONFIG && (APP_CONFIG.name || 'SohozKarbar')) || 'SohozKarbar';
  var IS_ADMIN = window.APP_CONFIG && APP_CONFIG.buildType === 'admin';

  function supported() {
    return !!(window.PublicKeyCredential &&
      navigator.credentials && navigator.credentials.create && navigator.credentials.get &&
      window.crypto && crypto.subtle && (window.isSecureContext !== false));
  }
  // RP id: use the registrable domain so www + apex share passkeys.
  // IP literals are not valid WebAuthn RP ids (only matters for local testing).
  function rpId() {
    var host = location.hostname || '';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined;
    return host.replace(/^www\./, '');
  }
  function prfSupported() {
    // PublicKeyCredential.getClientExtensionResults exists; PRF is feature-detected at use.
    return supported() && typeof PublicKeyCredential.prototype.getClientExtensionResults === 'function';
  }

  /* ---------- base64url ---------- */
  function b64u(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function ub64u(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a.buffer; }

  /* ---------- store ---------- */
  function loadStore() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || { accounts: {} }; } catch (e) { return { accounts: {} }; } }
  function saveStore(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} }
  function accountName(rec) { return (rec.name || rec.username || 'পাসকি'); }
  function latestAccount(store) {
    var best = null, bestT = -1;
    for (var k in store.accounts) { var r = store.accounts[k]; if ((r.createdAt || 0) > bestT) { bestT = r.createdAt || 0; best = r; } }
    return best;
  }
  function hasEnrolled() { var s = loadStore(); return Object.keys(s.accounts || {}).length > 0; }

  /* ---------- crypto (AES-256-GCM keyed by PRF secret) ---------- */
  async function prfKey(prfBytes) {
    // Normalize the passkey PRF secret to a stable 32-byte AES key.
    var digest = await crypto.subtle.digest('SHA-256', prfBytes);
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  function encStr(ab) { return new TextDecoder().decode(ab); }
  async function seal(prfBytes, plaintext) {
    var key = await prfKey(prfBytes);
    var iv = rand(12);
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plaintext));
    return { iv: b64u(iv), ct: b64u(ct) };
  }
  async function open(prfBytes, blob) {
    var key = await prfKey(prfBytes);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64u(blob.iv) }, key, ub64u(blob.ct));
    return encStr(pt);
  }

  /* ---------- WebAuthn ---------- */
  function prfFrom(ext) {
    ext = ext || {};
    var prf = ext.prf;
    if (prf && prf.results && prf.results.first) return prf.results.first;
    return null;
  }
  async function createPasskey(username, displayName) {
    var salt = rand(32);
    var userHandle = rand(16);
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: (rpId() ? { name: RP_NAME, id: rpId() } : { name: RP_NAME }),
        user: { id: userHandle, name: username, displayName: displayName || username },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        timeout: 60000,
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        attestation: 'none',
        extensions: { prf: { eval: { first: salt } } }
      }
    });
    var credId = b64u(cred.rawId);
    var prf = prfFrom(cred.getClientExtensionResults && cred.getClientExtensionResults());
    // Some browsers return PRF only on assertion — perform one to derive immediately.
    if (!prf) {
      try {
        var ass = await navigator.credentials.get({
          publicKey: {
            challenge: rand(32),
            allowCredentials: [{ type: 'public-key', id: ub64u(credId) }],
            userVerification: 'required',
            timeout: 60000,
            extensions: { prf: { eval: { first: salt } } }
          }
        });
        prf = prfFrom(ass.getClientExtensionResults && ass.getClientExtensionResults());
      } catch (e) { prf = null; }
    }
    return { credId: credId, salt: b64u(salt), prf: prf };
  }
  async function assertPasskey(rec) {
    var ass = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: [{ type: 'public-key', id: ub64u(rec.credId) }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: ub64u(rec.salt) } } }
      }
    });
    return prfFrom(ass.getClientExtensionResults && ass.getClientExtensionResults());
  }

  /* ---------- UI helpers ---------- */
  function toast(msg, kind) {
    try { if (window.UI && UI.toast) { UI.toast(msg, kind || 'success'); return; } } catch (e) {}
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);background:' + (kind === 'error' ? '#dc2626' : '#0b9e6f') + ';color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,.25)';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200);
  }
  function postLogin(username) {
    try { if (window.Sounds && Sounds.login) Sounds.login(); } catch (e) {}
    try { var u = window.AuthService && AuthService.currentUser; toast('স্বাগতম! ' + ((u && (u.name || u.username)) || username || ''), 'success'); } catch (e) {}
    setTimeout(function () { location.reload(); }, 400);
  }
  function showError(msg) {
    var el = document.getElementById('loginError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    else toast(msg, 'error');
  }

  /* ---------- in-app modal biometric challenge (for 2FA / sensitive actions) ---------- */
  function gateModal(title, reason) {
    return new Promise(function (resolve) {
      if (!supported() || !hasEnrolled()) { resolve(false); return; }
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:16px;padding:26px;width:380px;max-width:92vw;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)';
      box.innerHTML =
        '<div style="font-size:44px;line-height:1">🔐</div>' +
        '<h3 style="margin:12px 0 4px;font-size:17px">' + (title || 'নিরাপত্তা যাচাই') + '</h3>' +
        '<p style="color:#64748b;font-size:13px;margin:0 0 18px">' + (reason || 'এই সংবেদনশীল কাজটির জন্য ফিঙ্গারপ্রিন্ট/ফেস আনলক প্রয়োজন।') + '</p>' +
        '<button class="nxg-ok" style="width:100%;border:0;border-radius:10px;padding:13px;font-weight:800;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff"><i class="fas fa-fingerprint"></i> বায়োমেট্রিক দিয়ে নিশ্চিত করুন</button>' +
        '<button class="nxg-cancel" style="width:100%;margin-top:9px;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;background:#f1f5f9;color:#475569">বাতিল</button>';
      ov.appendChild(box); document.body.appendChild(ov);
      var done = false;
      function close(v) { if (done) return; done = true; ov.remove(); resolve(v); }
      box.querySelector('.nxg-cancel').onclick = function () { close(false); };
      ov.onclick = function (e) { if (e.target === ov) close(false); };
      box.querySelector('.nxg-ok').onclick = async function () {
        var b = this; b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> যাচাই হচ্ছে…';
        var ok = await window.NXBiometric.verify();
        if (ok) close(true); else { b.disabled = false; b.innerHTML = '<i class="fas fa-fingerprint"></i> আবার চেষ্টা করুন'; toast('বায়োমেট্রিক মেলেনি', 'error'); }
      };
    });
  }

  /* ---------- public API (also used for 2FA / sensitive-action re-auth) ---------- */
  window.NXBiometric = {
    supported: supported,
    prfSupported: prfSupported,
    enrolled: hasEnrolled,
    /** List enrolled accounts (metadata only — never the secret/password). */
    list: function () { return Object.values(loadStore().accounts || {}).map(function (r) { return { username: r.username, name: r.name, createdAt: r.createdAt, sealed: !!r.enc }; }); },
    /** Enroll the currently logged-in user. Requires their password (to seal it). */
    enroll: function (username, password) { return enroll(username, password); },
    /** Trigger a biometric check without signing in. Resolves true on success. */
    verify: async function (reason) {
      if (!supported()) return false;
      var rec = latestAccount(loadStore());
      if (!rec) return false;
      try { await assertPasskey(rec); return true; }
      catch (e) { return false; }
    },
    /** Modal challenge for sensitive actions. Resolves true if biometric passes. */
    gate: function (title, reason) { return gateModal(title, reason); },
    remove: function () { localStorage.removeItem(LS_KEY); toast('এই ডিভাইসের পাসকি মুছে ফেলা হয়েছে'); try { inject(); } catch (e) {} }
  };

  /* ---------- flows ---------- */
  async function enroll(username, password, displayName) {
    if (!username || !password) throw new Error('ইউজারনেম ও পাসওয়ার্ড দিন');
    // 1) verify credentials against the real auth system first
    await window.AuthService.login({ username: username, password: password, remember: true });
    // 2) create device passkey
    var res = await createPasskey(username, displayName || username);
    // 3) PRF must be available, otherwise the passkey cannot decrypt the password
    //    and would never be usable — don't store a non-working enrollment.
    if (!res.prf) throw new Error('এই ব্রাউজার/ডিভাইসে পাসকির নিরাপদ কী (PRF) সাপোর্ট নেই — আপডেটেড Chrome/Edge বা ফিঙ্গারপ্রিন্ট-সমর্থিত ফোনে চেষ্টা করুন; আপাতত পাসওয়ার্ড দিয়ে লগইন করুন। আপনি পাসওয়ার্ডে লগইন হয়ে গেছেন।');
    var blob = await seal(res.prf, password);
    var store = loadStore();
    store.accounts[username.toLowerCase()] = {
      username: username, name: displayName || username,
      credId: res.credId, salt: res.salt, enc: blob,
      createdAt: Date.now(), rp: location.hostname
    };
    saveStore(store);
    return true;
  }
  async function signin(rec) {
    var prf = await assertPasskey(rec);
    if (!prf) throw new Error('পাসকি ভেরিফাই করা যায়নি');
    if (!rec.enc) throw new Error('এই পাসকিটি এখনো সক্রিয় হয়নি — একবার পাসওয়ার্ড দিয়ে লগইন করে আবার চালু করুন');
    var password = await open(prf, rec.enc);
    await window.AuthService.login({ username: rec.username, password: password, remember: true });
  }

  /* ---------- UI injection ---------- */
  var CSS = '.nxbio-wrap{margin-top:12px}.nxbio-sep{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:11px;margin:12px 0 10px}.nxbio-sep:before,.nxbio-sep:after{content:"";flex:1;height:1px;background:#e2e8f0}.nxbio-btn{width:100%;border:0;border-radius:10px;padding:12px 14px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:.15s}.nxbio-btn:active{transform:translateY(1px)}.nxbio-primary{background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff;box-shadow:0 8px 20px rgba(11,158,111,.28)}.nxbio-ghost{background:#f1f5f9;color:#334155;margin-top:8px}.nxbio-ghost:hover{background:#e2e8f0}.nxbio-panel{margin-top:12px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc}.nxbio-panel .nx-fld{margin-bottom:10px}.nxbio-panel label{font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px}.nxbio-panel input{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:10px 12px;font-size:14px;font-family:inherit}.nxbio-note{font-size:11px;color:#64748b;line-height:1.5;margin-top:8px}.nxbio-hide{display:none!important}';

  function inject() {
    if (!supported()) return;
    var form = document.getElementById('loginForm');
    if (!form || form.dataset.nxbio === '1') return;
    form.dataset.nxbio = '1';

    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'nxbio-wrap';
    wrap.innerHTML =
      '<div class="nxbio-sep">অথবা</div>' +
      (hasEnrolled()
        ? '<button type="button" class="nxbio-btn nxbio-primary" id="nxBioSignin"><i class="fas fa-fingerprint"></i> ফিঙ্গারপ্রিন্ট / ফেস আনলক</button>'
        : '') +
      '<button type="button" class="nxbio-btn nxbio-ghost" id="nxBioEnroll"><i class="fas fa-key"></i> এই ডিভাইসে পাসকি (বায়োমেট্রিক) চালু করুন</button>' +
      '<div class="nxbio-panel nxbio-hide" id="nxBioPanel">' +
        '<div class="nx-fld"><label>ইউজারনেম/ইমেইল</label><input id="nxBioUser" type="text" autocomplete="username" placeholder="ইউজারনেম"></div>' +
        '<div class="nx-fld"><label>পাসওয়ার্ড (শুধু যাচাইয়ের জন্য — সেভ হয় না, এনক্রিপ্ট হয়)</label><input id="nxBioPass" type="password" autocomplete="current-password" placeholder="পাসওয়ার্ড"></div>' +
        '<button type="button" class="nxbio-btn nxbio-primary" id="nxBioCreate"><i class="fas fa-fingerprint"></i> ফিঙ্গারপ্রিন্ট/ফেস দিয়ে পাসকি তৈরি করুন</button>' +
        '<button type="button" class="nxbio-btn nxbio-ghost" id="nxBioCancel">বাতিল</button>' +
        '<div class="nxbio-note">🔒 আপনার ফিঙ্গারপ্রিন্ট/ফেস ডিভাইসেই থাকে, কোথাও পাঠানো হয় না। পাসওয়ার্ড AES-256 দিয়ে এনক্রিপ্ট হয়ে শুধু এই ব্রাউজারে থাকে; পরের লগইনে বায়োমেট্রিক ছাড়া খোলা যায় না।</div>' +
      '</div>';
    form.appendChild(wrap);

    var panel = wrap.querySelector('#nxBioPanel');
    var btnEnroll = wrap.querySelector('#nxBioEnroll');
    var btnSignin = wrap.querySelector('#nxBioSignin');

    btnEnroll.addEventListener('click', function () {
      panel.classList.toggle('nxbio-hide');
      var u = document.getElementById('loginUsername');
      var p = document.getElementById('loginPassword');
      var nu = wrap.querySelector('#nxBioUser'), np = wrap.querySelector('#nxBioPass');
      if (nu && u && u.value) nu.value = u.value.trim();
      if (np && p && p.value) np.value = p.value;
      if (nu && !panel.classList.contains('nxbio-hide')) nu.focus();
    });
    wrap.querySelector('#nxBioCancel').addEventListener('click', function () { panel.classList.add('nxbio-hide'); });

    wrap.querySelector('#nxBioCreate').addEventListener('click', async function () {
      var b = this; var old = b.innerHTML; b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> অপেক্ষা করুন…';
      try {
        var username = wrap.querySelector('#nxBioUser').value.trim();
        var password = wrap.querySelector('#nxBioPass').value;
        await enroll(username, password);
        toast('✅ পাসকি চালু হয়েছে! পরের বার ফিঙ্গারপ্রিন্ট/ফেসেই লগইন');
        postLogin(username);
      } catch (err) {
        // If the password login already succeeded (only passkey setup failed),
        // still enter the app — passkey stays optional and is not saved.
        var loggedIn = window.AuthService && AuthService.currentUser;
        if (loggedIn) {
          toast('ℹ️ ' + ((err && err.message) || 'পাসকি সেটআপ হয়নি'), 'error');
          postLogin(username);
        } else {
          showError(err && err.message ? err.message : 'পাসকি তৈরি করা যায়নি');
          b.disabled = false; b.innerHTML = old;
        }
      }
    });

    if (btnSignin) btnSignin.addEventListener('click', async function () {
      var b = this; var old = b.innerHTML; b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> বায়োমেট্রিক যাচাই হচ্ছে…';
      try {
        var rec = latestAccount(loadStore());
        if (!rec) throw new Error('কোনো পাসকি পাওয়া যায়নি');
        await signin(rec);
        postLogin(rec.username);
      } catch (err) {
        var msg = (err && err.name === 'NotAllowedError') ? 'বায়োমেট্রিক বাতিল/ব্যর্থ — পাসওয়ার্ড দিয়ে লগইন করুন' : ((err && err.message) || 'বায়োমেট্রিক লগইন ব্যর্থ');
        showError(msg);
        b.disabled = false; b.innerHTML = old;
      }
    });
  }

  // Login card is rendered dynamically → watch for it.
  var iv;
  function start() {
    inject();
    iv = setInterval(inject, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
