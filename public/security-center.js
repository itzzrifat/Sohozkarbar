/* SohozKarbar — Security Center add-on (logged-in ERP / Admin shell)
 * Non-invasive: adds a floating shield button + security modal. Provides:
 *  • Passkey (biometric) enrollment / management for the signed-in user
 *  • Optional 2FA gate for sensitive actions (re-uses NXBiometric.gate)
 *  • Recent sign-in / security activity (activity_log, permission-aware)
 * Depends on biometric-login.js (window.NXBiometric). No core code changes.
 */
(function () {
  'use strict';
  if (window.__NXSEC_LOADED__) return;
  window.__NXSEC_LOADED__ = true;

  var FA_KEY = 'nx_2fa_enabled_v1';
  function twoFA() { try { return localStorage.getItem(FA_KEY) === '1'; } catch (e) { return false; } }
  function setTwoFA(v) { try { localStorage.setItem(FA_KEY, v ? '1' : '0'); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(ts) {
    if (!ts) return '';
    var d = Date.now() - Number(ts);
    if (d < 0) d = 0;
    var m = Math.floor(d / 60000);
    if (m < 1) return 'এইমাত্র';
    if (m < 60) return m + ' মিনিট আগে';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' ঘণ্টা আগে';
    return Math.floor(h / 24) + ' দিন আগে';
  }
  function toast(msg, kind) {
    try { if (window.UI && UI.toast) { UI.toast(msg, kind || 'success'); return; } } catch (e) {}
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);background:' + (kind === 'error' ? '#dc2626' : '#0b9e6f') + ';color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;z-index:100002;box-shadow:0 10px 30px rgba(0,0,0,.25)';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3000);
  }

  /* ---------- 2FA sensitive-action guard ---------- */
  var SENSITIVE = /ডিঅ্যাক্টিভ|deactivate|change license|অন্য লাইসেন্স|অন্য কী|wipe|reset all data|clear all|delete business|ফ্যাক্টরি/i;
  document.addEventListener('click', function (e) {
    if (!twoFA()) return;
    if (!window.NXBiometric || !NXBiometric.enrolled()) return;
    var el = e.target.closest('#license_change,#license_admin_open,button,a.btn,[role="button"]');
    if (!el) return;
    var hay = (el.textContent || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('onclick') || '');
    if (!SENSITIVE.test(hay)) return;
    if (el.__nxVerified) return;
    e.preventDefault(); e.stopPropagation();
    try { e.stopImmediatePropagation(); } catch (_) {}
    NXBiometric.gate('নিরাপত্তা যাচাই', 'এটি একটি সংবেদনশীল কাজ — চালিয়ে যেতে ফিঙ্গারপ্রিন্ট/ফেস আনলক দিন।').then(function (ok) {
      if (ok) { el.__nxVerified = true; el.click(); setTimeout(function () { el.__nxVerified = false; }, 2000); }
    });
  }, true);

  /* ---------- UI ---------- */
  var CSS = '.nxsec-fab{position:fixed;right:18px;bottom:84px;z-index:99990;width:52px;height:52px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff;font-size:20px;box-shadow:0 10px 26px rgba(11,158,111,.4);display:flex;align-items:center;justify-content:center}.nxsec-fab:hover{transform:translateY(-2px)}' +
    '.nxsec-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.nxsec-box{background:#fff;border-radius:16px;width:560px;max-width:96vw;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.4)}' +
    '.nxsec-hd{padding:18px 20px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#fff}' +
    '.nxsec-hd h3{margin:0;font-size:17px;flex:1}.nxsec-hd b{font-size:20px}.nxsec-x{border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px}' +
    '.nxsec-body{padding:18px 20px}.nxsec-card{border:1px solid #e6ebf2;border-radius:12px;padding:15px;margin-bottom:14px}' +
    '.nxsec-card h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:8px}.nxsec-sub{color:#64748b;font-size:12px;margin:0 0 12px;line-height:1.5}' +
    '.nxsec-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed #eef2f7;font-size:13px}.nxsec-row:last-child{border-bottom:0}' +
    '.nxsec-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px}.nxsec-ok{background:#dcfce7;color:#15803d}.nxsec-off{background:#f1f5f9;color:#64748b}' +
    '.nxsec-btn{border:0;border-radius:9px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}.nxsec-p{background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff}.nxsec-g{background:#f1f5f9;color:#334155}.nxsec-r{background:#fee2e2;color:#b91c1c}' +
    '.nxsec-inp{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:10px 12px;font-size:14px;font-family:inherit;margin-bottom:8px}' +
    '.nxsec-switch{position:relative;width:46px;height:25px;flex:0 0 auto}.nxsec-switch input{opacity:0;width:0;height:0}.nxsec-sl{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;cursor:pointer;transition:.2s}.nxsec-sl:before{content:"";position:absolute;width:19px;height:19px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}.nxsec-switch input:checked+.nxsec-sl{background:#0b9e6f}.nxsec-switch input:checked+.nxsec-sl:before{transform:translateX(21px)}' +
    '.nxsec-log{font-size:12px}.nxsec-log .nxsec-row{padding:7px 0}.nxsec-badge{font-size:10px;padding:2px 8px;border-radius:6px;font-weight:800}.nxsec-b-login{background:#dcfce7;color:#15803d}.nxsec-b-fail{background:#fee2e2;color:#b91c1c}.nxsec-b-other{background:#e0e7ff;color:#3730a3}';

  function actionLabel(a) {
    a = String(a || '');
    if (/login_failed/.test(a)) return ['লগইন ব্যর্থ', 'nxsec-b-fail'];
    if (/(^|[_\s])login([_\s]|$)/.test(a)) return ['সফল লগইন', 'nxsec-b-login'];
    if (/logout/.test(a)) return ['লগআউট', 'nxsec-b-other'];
    if (/password_reset/.test(a)) return ['পাসওয়ার্ড রিসেট', 'nxsec-b-other'];
    return [a, 'nxsec-b-other'];
  }

  function openCenter() {
    if (!window.NXBiometric) { toast('বায়োমেট্রিক মডিউল লোড হয়নি', 'error'); return; }
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    var ov = document.createElement('div'); ov.className = 'nxsec-ov';
    var me = (window.AuthService && AuthService.currentUser) || {};
    ov.innerHTML =
      '<div class="nxsec-box">' +
        '<div class="nxsec-hd"><b>🛡️</b><h3>নিরাপত্তা কেন্দ্র</h3><button class="nxsec-x" data-x>✕</button></div>' +
        '<div class="nxsec-body">' +
          '<div class="nxsec-card">' +
            '<h4>👤 বর্তমান অ্যাকাউন্ট</h4>' +
            '<div class="nxsec-row"><span>' + esc(me.name || me.username || 'ব্যবহারকারী') + '</span><span class="nxsec-pill ' + (NXBiometric.supported() ? 'nxsec-ok' : 'nxsec-off') + '">' + (NXBiometric.supported() ? 'বায়োমেট্রিক সাপোর্টেড' : 'বায়োমেট্রিক অনুপলব্ধ') + '</span></div>' +
          '</div>' +
          '<div class="nxsec-card">' +
            '<h4>🔑 পাসকি / বায়োমেট্রিক লগইন</h4>' +
            '<p class="nxsec-sub">চালু থাকলে পরের লগইনে পাসওয়ার্ড না দিয়ে ফিঙ্গারপ্রিন্ট/ফেস আনলকেই ঢুকতে পারবেন। পাসওয়ার্ড এনক্রিপ্ট হয়ে থাকে, বায়োমেট্রিক তথ্য ডিভাইসেই থাকে।</p>' +
            '<div id="nxsec-accounts"></div>' +
            '<div id="nxsec-enroll" style="margin-top:10px"></div>' +
          '</div>' +
          '<div class="nxsec-card">' +
            '<h4>🔐 দুই-ধাপ যাচাই (2FA)</h4>' +
            '<p class="nxsec-sub">চালু থাকলে সংবেদনশীল কাজে (লাইসেন্স পরিবর্তন/ডিঅ্যাক্টিভেশন, ডেটা মুছে ফেলা ইত্যাদি) ফিঙ্গারপ্রিন্ট/ফেস আনলক চাইবে।</p>' +
            '<div class="nxsec-row"><span>সংবেদনশীল কাজে বায়োমেট্রিক বাধ্যতামূলক</span>' +
              '<label class="nxsec-switch"><input type="checkbox" id="nxsec-2fa" ' + (twoFA() ? 'checked' : '') + (NXBiometric.enrolled() ? '' : ' disabled') + '><span class="nxsec-sl"></span></label></div>' +
            '<button class="nxsec-btn nxsec-g" id="nxsec-test2fa" style="margin-top:10px" ' + (NXBiometric.enrolled() ? '' : 'disabled') +'>🧪 যাচাই পরীক্ষা করুন</button>' +
          '</div>' +
          '<div class="nxsec-card">' +
            '<h4>📋 সাম্প্রতিক সাইন-ইন কার্যকলাপ</h4><div class="nxsec-log" id="nxsec-log"><div class="nxsec-sub">লোড হচ্ছে…</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').onclick = function () { ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };

    function renderAccounts() {
      var box = ov.querySelector('#nxsec-accounts');
      var list = NXBiometric.list();
      if (!list.length) { box.innerHTML = '<div class="nxsec-sub">এই ডিভাইসে এখনো কোনো পাসকি সেট করা হয়নি।</div>'; }
      else {
        box.innerHTML = list.map(function (r) {
          return '<div class="nxsec-row"><span><b>' + esc(r.name || r.username) + '</b><br><small style="color:#94a3b8">' + (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '') + '</small></span>' +
            '<span style="display:flex;gap:8px;align-items:center"><span class="nxsec-pill ' + (r.sealed ? 'nxsec-ok' : 'nxsec-off') + '">' + (r.sealed ? 'সক্রিয়' : 'অসম্পূর্ণ') + '</span>' +
            '<button class="nxsec-btn nxsec-r" data-rm>মুছুন</button></span></div>';
        }).join('');
        box.querySelectorAll('[data-rm]').forEach(function (b, i) {
          b.onclick = function () { NXBiometric.remove(); renderAccounts(); toast('পাসকি মুছে ফেলা হয়েছে'); };
        });
      }
      var en = ov.querySelector('#nxsec-enroll');
      en.innerHTML = list.length
        ? '<button class="nxsec-btn nxsec-g" data-add>➕ আরেকটি অ্যাকাউন্ট যোগ করুন</button>'
        : '<button class="nxsec-btn nxsec-p" data-add>🔑 এই ডিভাইসে পাসকি চালু করুন</button>';
      en.querySelector('[data-add]').onclick = function () {
        en.innerHTML =
          '<input class="nxsec-inp" id="nxsec-u" placeholder="ইউজারনেম/ইমেইল" value="' + esc(me.username || me.email || '') + '">' +
          '<input class="nxsec-inp" id="nxsec-pw" type="password" placeholder="আপনার পাসওয়ার্ড (যাচাইয়ের জন্য — সেভ হয় না)">' +
          '<button class="nxsec-btn nxsec-p" id="nxsec-do" style="width:100%">👆 ফিঙ্গারপ্রিন্ট/ফেস দিয়ে পাসকি তৈরি করুন</button>';
        en.querySelector('#nxsec-do').onclick = async function () {
          var u = en.querySelector('#nxsec-u').value.trim(), pw = en.querySelector('#nxsec-pw').value;
          if (!u || !pw) { toast('ইউজারনেম ও পাসওয়ার্ড দিন', 'error'); return; }
          var b = this; b.disabled = true; b.textContent = 'অপেক্ষা করুন…';
          try { await NXBiometric.enroll(u, pw); toast('✅ পাসকি চালু হয়েছে'); renderAccounts(); }
          catch (err) { toast((err && err.message) || 'পাসকি তৈরি হয়নি', 'error'); b.disabled = false; b.textContent = '👆 আবার চেষ্টা করুন'; }
        };
      };
    }
    renderAccounts();

    ov.querySelector('#nxsec-2fa').addEventListener('change', function () { setTwoFA(this.checked); toast(this.checked ? '🔐 দুই-ধাপ যাচাই চালু' : 'দুই-ধাপ যাচাই বন্ধ'); });
    ov.querySelector('#nxsec-test2fa').onclick = function () {
      NXBiometric.gate('টেস্ট যাচাই', 'এটি একটি পরীক্ষা — ফিঙ্গারপ্রিন্ট/ফেস আনলক দিন।').then(function (ok) { toast(ok ? '✅ বায়োমেট্রিক যাচাই সফল' : 'যাচাই বাতিল/ব্যর্থ', ok ? 'success' : 'error'); });
    };

    // activity log (permission-aware)
    var logBox = ov.querySelector('#nxsec-log');
    (async function () {
      try {
        var rows = [];
        if (window.AuthService && AuthService.getActivityLog) { try { rows = await AuthService.getActivityLog(12); } catch (e) { rows = []; } }
        if (!rows.length && window.FirebaseService && FirebaseService.getAll) {
          try {
            var ACT = (typeof ACTIVITY_COLLECTION !== 'undefined') ? ACTIVITY_COLLECTION : 'activity_log';
            var all = await FirebaseService.getAll(ACT);
            rows = all.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 12);
          } catch (e) { rows = []; }
        }
        if (!rows.length) { logBox.innerHTML = '<div class="nxsec-sub">কোনো সাম্প্রতিক কার্যকলাপ দেখানো হচ্ছে না (অনুমতি/ডেটা নেই)।</div>'; return; }
        logBox.innerHTML = rows.map(function (r) {
          var lb = actionLabel(r.action);
          return '<div class="nxsec-row"><span>' + lb[0] + (r.meta && r.meta.reason ? ' <small style="color:#94a3b8">(' + esc(r.meta.reason) + ')</small>' : '') + '</span>' +
            '<span style="display:flex;gap:8px;align-items:center"><span class="nxsec-badge ' + lb[1] + '">' + esc(r.action || '') + '</span><small style="color:#94a3b8">' + ago(r.timestamp) + '</small></span></div>';
        }).join('');
      } catch (e) { logBox.innerHTML = '<div class="nxsec-sub">কার্যকলাপ লোড করা যায়নি।</div>'; }
    })();
  }

  function mount() {
    // only inside the logged-in app shell
    if (document.getElementById('nxsecFab')) return;
    var inApp = !!(window.AuthService && AuthService.isAuthenticated && AuthService.isAuthenticated())
      && (document.querySelector('.app-shell') || document.querySelector('.sidebar') || document.getElementById('logoutBtn'));
    if (!inApp) return;
    var fab = document.createElement('button');
    fab.id = 'nxsecFab'; fab.className = 'nxsec-fab'; fab.title = 'নিরাপত্তা কেন্দ্র';
    fab.innerHTML = '🛡️';
    fab.onclick = openCenter;
    document.body.appendChild(fab);
  }
  setInterval(mount, 1200);
  mount();
})();
