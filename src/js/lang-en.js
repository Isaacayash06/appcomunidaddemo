/* =============================================
   KEHILÁ — lang-en.js
   Modo inglés de TODA la app (botón ES/EN).

   Se carga en el <head> de cada página. Si el idioma guardado es 'en',
   carga el diccionario (js/lang-en-dict.js) y traduce el texto visible
   de la página —incluido el que los scripts pintan después— sin tocar
   el HTML ni la lógica: solo nodos de texto y atributos visibles
   (placeholder, title, aria-label, alt, value de botones).
   Nunca toca imágenes, inputs que escribe el usuario ni datos.

   Cambiar de idioma recarga la página: así no queda nada a medias.
   Ojo: el nombre del archivo NO debe contener "i18n" (nav.js usa
   script[src*="i18n"] para decidir si carga js/i18n.js).
   ============================================= */
(function () {
  var KEY = 'kehila_lang';
  function readLang() { try { return localStorage.getItem(KEY) || 'es'; } catch (e) { return 'es'; } }
  var LANG = readLang();
  window.__kehilaLang = LANG;

  function switchLang(next) {
    try { localStorage.setItem(KEY, next); } catch (e) {}
    location.reload();
  }
  window.kehilaToggleLang = function () { switchLang(readLang() === 'en' ? 'es' : 'en'); };

  // Los botones existentes (sidebar, cajón "Más", login) llaman a toggleLang().
  // js/i18n.js lo define en algunas páginas; lo sustituimos tras cargar todo
  // para que en todas las páginas cambie el idioma completo (con recarga).
  if (typeof window.getLang !== 'function') window.getLang = readLang;
  if (typeof window.toggleLang !== 'function') window.toggleLang = window.kehilaToggleLang;

  function addFloatingButton() {
    if (document.getElementById('kehila-lang-fab')) return;
    // El login ya tiene su propio botón de idioma fijo arriba a la derecha.
    if (document.querySelector('body > .lang-toggle-btn')) return;
    var b = document.createElement('button');
    b.id = 'kehila-lang-fab';
    b.type = 'button';
    b.className = 'notranslate';
    b.setAttribute('aria-label', LANG === 'en' ? 'Cambiar a español' : 'Switch to English');
    b.innerHTML = LANG === 'en'
      ? '<span aria-hidden="true">🇪🇸</span> ES'
      : '<span aria-hidden="true">🇺🇸</span> EN';
    b.onclick = window.kehilaToggleLang;
    document.body.appendChild(b);
    var st = document.createElement('style');
    st.textContent =
      '#kehila-lang-fab{position:fixed;right:14px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9000;' +
      'display:flex;align-items:center;gap:6px;font:800 13px/1 system-ui,-apple-system,sans-serif;letter-spacing:.03em;' +
      'color:#1B2E5E;background:#F5C542;border:none;border-radius:22px;padding:9px 14px;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.28);-webkit-tap-highlight-color:transparent}' +
      '#kehila-lang-fab:active{transform:scale(.96)}' +
      '@media (min-width:1024px){#kehila-lang-fab{bottom:20px;right:20px}}';
    document.head.appendChild(st);
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.toggleLang = window.kehilaToggleLang;
    window.setLang = function (l) { switchLang(l === 'en' ? 'en' : 'es'); };
    addFloatingButton();
  });

  if (LANG !== 'en') return;

  /* ───────────── Modo inglés ───────────── */
  document.documentElement.lang = 'en';
  // Diccionario síncrono: así el texto se traduce mientras se pinta, sin parpadeo en español.
  if (!window.__KEHILA_EN) document.write('<script src="js/lang-en-dict.js"><\/script>');

  // Fechas y números: 'es-ES' → 'en-US' (solo formato visible; no cambia ningún dato).
  function mapLoc(l) {
    if (l === undefined || l === null) return 'en-US';
    if (typeof l === 'string' && /^es(\b|-|_|$)/i.test(l)) return 'en-US';
    if (Array.isArray(l)) return l.map(mapLoc);
    return l;
  }
  ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(function (m) {
    var orig = Date.prototype[m];
    Date.prototype[m] = function (loc, opts) { return orig.call(this, mapLoc(loc), opts); };
  });
  var numOrig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opts) { return numOrig.call(this, mapLoc(loc), opts); };
  var NF = Intl.NumberFormat;
  Intl.NumberFormat = function (loc, opts) { return new NF(mapLoc(loc), opts); };
  Intl.NumberFormat.prototype = NF.prototype;
  Intl.NumberFormat.supportedLocalesOf = NF.supportedLocalesOf;

  var D = null, PATS = null, PREFIX = null, SUBS = null;
  var cache = new Map();
  var LETTER = /[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]/;

  function init() {
    if (D) return true;
    var src = window.__KEHILA_EN;
    if (!src) return false;
    D = src.exact;
    PATS = src.patterns.map(function (p) { return [new RegExp(p[0]), p[1]]; });
    // Claves que terminan en ':' sirven de prefijo ("Error al guardar: <detalle>").
    PREFIX = Object.keys(D).filter(function (k) { return /:$/.test(k) && k.length > 4; })
      .sort(function (a, b) { return b.length - a.length; });
    // Frases largas que aparecen dentro de textos montados por código
    // ('¿Eliminar la solicitud de "' + nombre + '"? Esta acción no se puede deshacer.')
    SUBS = Object.keys(D).filter(function (k) { return k.length >= 14 && k.indexOf(' ') > 0; })
      .sort(function (a, b) { return b.length - a.length; });
    return true;
  }

  var MONTHS = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', setiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };
  var DAYS = { lunes: 'Monday', martes: 'Tuesday', 'miércoles': 'Wednesday', jueves: 'Thursday', viernes: 'Friday', 'sábado': 'Saturday', domingo: 'Sunday' };
  var MON_RX = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
  
  // "22 de octubre de 2026" → "October 22, 2026"; "lunes" → "Monday"; etc.
  function fixDates(s) {
    var out = s
      .replace(new RegExp('\\b(\\d{1,2}) de ' + MON_RX + '(?: de (\\d{4}))?', 'gi'), function (m, d, mo, y) {
        return MONTHS[mo.toLowerCase()] + ' ' + d + (y ? ', ' + y : '');
      })
      .replace(new RegExp('\\b' + MON_RX + ' de (\\d{4})', 'gi'), function (m, mo, y) { return MONTHS[mo.toLowerCase()] + ' ' + y; })
      .replace(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/gi, function (m) { return DAYS[m.toLowerCase()]; })
      .replace(new RegExp('\\b' + MON_RX + '\\b', 'gi'), function (m) { return MONTHS[m.toLowerCase()]; });
    return out;
  }

  function trPiece(v) {
    if (v === '') return '';
    if (/^(s|es)$/.test(v)) return 's';
    if (D[v]) return D[v];
    var lower = v.toLowerCase();
    if (D[lower]) return D[lower];
    return v;
  }

  function fill(tpl, caps) {
    var i = 0;
    return tpl.replace(/\{(\d*)\}/g, function (m, n) {
      var v = n === '' ? caps[i++] : caps[+n];
      return v === undefined ? '' : trPiece(v);
    });
  }

  function core(t) {
    if (D[t]) return D[t];
    // Mayúsculas por CSS no afectan, pero hay textos en MAYÚSCULAS en el código.
    var i, m;
    for (i = 0; i < PATS.length; i++) {
      m = PATS[i][0].exec(t);
      if (m) return fill(PATS[i][1], m.slice(1));
    }
    // Separar decoración inicial/final: "📅 Evento", "Nombre:", "Guardar →", "(opcional)"
    m = /^([^A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]*)(.*?)([\s:.,;*…!?→←↗✓·)\]]*)$/.exec(t);
    if (m && (m[1] || m[3]) && m[2]) {
      var inner = D[m[2]] || null;
      if (!inner) {
        for (i = 0; i < PATS.length; i++) {
          var mm = PATS[i][0].exec(m[2]);
          if (mm) { inner = fill(PATS[i][1], mm.slice(1)); break; }
        }
      }
      if (inner) return m[1] + inner + m[3];
    }
    // Prefijo conocido + detalle dinámico
    for (i = 0; i < PREFIX.length; i++) {
      if (t.indexOf(PREFIX[i]) === 0 && t.length > PREFIX[i].length) {
        var rest = t.slice(PREFIX[i].length);
        var restT = rest.trim() ? translate(rest) : null;
        return D[PREFIX[i]] + (restT !== null ? restT : rest);
      }
    }
    // Texto en MAYÚSCULAS ("PRÓXIMOS EVENTOS")
    if (t === t.toUpperCase() && t !== t.toLowerCase()) {
      var low = t.charAt(0) + t.slice(1).toLowerCase();
      if (D[low]) return D[low].toUpperCase();
    }
    return null;
  }

  function translate(s) {
    if (!s || !LETTER.test(s)) return null;
    if (cache.has(s)) return cache.get(s);
    var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    var t = s.replace(/\s+/g, ' ').trim();
    var r = core(t);
    if (r === null && t.length >= 14) {
      var sub = t, hit = false;
      for (var i = 0; i < SUBS.length; i++) {
        if (sub.indexOf(SUBS[i]) !== -1) { sub = sub.split(SUBS[i]).join(D[SUBS[i]]); hit = true; }
      }
      if (hit) r = sub;
    }
    if (r === null) {
      var d = fixDates(t);
      r = d !== t ? d : null;
    }
    var out = r === null ? null : lead + r + trail;
    if (cache.size > 20000) cache.clear();
    cache.set(s, out);
    return out;
  }
  window.kehilaTranslate = function (s) { return init() ? (translate(s) || s) : s; };

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, svg: 1, SVG: 1, TEMPLATE: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var done = new WeakMap();   // nodo de texto → texto traducido que pusimos (evita bucles)

  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.nodeName] || e.isContentEditable) return true;
      if (e.classList && e.classList.contains('notranslate')) return true;
      if (e.hasAttribute && e.hasAttribute('data-no-translate')) return true;
    }
    return false;
  }

  function doText(n) {
    var p = n.parentNode;
    if (!p || p.nodeType !== 1) return;
    if (done.get(n) === n.data) return;
    if (skipEl(p)) return;
    var r = translate(n.data);
    if (r === null || r === n.data) return;
    // <option> sin value: su valor ES el texto. Lo fijamos antes de traducir
    // para que lo que se guarda en la base de datos siga en español.
    if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.textContent);
    done.set(n, r);
    n.data = r;
  }

  function doAttrs(el) {
    // Un <textarea> no se traduce por dentro (lo escribe el usuario), pero su placeholder/title sí
    if (skipEl(el.nodeName === 'TEXTAREA' ? el.parentNode : el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var r = translate(v); if (r !== null && r !== v) el.setAttribute(ATTRS[i], r); }
    }
    if (el.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      var rv = translate(el.value); if (rv !== null) el.value = rv;
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (SKIP[root.nodeName]) return;
      doAttrs(root);
    }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (n.hasAttributes && n.hasAttributes()) doAttrs(n);
    }
  }

  var titleSet = false;
  function doTitle() {
    var t = document.title; if (!t) return;
    var r = translate(t); if (r !== null && r !== t) { titleSet = true; document.title = r; }
  }

  function start() {
    if (!init()) return false;
    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
          if (m.target && m.target.nodeName === 'TITLE') doTitle();
        } else if (m.type === 'characterData') {
          doText(m.target);
          if (m.target.parentNode && m.target.parentNode.nodeName === 'TITLE') doTitle();
        } else if (m.type === 'attributes') {
          doAttrs(m.target);
        }
      }
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(['value'])
    });
    walk(document.documentElement);
    doTitle();
    return true;
  }

  // Diálogos nativos
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof msg === 'string' && init()) {
        args[0] = msg.split('\n').map(function (l) { return translate(l) || l; }).join('\n');
      }
      return orig.apply(window, args);
    };
  });

  // El diccionario se carga con document.write justo después de este script
  // y llama a __kehilaEnReady() al terminar.
  var started = false;
  window.__kehilaEnReady = function () { if (!started) started = start(); };
  window.__kehilaEnReady();
  document.addEventListener('DOMContentLoaded', function () { walk(document.body); doTitle(); });
})();
