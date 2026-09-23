/* SohozKarbar — Karbar Desk add-on (logged-in ERP / Admin)
 * Lightweight command center: khata + WA/SMS reminders, thermal reprint,
 * low-stock/expiry, PO→stock receive, report/audit shortcuts.
 * Reuses FirebaseService / Modules / existing collections. No schema change.
 */
(function () {
  'use strict';
  if (window.__NXDESK_LOADED__) return;
  window.__NXDESK_LOADED__ = true;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(msg, kind) {
    try { if (window.UI && UI.toast) { UI.toast(msg, kind || 'success'); return; } } catch (e) {}
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);background:' + (kind === 'error' ? '#dc2626' : '#0b9e6f') + ';color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;z-index:100003;box-shadow:0 10px 30px rgba(0,0,0,.25)';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2800);
  }
  function money(n) {
    n = Number(n || 0);
    try { return '৳' + n.toLocaleString('en-BD', { maximumFractionDigits: 2 }); }
    catch (e) { return '৳' + n.toFixed(2); }
  }
  function isAdmin() {
    try {
      if (window.APP_CONFIG && String(APP_CONFIG.buildType).toLowerCase() === 'admin') return true;
    } catch (e) {}
    return /admin/i.test(location.pathname || '');
  }
  function go(hash) {
    try { closeDesk(); } catch (e) {}
    location.hash = hash;
    try { if (window.App && App.loadPageFromHash) App.loadPageFromHash(); } catch (e) {}
  }
  function digits(p) { return String(p || '').replace(/\D/g, ''); }
  function waNum(p) {
    var d = digits(p);
    if (!d) return '';
    if (d.length === 11 && d.charAt(0) === '0') d = '88' + d;
    else if (d.length === 10) d = '880' + d;
    return d;
  }
  function shopName() {
    try { return (window.APP_CONFIG && APP_CONFIG.business) || 'Sohoz Karbar'; } catch (e) { return 'Sohoz Karbar'; }
  }
  function fsAll(col) {
    return Promise.resolve().then(function () {
      if (window.FirebaseService && FirebaseService.getAll) return FirebaseService.getAll(col);
      return [];
    }).catch(function () { return []; });
  }

  var CSS =
    '.nxdk-fab{position:fixed;right:18px;bottom:148px;z-index:99989;width:52px;height:52px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#1d4ed8,#0ea5e9);color:#fff;font-size:22px;box-shadow:0 10px 26px rgba(14,165,233,.4);display:flex;align-items:center;justify-content:center}' +
    '.nxdk-fab:hover{transform:translateY(-2px)}' +
    '.nxdk-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.nxdk-box{background:#fff;border-radius:16px;width:720px;max-width:96vw;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.4)}' +
    '.nxdk-hd{padding:16px 18px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:10px;background:#fff}' +
    '.nxdk-hd h3{margin:0;font-size:17px;flex:1}.nxdk-x{border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px}' +
    '.nxdk-tabs{display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap;border-bottom:1px solid #eef2f7}' +
    '.nxdk-tab{border:0;background:#f1f5f9;color:#334155;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}' +
    '.nxdk-tab.on{background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff}' +
    '.nxdk-body{padding:14px 18px 18px;overflow:auto;flex:1}' +
    '.nxdk-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}' +
    '.nxdk-kpi{border:1px solid #e6ebf2;border-radius:12px;padding:10px 12px}.nxdk-kpi b{display:block;font-size:16px}.nxdk-kpi span{font-size:11px;color:#64748b}' +
    '.nxdk-card{border:1px solid #e6ebf2;border-radius:12px;padding:12px;margin-bottom:10px}' +
    '.nxdk-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px dashed #eef2f7;font-size:13px;flex-wrap:wrap}.nxdk-row:last-child{border-bottom:0}' +
    '.nxdk-btn{border:0;border-radius:9px;padding:7px 11px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}' +
    '.nxdk-p{background:linear-gradient(135deg,#0b9e6f,#12b886);color:#fff}.nxdk-g{background:#f1f5f9;color:#334155}.nxdk-w{background:#25d366;color:#06281a}.nxdk-s{background:#0ea5e9;color:#fff}.nxdk-r{background:#fee2e2;color:#b91c1c}' +
    '.nxdk-sub{color:#64748b;font-size:12px;margin:0 0 10px;line-height:1.5}' +
    '.nxdk-empty{text-align:center;color:#94a3b8;padding:22px 8px;font-size:13px}' +
    '.nxdk-pill{font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;background:#e0f2fe;color:#075985}' +
    '.nxdk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}' +
    '.nxdk-jump{border:1px solid #e6ebf2;border-radius:12px;padding:12px;cursor:pointer;background:#fff;text-align:left;font-family:inherit}' +
    '.nxdk-jump:hover{border-color:#0ea5e9;background:#f0f9ff}.nxdk-jump b{display:block;font-size:13px;margin-bottom:2px}.nxdk-jump small{color:#64748b}';

  var ovEl = null;
  function closeDesk() { if (ovEl) { ovEl.remove(); ovEl = null; } }

  function remindText(row) {
    var inv = (row.invoices && row.invoices[0]) || {};
    var no = inv.invoiceNo || inv.id || '';
    return 'আসসালামু আলাইকুম ' + (row.name || '') + ',\n' +
      shopName() + ' এ আপনার বকেয়া ' + money(row.due) + ' টাকা আছে' + (no ? ' (ইনভয়েস ' + no + ')' : '') + '।\n' +
      'অনুগ্রহ করে সুবিধামতো পরিশোধ করুন। ধন্যবাদ।';
  }
  function logFollowup(row, channel) {
    try {
      if (window.FirebaseService && FirebaseService.add) {
        FirebaseService.add('due_followups', {
          customerId: row.id || '',
          customerName: row.name || '',
          amount: Number(row.due || 0),
          channel: channel,
          at: Date.now(),
          createdBy: (window.AuthService && AuthService.currentUser && (AuthService.currentUser.id || AuthService.currentUser.username)) || ''
        }).catch(function () {});
      }
    } catch (e) {}
  }

  async function loadDues() {
    var inv = await fsAll('invoices');
    var cust = await fsAll('customers');
    var cmap = {};
    (cust || []).forEach(function (c) { cmap[c.id] = c; });
    var by = {};
    (inv || []).forEach(function (x) {
      var due = Number(x.dueAmount || 0);
      if (!(due > 0)) return;
      var k = x.customerId || x.customerName || 'walkin';
      if (!by[k]) {
        var c = cmap[x.customerId] || {};
        by[k] = {
          id: x.customerId || k,
          name: c.name || x.customerName || 'Walk-in',
          phone: c.phone || x.customerPhone || '',
          due: 0, n: 0, invoices: [], last: 0
        };
      }
      by[k].due += due;
      by[k].n += 1;
      by[k].invoices.push(x);
      by[k].last = Math.max(by[k].last, Number(x.date || x.createdAt || 0));
      if (!by[k].phone && (x.customerPhone || (cmap[x.customerId] && cmap[x.customerId].phone))) {
        by[k].phone = x.customerPhone || cmap[x.customerId].phone;
      }
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.due - a.due; });
  }

  function thermalPrint(inv) {
    if (window.Modules && Modules.sales && typeof Modules.sales._print === 'function') {
      try { Modules.sales._print(inv.id); return; } catch (e) {}
    }
    var items = (inv.items || []).map(function (it) {
      return (it.qty || 1) + ' x ' + (it.productName || it.name || 'আইটেম') + '  ' + money(it.total || it.price || 0);
    }).join('\n');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>' +
      '<style>body{font-family:ui-monospace,monospace;width:72mm;margin:8px auto;font-size:12px;color:#111}h1{font-size:14px;margin:0;text-align:center}hr{border:0;border-top:1px dashed #333}pre{white-space:pre-wrap}</style></head><body>' +
      '<h1>' + esc(shopName()) + '</h1>' +
      '<div style="text-align:center">থার্মাল রসিদ</div><hr>' +
      '<div>ইনভয়েস: ' + esc(inv.invoiceNo || inv.id || '') + '</div>' +
      '<div>গ্রাহক: ' + esc(inv.customerName || 'Walk-in') + '</div>' +
      '<div>তারিখ: ' + esc(new Date(inv.date || inv.createdAt || Date.now()).toLocaleString()) + '</div><hr>' +
      '<pre>' + esc(items) + '</pre><hr>' +
      '<div>মোট: <b>' + money(inv.total || 0) + '</b></div>' +
      '<div>জমা: ' + money(inv.paidAmount || 0) + '</div>' +
      '<div>বাকি: <b>' + money(inv.dueAmount || 0) + '</b></div>' +
      '<hr><div style="text-align:center">ধন্যবাদ</div>' +
      '</body></html>';
    var w = window.open('', '_blank', 'width=360,height=640');
    if (!w) { toast('পপআপ ব্লক হয়েছে', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) {} }, 250);
  }

  async function tabKhata(body) {
    body.innerHTML = '<div class="nxdk-empty">খাতা লোড হচ্ছে…</div>';
    var rows = [];
    try { rows = await loadDues(); } catch (e) { rows = []; }
    var total = rows.reduce(function (s, r) { return s + r.due; }, 0);
    if (!rows.length) {
      body.innerHTML = '<div class="nxdk-kpis"><div class="nxdk-kpi"><b>' + money(0) + '</b><span>মোট বকেয়া</span></div></div>' +
        '<div class="nxdk-empty">কোনো বকেয়া খাতা নেই। নতুন বাকি বিক্রি POS বা সেলস থেকে হবে।</div>' +
        '<button class="nxdk-btn nxdk-p" data-go="due-collection-pro">ডিউ কালেকশন সেন্টার</button> ' +
        '<button class="nxdk-btn nxdk-g" data-go="installments">কিস্তি ট্র্যাকার</button>';
      bindJumps(body);
      return;
    }
    body.innerHTML =
      '<div class="nxdk-kpis">' +
        '<div class="nxdk-kpi"><b>' + money(total) + '</b><span>মোট বকেয়া</span></div>' +
        '<div class="nxdk-kpi"><b>' + rows.length + '</b><span>খাতা গ্রাহক</span></div>' +
        '<div class="nxdk-kpi"><b>' + rows.reduce(function (s, r) { return s + r.n; }, 0) + '</b><span>বাকি ইনভয়েস</span></div>' +
      '</div>' +
      '<p class="nxdk-sub">হোয়াটসঅ্যাপ বা এসএমএস রিমাইন্ডার — ফোন নম্বর গ্রাহক/ইনভয়েস থেকে। পাসওয়ার্ড বা লাইসেন্স বদলায় না।</p>' +
      rows.slice(0, 40).map(function (r, i) {
        var ph = waNum(r.phone);
        var msg = encodeURIComponent(remindText(r));
        var wa = ph ? 'https://wa.me/' + ph + '?text=' + msg : '';
        var sms = ph ? 'sms:+' + ph + '?body=' + msg : '';
        return '<div class="nxdk-card" data-i="' + i + '">' +
          '<div class="nxdk-row"><span><b>' + esc(r.name) + '</b> <span class="nxdk-pill">' + r.n + ' বিল</span><br><small style="color:#94a3b8">' + esc(r.phone || 'ফোন নেই') +
          (r.last ? ' · ' + new Date(r.last).toLocaleDateString() : '') + '</small></span>' +
          '<b style="color:#b91c1c">' + money(r.due) + '</b></div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
            (wa ? '<a class="nxdk-btn nxdk-w" target="_blank" rel="noopener" href="' + wa + '" data-ch="whatsapp">WhatsApp</a>' : '<span class="nxdk-btn nxdk-g">WhatsApp (ফোন নেই)</span>') +
            (sms ? '<a class="nxdk-btn nxdk-s" href="' + sms + '" data-ch="sms">এসএমএস</a>' : '') +
            '<button class="nxdk-btn nxdk-g" data-go="due-collection-pro">আদায়</button>' +
          '</div></div>';
      }).join('') +
      '<button class="nxdk-btn nxdk-p" data-go="due-collection-pro">পুরো ডিউ সেন্টার</button> ' +
      '<button class="nxdk-btn nxdk-g" data-go="installments">কিস্তি</button> ' +
      '<button class="nxdk-btn nxdk-g" data-go="customer-aging">এজিং</button>';
    bindJumps(body);
    body.querySelectorAll('[data-ch]').forEach(function (a) {
      a.addEventListener('click', function () {
        var card = a.closest('[data-i]');
        var i = card ? Number(card.getAttribute('data-i')) : -1;
        if (i >= 0 && rows[i]) { logFollowup(rows[i], a.getAttribute('data-ch')); toast('রিমাইন্ডার খোলা হয়েছে'); }
      });
    });
  }

  async function tabPos(body) {
    body.innerHTML = '<div class="nxdk-empty">রসিদ লোড হচ্ছে…</div>';
    var inv = await fsAll('invoices');
    inv = (inv || []).slice().sort(function (a, b) { return Number(b.date || b.createdAt || 0) - Number(a.date || a.createdAt || 0); });
    var today0 = new Date(); today0.setHours(0, 0, 0, 0);
    var t0 = today0.getTime();
    var today = inv.filter(function (x) { return Number(x.date || x.createdAt || 0) >= t0; });
    var sales = today.reduce(function (s, x) { return s + Number(x.total || 0); }, 0);
    body.innerHTML =
      '<div class="nxdk-kpis">' +
        '<div class="nxdk-kpi"><b>' + money(sales) + '</b><span>আজকের বিক্রি</span></div>' +
        '<div class="nxdk-kpi"><b>' + today.length + '</b><span>আজকের বিল</span></div>' +
        '<div class="nxdk-kpi"><b>' + inv.length + '</b><span>মোট ইনভয়েস</span></div>' +
      '</div>' +
      '<div class="nxdk-grid" style="margin-bottom:12px">' +
        '<button class="nxdk-jump" data-go="pos"><b>⚡ স্মার্ট POS</b><small>বারকোড স্ক্যান · দ্রুত বিল</small></button>' +
        '<button class="nxdk-jump" data-go="quick-pos"><b>🛒 কুইক POS</b><small>দ্রুত কাউন্টার</small></button>' +
        '<button class="nxdk-jump" data-go="sales"><b>🧾 সেলস</b><small>ইনভয়েস তালিকা</small></button>' +
        '<button class="nxdk-jump" data-go="sticker-print"><b>🏷️ বারকোড লেবেল</b><small>স্টিকার প্রিন্ট</small></button>' +
      '</div>' +
      '<p class="nxdk-sub">শেষ ইনভয়েস — থার্মাল/৮০মিমি রসিদ (কোর প্রিন্ট থাকলে সেটাই, নাহলে এই ডেস্কের রসিদ)।</p>' +
      (inv.slice(0, 8).map(function (x, i) {
        return '<div class="nxdk-row"><span><b>' + esc(x.invoiceNo || x.id || '') + '</b><br><small style="color:#94a3b8">' + esc(x.customerName || 'Walk-in') + ' · ' + money(x.total || 0) +
          (Number(x.dueAmount || 0) > 0 ? ' · বাকি ' + money(x.dueAmount) : '') + '</small></span>' +
          '<button class="nxdk-btn nxdk-p" data-th="' + i + '">🖨️ থার্মাল</button></div>';
      }).join('') || '<div class="nxdk-empty">এখনো কোনো ইনভয়েস নেই।</div>');
    bindJumps(body);
    body.querySelectorAll('[data-th]').forEach(function (b) {
      b.onclick = function () {
        var x = inv[Number(b.getAttribute('data-th'))];
        if (x) thermalPrint(x);
      };
    });
  }

  async function tabStock(body) {
    body.innerHTML = '<div class="nxdk-empty">স্টক লোড হচ্ছে…</div>';
    var products = await fsAll('products');
    var pos = await fsAll('purchase_orders');
    products = products || []; pos = pos || [];
    var low = products.filter(function (p) { return Number(p.stock || 0) <= Number(p.minStock || p.reorderLevel || 5); })
      .sort(function (a, b) { return Number(a.stock || 0) - Number(b.stock || 0); });
    function expMs(v) {
      if (!v) return null;
      var n = Number(v);
      if (!isNaN(n) && n > 1e11) return n;
      var d = new Date(v); return isNaN(d.getTime()) ? null : d.getTime();
    }
    var soon = products.map(function (p) { return { p: p, ms: expMs(p.expiryDate) }; })
      .filter(function (x) { return x.ms != null; })
      .map(function (x) { x.d = Math.ceil((x.ms - Date.now()) / 86400000); return x; })
      .filter(function (x) { return x.d <= 30; })
      .sort(function (a, b) { return a.d - b.d; });
    var openPo = pos.filter(function (o) { return String(o.status || '').toLowerCase() !== 'received'; });
    body.innerHTML =
      '<div class="nxdk-kpis">' +
        '<div class="nxdk-kpi"><b>' + low.length + '</b><span>লো-স্টক</span></div>' +
        '<div class="nxdk-kpi"><b>' + soon.length + '</b><span>মেয়াদ ≤৩০ দিন</span></div>' +
        '<div class="nxdk-kpi"><b>' + openPo.length + '</b><span>অপ্রাপ্ত PO</span></div>' +
      '</div>' +
      '<div class="nxdk-grid" style="margin-bottom:12px">' +
        '<button class="nxdk-jump" data-go="inventory"><b>📦 ইনভেন্টরি</b><small>মাল্টি-ওয়্যারহাউস</small></button>' +
        '<button class="nxdk-jump" data-go="purchases"><b>🛍️ ক্রয়</b><small>পারচেজ বিল</small></button>' +
        '<button class="nxdk-jump" data-go="purchase-orders"><b>📥 পারচেজ অর্ডার</b><small>রিসিভ = স্টক বাড়ে</small></button>' +
        '<button class="nxdk-jump" data-go="batch-expiry"><b>⏳ ব্যাচ/মেয়াদ</b><small>এক্সপায়ারি</small></button>' +
        '<button class="nxdk-jump" data-go="sticker-print"><b>🏷️ লেবেল</b><small>বারকোড স্টিকার</small></button>' +
        '<button class="nxdk-jump" data-go="suppliers"><b>🤝 সাপ্লায়ার</b><small>লেজার / পেমেন্ট</small></button>' +
      '</div>' +
      '<div class="nxdk-card"><h4 style="margin:0 0 8px;font-size:13px">অপ্রাপ্ত PO — রিসিভ করলে স্টক বাড়বে</h4>' +
      (openPo.slice(0, 8).map(function (o, i) {
        return '<div class="nxdk-row"><span><b>' + esc(o.poNo || o.id || '') + '</b><br><small style="color:#94a3b8">' + esc(o.supplierName || '') + ' · ' + money(o.total || 0) + '</small></span>' +
          '<button class="nxdk-btn nxdk-p" data-recv="' + i + '">✅ রিসিভ → স্টক</button></div>';
      }).join('') || '<div class="nxdk-sub">কোনো খোলা PO নেই।</div>') + '</div>' +
      '<div class="nxdk-card"><h4 style="margin:0 0 8px;font-size:13px">লো স্টক</h4>' +
      (low.slice(0, 8).map(function (p) {
        return '<div class="nxdk-row"><span>' + esc(p.name || p.sku || '') + '</span><span class="nxdk-pill">' + esc(String(p.stock || 0)) + '</span></div>';
      }).join('') || '<div class="nxdk-sub">লো-স্টক নেই।</div>') + '</div>' +
      '<div class="nxdk-card"><h4 style="margin:0 0 8px;font-size:13px">মেয়াদ সতর্কতা</h4>' +
      (soon.slice(0, 8).map(function (x) {
        var badge = x.d < 0 ? 'মেয়াদোত্তীর্ণ' : (x.d + ' দিন');
        return '<div class="nxdk-row"><span>' + esc(x.p.name || '') + '</span><span class="nxdk-pill">' + esc(badge) + '</span></div>';
      }).join('') || '<div class="nxdk-sub">৩০ দিনের মধ্যে মেয়াদ নেই।</div>') + '</div>';
    bindJumps(body);
    body.querySelectorAll('[data-recv]').forEach(function (b) {
      b.onclick = async function () {
        var o = openPo[Number(b.getAttribute('data-recv'))];
        if (!o) return;
        b.disabled = true; b.textContent = 'অপেক্ষা…';
        try {
          if (window.Modules && Modules['purchase-orders'] && typeof Modules['purchase-orders']._receive === 'function') {
            await Modules['purchase-orders']._receive(o.id);
            toast('PO রিসিভ — স্টক আপডেট');
            tabStock(body);
          } else {
            go('purchase-orders');
          }
        } catch (err) {
          toast((err && err.message) || 'রিসিভ হয়নি', 'error');
          b.disabled = false; b.textContent = '✅ রিসিভ → স্টক';
        }
      };
    });
  }

  async function tabReports(body) {
    var logs = [];
    try {
      if (window.AuthService && AuthService.getActivityLog) logs = await AuthService.getActivityLog(8);
    } catch (e) { logs = []; }
    if (!logs.length) {
      try {
        var all = await fsAll((typeof ACTIVITY_COLLECTION !== 'undefined') ? ACTIVITY_COLLECTION : 'activity_log');
        logs = (all || []).sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }).slice(0, 8);
      } catch (e) { logs = []; }
    }
    var users = [];
    try { users = (await fsAll('users')).filter(function (u) { return !u.hidden; }); } catch (e) { users = []; }
    body.innerHTML =
      '<div class="nxdk-grid" style="margin-bottom:12px">' +
        '<button class="nxdk-jump" data-go="cash-book"><b>📒 ক্যাশবুক</b><small>নগদ খাতা</small></button>' +
        '<button class="nxdk-jump" data-go="profit-loss"><b>📈 পিএন্ডএল</b><small>লাভ-ক্ষতি</small></button>' +
        '<button class="nxdk-jump" data-go="customer-aging"><b>⏳ গ্রাহক এজিং</b><small>বকেয়া বয়স</small></button>' +
        '<button class="nxdk-jump" data-go="vat-return-center"><b>🧾 ভ্যাট</b><small>রিটার্ন সেন্টার</small></button>' +
        '<button class="nxdk-jump" data-go="audit"><b>🕵️ অডিট লগ</b><small>কার্যকলাপ</small></button>' +
        '<button class="nxdk-jump" data-go="local-backup"><b>💾 ব্যাকআপ</b><small>এক্সপোর্ট</small></button>' +
        '<button class="nxdk-jump" data-go="advanced-permissions"><b>🔑 রোল/পারমিশন</b><small>ইউজার অধিকার</small></button>' +
        '<button class="nxdk-jump" data-go="dashboard"><b>🏠 ড্যাশবোর্ড</b><small>চার্ট · লো-স্টক</small></button>' +
      '</div>' +
      '<div class="nxdk-card"><h4 style="margin:0 0 8px;font-size:13px">ইউজার ও রোল</h4>' +
      (users.slice(0, 10).map(function (u) {
        return '<div class="nxdk-row"><span>' + esc(u.name || u.username || u.id) + '</span><span class="nxdk-pill">' + esc(u.role || 'user') + '</span></div>';
      }).join('') || '<div class="nxdk-sub">ইউজার তালিকা পাওয়া যায়নি।</div>') + '</div>' +
      '<div class="nxdk-card"><h4 style="margin:0 0 8px;font-size:13px">সাম্প্রতিক অডিট</h4>' +
      (logs.map(function (r) {
        return '<div class="nxdk-row"><span>' + esc(r.action || '') + '</span><small style="color:#94a3b8">' + (r.timestamp ? new Date(r.timestamp).toLocaleString() : '') + '</small></div>';
      }).join('') || '<div class="nxdk-sub">অডিট খালি বা অনুমতি নেই।</div>') + '</div>';
    bindJumps(body);
  }

  function tabAdmin(body) {
    body.innerHTML =
      '<p class="nxdk-sub">অ্যাডমিন শর্টকাট — কোর লাইসেন্স/সাবস্ক্রিপশন স্ক্রিনে নিয়ে যায়। স্কিমা বা প্রাইসিং বদলায় না।</p>' +
      '<div class="nxdk-grid">' +
        '<button class="nxdk-jump" data-go="license-settings"><b>🔑 লাইসেন্স সেটিংস</b><small>তৈরি / নবায়ন</small></button>' +
        '<button class="nxdk-jump" data-go="active-users"><b>👥 সক্রিয় ইউজার</b><small>ডিভাইস সেশন</small></button>' +
        '<button class="nxdk-jump" data-go="audit"><b>🕵️ অডিট</b><small>রিমোট লগ</small></button>' +
        '<button class="nxdk-jump" data-go="feature-manager"><b>🧩 ফিচার ম্যানেজার</b><small>মডিউল চালু/বন্ধ</small></button>' +
      '</div>' +
      '<p class="nxdk-sub" style="margin-top:12px">রিমোট ডিঅ্যাক্টিভেশন সংবেদনশীল — নিরাপত্তা কেন্দ্রের ২এফএ চালু থাকলে বায়োমেট্রিক চাইবে।</p>' +
      '<button class="nxdk-btn nxdk-g" id="nxdk-sec">🛡️ নিরাপত্তা কেন্দ্র খুলুন</button>';
    bindJumps(body);
    var s = body.querySelector('#nxdk-sec');
    if (s) s.onclick = function () {
      closeDesk();
      var fab = document.getElementById('nxsecFab');
      if (fab) fab.click();
    };
  }

  function bindJumps(root) {
    root.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function (e) { e.preventDefault(); go(b.getAttribute('data-go')); };
    });
  }

  function openDesk(tab) {
    closeDesk();
    if (!document.getElementById('nxdk-css')) {
      var st = document.createElement('style'); st.id = 'nxdk-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    var ov = document.createElement('div'); ov.className = 'nxdk-ov'; ovEl = ov;
    var tabs = [
      ['khata', '📒 খাতা'],
      ['pos', '⚡ POS'],
      ['stock', '📦 স্টক/ক্রয়'],
      ['rep', '📊 রিপোর্ট']
    ];
    if (isAdmin()) tabs.push(['adm', '🔑 অ্যাডমিন']);
    ov.innerHTML =
      '<div class="nxdk-box">' +
        '<div class="nxdk-hd"><b>🏪</b><h3>কারবার ডেস্ক</h3><button class="nxdk-x" data-x>✕</button></div>' +
        '<div class="nxdk-tabs">' + tabs.map(function (t) {
          return '<button class="nxdk-tab' + (t[0] === (tab || 'khata') ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="nxdk-body" id="nxdkBody"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').onclick = closeDesk;
    ov.onclick = function (e) { if (e.target === ov) closeDesk(); };
    function show(id) {
      ov.querySelectorAll('.nxdk-tab').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === id); });
      var body = ov.querySelector('#nxdkBody');
      if (id === 'khata') tabKhata(body);
      else if (id === 'pos') tabPos(body);
      else if (id === 'stock') tabStock(body);
      else if (id === 'rep') tabReports(body);
      else tabAdmin(body);
    }
    ov.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { show(b.getAttribute('data-tab')); };
    });
    show(tab || 'khata');
  }

  function mount() {
    if (document.getElementById('nxdkFab')) return;
    var inApp = !!(window.AuthService && AuthService.isAuthenticated && AuthService.isAuthenticated())
      && (document.querySelector('.app-shell') || document.querySelector('.sidebar') || document.getElementById('logoutBtn'));
    if (!inApp) return;
    var fab = document.createElement('button');
    fab.id = 'nxdkFab'; fab.className = 'nxdk-fab'; fab.title = 'কারবার ডেস্ক';
    fab.innerHTML = '📒';
    fab.onclick = function () { openDesk('khata'); };
    document.body.appendChild(fab);
  }

  window.NXKarbarDesk = {
    open: openDesk,
    close: closeDesk,
    loadDues: loadDues,
    thermalPrint: thermalPrint,
    waNum: waNum
  };
  setInterval(mount, 1200);
  mount();
})();
