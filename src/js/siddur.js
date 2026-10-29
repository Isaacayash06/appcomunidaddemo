/* =============================================
   KEHILÁ — siddur.js
   Lector del Sidur (siddur.html). Adaptado del app.js del proyecto del sidur.

   - La portada y los índices vienen ya en la página (tools/build_siddur.py).
   - Cada tefilá es un fragmento aparte (siddur/<parte>.html?v=<hash>) que se
     descarga al abrirla: en el móvil solo se pinta una parte del libro.
   - La ruta va en el hash: #shajarit, #ashrei, #<sección>. window.SIDUR.where
     dice en qué parte está cada ancla. Hash vacío = portada.
   - Mientras se lee, se esconden los botones flotantes de la app y la barra
     de abajo se retira al bajar (body.sd-reading / body.sd-chrome-off).
   ============================================= */
(function () {
  'use strict';
  var DATA = window.SIDUR || { parts: [], where: {} };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement, body = document.body;
  var KEY = 'kehila_sidur_prefs', POS = 'kehila_sidur_pos';
  var PARTS = {};
  DATA.parts.forEach(function (p, i) { p.i = i; PARTS[p.id] = p; });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ───────── preferencias ───────── */
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }
  var size = prefs.size || 22;

  function applySize() {
    // Mantener a la vista el mismo párrafo al cambiar el tamaño
    var anchor = reading ? firstVisible() : null, before = anchor && anchor.getBoundingClientRect().top;
    root.style.setProperty('--fs', size + 'px'); prefs.size = size; save();
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
  }
  $('#sdBigger').onclick = function () { size = Math.min(34, size + 2); applySize(); };
  $('#sdSmaller').onclick = function () { size = Math.max(16, size - 2); applySize(); };

  function pressed(seg, attr, val) {
    $$('button', seg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))); });
  }
  var mqDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var t = prefs.theme || 'light';
    root.classList.toggle('sd-dark', t === 'dark' || (t === 'auto' && !!mqDark && mqDark.matches));
  }
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', applyTheme);
  var themeSeg = $('#sdThemeSeg'), rubSeg = $('#sdRubSeg');
  pressed(themeSeg, 'data-t', prefs.theme || 'light');
  pressed(rubSeg, 'data-r', prefs.rubrics === false ? 0 : 1);
  themeSeg.onclick = function (e) {
    var t = e.target.closest('button'); if (!t) return;
    prefs.theme = t.dataset.t; applyTheme(); pressed(themeSeg, 'data-t', prefs.theme); save();
  };
  rubSeg.onclick = function (e) {
    var t = e.target.closest('button'); if (!t) return;
    prefs.rubrics = t.dataset.r === '1'; root.classList.toggle('sd-no-rubrics', !prefs.rubrics); pressed(rubSeg, 'data-r', prefs.rubrics ? 1 : 0); save();
  };

  /* ───────── paneles ───────── */
  var drawer = $('#sdDrawer'), sheet = $('#sdSheet'), scrim = $('#sdScrim');
  function openToc() { closeSheet(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.className = 'sd-scrim on'; $('#sdOpenToc').setAttribute('aria-expanded', 'true'); revealCurrent(); }
  function closeToc() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); if (!sheet.classList.contains('open')) scrim.className = 'sd-scrim'; $('#sdOpenToc').setAttribute('aria-expanded', 'false'); }
  function openSheet() { closeToc(); sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); scrim.className = 'sd-scrim on clear'; $('#sdOpenSet').setAttribute('aria-expanded', 'true'); }
  function closeSheet() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); if (!drawer.classList.contains('open')) scrim.className = 'sd-scrim'; $('#sdOpenSet').setAttribute('aria-expanded', 'false'); }
  $('#sdOpenToc').onclick = openToc; $('#sdCloseToc').onclick = closeToc;
  $('#sdOpenSet').onclick = function () { sheet.classList.contains('open') ? closeSheet() : openSheet(); };
  scrim.onclick = function () { closeToc(); closeSheet(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeToc(); closeSheet(); } });

  /* ───────── navegación (hash) ─────────
     Los enlaces internos no saltan solos: se hace pushState con la
     profundidad (history.state.sd) para que la flecha de la barra vuelva a
     la portada con history.go(-n) sin dejar entradas sueltas, y para que el
     "atrás" de Android/navegador recorra lo leído y acabe en la portada. */
  var landing = $('#sdLanding'), reader = $('#sdReader');
  var reading = false, loadedPid = null, loadingPid = null, lastHash = null, landingY = 0, pendingOff = 0;
  if (!history.state || typeof history.state.sd !== 'number') history.replaceState({ sd: 0 }, '');

  function depth() { return (history.state && typeof history.state.sd === 'number') ? history.state.sd : 0; }
  function go(id) {
    closeToc(); closeSheet();
    if (('#' + id) === location.hash) { route(true); return; }
    history.pushState({ sd: depth() + 1 }, '', '#' + id);
    route();
  }
  function toLanding() {
    var d = depth();
    if (d > 0 && location.hash) { history.go(-d); return; }
    history.replaceState({ sd: 0 }, '', location.pathname + location.search);
    route();
  }
  $('#sdBack').onclick = toLanding;

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || !a.closest('#sd')) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (a.id === 'sdResume') return;                       // tiene su propio handler
    if (id === 'indice' || id === 'top' || id === '') {
      e.preventDefault();
      if (reading) { toLanding(); return; }
      var el = document.getElementById(id || 'top');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
      return;
    }
    if (!DATA.where[id]) return;
    e.preventDefault();
    go(id);
  });
  reader.addEventListener('click', function (e) {
    if (e.target.closest('[data-sd="retry"]')) { e.preventDefault(); loadedPid = null; route(true); }
  });
  window.addEventListener('popstate', function () { route(); });
  window.addEventListener('hashchange', function () { route(); });

  function route(force) {
    var hash = location.hash;
    if (!force && hash === lastHash) return;
    lastHash = hash;
    var id = '';
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) {}
    var pid = DATA.where[id];
    if (!pid) { showLanding(); return; }
    showReader(pid, id);
  }

  function setReading(on) {
    if (on === reading) return;
    if (on) landingY = window.scrollY;
    reading = on;
    landing.hidden = on; reader.hidden = !on;
    body.classList.toggle('sd-reading', on);
    body.classList.remove('sd-chrome-off');
  }

  function showLanding() {
    var was = reading;
    closeToc(); closeSheet();
    setReading(false);
    refreshResume();
    if (was) window.scrollTo(0, landingY);
  }

  function showReader(pid, id) {
    setReading(true);
    if (loadedPid === pid) { jump(id, true); return; }
    if (loadingPid === pid) return;
    loadingPid = pid;
    loadedPid = null; secs = []; current = null;
    $('#sdWhere').textContent = PARTS[pid].es;
    reader.innerHTML = '<div class="sd-loading"><div><div class="spin"></div><p>' + esc(PARTS[pid].es) + '</p></div></div>';
    window.scrollTo(0, 0);
    fetch('siddur/' + pid + '.html?v=' + PARTS[pid].v)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        if (loadingPid !== pid) return;
        loadingPid = null; loadedPid = pid;
        reader.innerHTML = html + endHtml(pid);
        secs = $$('.sec', reader);
        // ¿Seguimos en esta parte? (el usuario pudo volver atrás mientras cargaba)
        var now = DATA.where[decodeURIComponent(location.hash.slice(1))];
        if (now === pid) jump(decodeURIComponent(location.hash.slice(1)), false);
      })
      .catch(function () {
        if (loadingPid !== pid) return;
        loadingPid = null;
        reader.innerHTML = '<div class="sd-loading"><div><p>No se pudo cargar ' + esc(PARTS[pid].es) + '.</p>' +
          '<button type="button" data-sd="retry">Reintentar</button></div></div>';
      });
  }

  function endHtml(pid) {
    var next = DATA.parts[PARTS[pid].i + 1];
    return '<footer class="sd-end"><div class="orn big" aria-hidden="true"><i></i></div>' +
      '<p class="he amen" lang="he">אמן</p>' +
      (next ? '<a class="next" href="#' + next.id + '" lang="es"><small>Siguiente</small><span class="es">' + esc(next.es) +
        '</span><span class="he" lang="he">' + esc(next.he) + '</span></a>' : '') +
      '<a class="back" href="#indice" lang="es">Volver al índice</a></footer>';
  }

  function topOffset() { var t = $('#sdTopbar'); return (t ? t.offsetHeight : 0) + 8; }
  function jump(id, smooth) {
    var off = pendingOff; pendingOff = 0;
    var el = id && id !== loadedPid ? document.getElementById(id) : null;
    var top = el ? el.getBoundingClientRect().top + window.scrollY - topOffset() + off : 0;
    body.classList.remove('sd-chrome-off');
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !off ? 'smooth' : 'auto' });
    // Las fuentes web pueden mover el texto al terminar de cargar: recolocar
    if (el && !smooth && document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function () {
        if (loadedPid && document.getElementById(id) === el && window.scrollY === Math.max(0, top)) {
          window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - topOffset() + off));
        }
      });
    }
    requestAnimationFrame(onScroll);
  }

  /* ───────── posición actual ───────── */
  var secs = [], current = null;
  var whereEl = $('#sdWhere'), bar = $('#sdBar');

  function firstVisible() {
    var y = topOffset();
    var ps = $$('p.t, p.r, .sec-head, .half-title', reader);
    for (var i = 0; i < ps.length; i++) if (ps[i].getBoundingClientRect().bottom > y) return ps[i];
    return null;
  }
  function setWhere() {
    if (!loadedPid) return;
    var y = window.innerHeight * 0.35, hit = null;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top <= y) hit = secs[i]; else break;
    }
    var pes = PARTS[loadedPid].es, label = pes;
    if (hit && hit.dataset.es && hit.dataset.es !== pes) label = pes + ' · ' + hit.dataset.es;
    whereEl.textContent = label;
    if (hit !== current) {
      current = hit;
      $$('.toc-part li a.now', drawer).forEach(function (a) { a.classList.remove('now'); });
      if (hit) { var a = $('.toc-part a[href="#' + hit.id + '"]', drawer); if (a) a.classList.add('now'); }
    }
  }
  function revealCurrent() {
    var a = current && $('.toc-part a[href="#' + current.id + '"]', drawer);
    var d = a ? a.closest('details') : (loadedPid && $('.toc-part[data-part="' + loadedPid + '"]', drawer));
    if (d) d.open = true;
    var target = a || d;
    if (target) setTimeout(function () { target.scrollIntoView({ block: 'center' }); }, 60);
  }

  /* ───────── scroll: progreso, barras, guardado ───────── */
  var lastY = 0, ticking = false, saveT;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (!reading) { lastY = y; return; }
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    var down = y > lastY + 6, up = y < lastY - 6;
    if (down && y > 160 && !drawer.classList.contains('open') && !sheet.classList.contains('open')) body.classList.add('sd-chrome-off');
    else if (up || y < 80 || y >= h - 4) body.classList.remove('sd-chrome-off');
    lastY = y;
    setWhere();
    clearTimeout(saveT);
    saveT = setTimeout(savePos, 400);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', function () { if (reading) setWhere(); });

  function savePos() {
    if (!reading || !loadedPid || !current) return;
    var h3 = $('.sec-head h3', current);
    var pos = { pid: loadedPid, id: current.id, off: Math.round(topOffset() - current.getBoundingClientRect().top), he: h3 ? h3.textContent : '' };
    try { localStorage.setItem(POS, JSON.stringify(pos)); } catch (e) {}
  }

  /* ───────── continuar donde quedaste ───────── */
  var resume = $('#sdResume');
  function refreshResume() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(POS) || 'null'); } catch (e) {}
    if (!saved || !DATA.where[saved.id]) { resume.hidden = true; return; }
    resume.hidden = false;
    resume.setAttribute('href', '#' + saved.id);
    $('#sdResumeWhere').textContent = saved.he || (PARTS[DATA.where[saved.id]] || {}).he || '';
    resume.onclick = function (e) {
      e.preventDefault();
      pendingOff = Math.max(0, saved.off || 0);
      go(saved.id);
    };
  }

  route();
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('sd-ready'); }); });
})();
