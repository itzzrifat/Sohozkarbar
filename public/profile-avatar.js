/* SohozKarbar — profile photo actually shows (topbar + sidebar + My Profile)
 * The core uploader saved the picture but painted a letter because the shell
 * avatars have no <img> and the topbar selector did not match. iPhone camera
 * files often have an empty MIME type / HEIC, so the original picker rejected them.
 */
(function () {
  'use strict';
  if (window.__NXAVATAR_LOADED__) return;
  window.__NXAVATAR_LOADED__ = true;

  var CSS =
    '.avatar{overflow:hidden!important;}' +
    '.avatar img,#p_avatarBox img{width:100%!important;height:100%!important;object-fit:cover!important;display:block;border-radius:50%;}' +
    '#p_avatarBox{overflow:hidden!important;}' +
    '.full-page-form-footer{background:var(--card)!important;}' +
    '@media(max-width:767px){' +
    '.full-page-form-footer{bottom:calc(76px + env(safe-area-inset-bottom,0px));}' +
    '.mobile-bottom-nav{bottom:calc(8px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);}' +
    '}';

  function injectCSS() {
    if (document.getElementById('nxAvatarCSS')) return;
    var s = document.createElement('style');
    s.id = 'nxAvatarCSS';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function current() {
    try { return (window.AuthService && AuthService.currentUser) || null; } catch (e) { return null; }
  }
  function photoOf(u) {
    if (!u) return '';
    var p = u.photo || u.avatar || u.profilePhoto || '';
    return (typeof p === 'string' && p.indexOf('data:image') === 0) || /^https?:\/\//.test(p) ? p : '';
  }

  function setBox(el, uri, letter) {
    if (!el) return;
    if (uri) {
      var img = el.querySelector('img');
      if (img && img.getAttribute('src') === uri) return;
      el.innerHTML = '<img alt="" src="' + uri + '">';
    } else if (letter && !el.querySelector('img')) {
      /* leave existing letter */
    }
  }

  function paint() {
    var u = current();
    if (!u) return;
    var uri = photoOf(u);
    var letter = String(u.name || u.username || 'U').charAt(0).toUpperCase();
    document.querySelectorAll('.user-menu .avatar, .sidebar-footer .avatar, #p_avatarBox, #topbarAvatar, #sidebarAvatar').forEach(function (el) {
      setBox(el, uri, letter);
    });
  }

  async function refreshFromCloud() {
    try {
      var u = current();
      if (!u || !u.id || !window.FirebaseService || !FirebaseService.getById) return;
      var fresh = await FirebaseService.getById('users', u.id, { force: true });
      if (fresh && fresh.photo) {
        u.photo = fresh.photo;
        paint();
      }
    } catch (e) {}
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Could not read that file')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That file is not a valid image')); };
        img.onload = function () {
          var S = 256;
          var side = Math.min(img.width, img.height) || 1;
          var sx = (img.width - side) / 2;
          var sy = (img.height - side) / 2;
          var cv = document.createElement('canvas');
          cv.width = S; cv.height = S;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function isImageFile(f) {
    if (!f) return false;
    if (!f.type || /^image\//.test(f.type)) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(f.name || '');
  }

  async function persist(uri) {
    var u = current();
    if (!u || !u.id) throw new Error('Not signed in');
    await AuthService.updateUser(u.id, { photo: uri });
    try {
      AuthService.currentUser.photo = uri;
      if (typeof AuthService._saveSession === 'function') {
        var remember = false;
        try { remember = !!(localStorage.getItem('erp_admin_remember') || localStorage.getItem('erp_customer_remember')); } catch (e) {}
        AuthService._saveSession(AuthService.currentUser, remember);
      }
    } catch (e) {}
  }

  function toast(msg, kind) {
    try { if (window.UI && UI.toast) { UI.toast(msg, kind || 'success'); return; } } catch (e) {}
  }

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || t.id !== 'p_photoFile') return;
    var f = t.files && t.files[0];
    t.value = '';
    if (!f) return;
    if (!isImageFile(f)) { toast('Please choose an image file', 'warning'); return; }
    if (f.size > 8 * 1024 * 1024) { toast('Image is too large — maximum 8 MB', 'warning'); return; }
    var box = document.getElementById('p_avatarBox');
    var old = box ? box.innerHTML : '';
    if (box) box.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:22px;"></i>';
    Promise.resolve()
      .then(function () { return shrink(f); })
      .then(function (uri) { return persist(uri).then(function () { return uri; }); })
      .then(function (uri) {
        if (box) box.innerHTML = '<img id="p_avatarImg" alt="" src="' + uri + '">';
        var actions = document.getElementById('p_photoActions');
        if (actions) actions.style.display = '';
        paint();
        toast('Profile picture updated', 'success');
      })
      .catch(function (e) {
        if (box) box.innerHTML = old;
        toast('Could not save the picture: ' + ((e && e.message) || e), 'danger');
      });
  }, true);

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('#p_photoRemove') : null;
    if (!t) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (!confirm('Remove your profile picture?')) return;
    persist('')
      .then(function () {
        var u = current();
        var letter = String((u && (u.name || u.username)) || 'U').charAt(0).toUpperCase();
        var box = document.getElementById('p_avatarBox');
        if (box) box.textContent = letter;
        var actions = document.getElementById('p_photoActions');
        if (actions) actions.style.display = 'none';
        document.querySelectorAll('.user-menu .avatar, .sidebar-footer .avatar').forEach(function (el) { el.textContent = letter; });
        toast('Profile picture removed', 'success');
      })
      .catch(function () { toast('Could not remove the picture', 'danger'); });
  }, true);

  function boot() {
    injectCSS();
    paint();
    if (/profile/i.test(location.hash || '')) refreshFromCloud();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('hashchange', function () {
    paint();
    if (/profile/i.test(location.hash || '')) refreshFromCloud();
  });
  setInterval(paint, 4000);
})();
