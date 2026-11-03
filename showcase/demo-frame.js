/**
 * demo-frame.js — Componente <chai-demo-frame>: la demo en vivo dentro de un iPhone o un portátil.
 *
 * Un solo fichero, sin dependencias, sin build. Cópialo a cualquier web y úsalo así:
 *
 *   <script src="demo-frame.js"></script>
 *   <chai-demo-frame src="https://TU-DEMO.example.com/"></chai-demo-frame>
 *
 * Atributos (todos opcionales salvo src):
 *   src          URL de la demo (se abre en un <iframe>).
 *   device       "phone" (por defecto) o "laptop": dispositivo inicial.
 *   max-height   alto máximo en px que ocupa el dispositivo (por defecto 760).
 *   no-toggle    oculta el interruptor móvil / portátil (versión pequeña para la home).
 *   cta          texto del botón en móvil (por defecto "Probar la demo").
 *   label        texto del botón de pantalla completa (por defecto "Pantalla completa").
 *
 * Color de acento: variable CSS --cdf-accent en el propio elemento (por defecto #1B2E5E).
 *   chai-demo-frame { --cdf-accent: #5B2A86; }
 *
 * Comportamiento:
 *   - Escritorio: iPhone (390×844 reales) o MacBook (1280×800 reales), escalados para caber.
 *   - Móvil (≤ 640 px de ancho): no se dibuja un teléfono dentro de un teléfono; se muestra
 *     un botón grande que abre la demo a pantalla completa.
 *   - El iframe solo se carga cuando se ve, y el de cada dispositivo solo la primera vez.
 */
(function () {
  if (typeof customElements === 'undefined' || customElements.get('chai-demo-frame')) return;

  var DEV = {
    phone:  { w: 418,  h: 872 },   // marco incluido; pantalla 390×844
    laptop: { w: 1440, h: 854 },   // marco + base incluidos; pantalla 1280×800
  };
  var MOBILE_MQ = '(max-width: 640px)';

  var CSS = [
    'chai-demo-frame{display:block;width:100%;--cdf-accent:#1B2E5E;--cdf-status-bg:#fff}',
    '.cdf,.cdf *{box-sizing:border-box}',
    '.cdf{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;width:100%}',

    /* barra de controles */
    '.cdf-bar{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 18px}',
    '.cdf-seg{display:inline-flex;background:rgba(127,127,127,.16);border-radius:999px;padding:4px}',
    '.cdf-seg button{appearance:none;border:0;background:transparent;font-size:14px;font-weight:600;line-height:1;font-family:inherit;color:inherit;padding:9px 16px;border-radius:999px;cursor:pointer;display:inline-flex;gap:7px;align-items:center}',
    '.cdf-seg button[aria-pressed="true"]{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.18)}',
    '.cdf-seg svg,.cdf-full svg{width:16px;height:16px;flex:none}',
    '.cdf-full{appearance:none;border:1.5px solid var(--cdf-accent);background:transparent;color:var(--cdf-accent);font-size:14px;font-weight:600;line-height:1;font-family:inherit;padding:10px 16px;border-radius:999px;cursor:pointer;display:inline-flex;gap:7px;align-items:center}',
    '.cdf-full:hover{background:var(--cdf-accent);color:#fff}',
    '.cdf button:focus-visible{outline:3px solid var(--cdf-accent);outline-offset:2px}',

    /* escenario: el dispositivo se dibuja a tamaño real y se escala */
    '.cdf-stage{position:relative;width:100%;height:0}',
    '.cdf-dev{position:absolute;top:0;left:0;transform-origin:top left;display:none}',
    '.cdf-dev.on{display:block}',

    /* iPhone */
    '.cdf-phone{width:418px;height:872px;padding:14px;border-radius:68px;background:linear-gradient(145deg,#2d2f36,#0b0c0e);',
    'box-shadow:inset 0 0 0 2px #4b4e57,0 0 0 1px #000,0 40px 70px -25px rgba(0,0,0,.5)}',
    '.cdf-screen{position:relative;width:390px;height:844px;border-radius:54px;overflow:hidden;background:#fff;display:flex;flex-direction:column}',
    '.cdf-status{flex:none;height:47px;display:flex;align-items:center;justify-content:space-between;padding:8px 30px 0 36px;background:var(--cdf-status-bg);color:#111;font:600 16px/1 system-ui,-apple-system,sans-serif}',
    '.cdf-status i{display:inline-flex;gap:5px;align-items:center}',
    '.cdf-status svg{height:12px;width:auto;fill:#111}',
    '.cdf-island{position:absolute;z-index:3;top:11px;left:50%;width:122px;height:35px;margin-left:-61px;background:#000;border-radius:20px}',
    '.cdf-home{position:absolute;z-index:3;bottom:8px;left:50%;width:136px;height:5px;margin-left:-68px;border-radius:3px;background:#111;opacity:.8;pointer-events:none}',
    '.cdf-btn{position:absolute;width:4px;background:#3a3d44;border-radius:2px}',
    '.cdf-btn.l1{left:-3px;top:150px;height:32px}',
    '.cdf-btn.l2{left:-3px;top:210px;height:62px}',
    '.cdf-btn.l3{left:-3px;top:290px;height:62px}',
    '.cdf-btn.r1{right:-3px;top:240px;height:96px}',

    /* MacBook */
    '.cdf-laptop{width:1440px;height:854px;position:absolute}',
    '.cdf-lid{position:absolute;left:62px;top:0;width:1316px;height:836px;padding:18px;border-radius:24px 24px 0 0;background:#0b0c0e;box-shadow:inset 0 0 0 2px #3c3f46,0 0 0 1px #000}',
    '.cdf-lid .cdf-cam{position:absolute;top:7px;left:50%;width:5px;height:5px;margin-left:-2px;border-radius:50%;background:#23252b}',
    '.cdf-lid .cdf-lscreen{width:1280px;height:800px;border-radius:6px;overflow:hidden;background:#fff}',
    '.cdf-base{position:absolute;left:0;top:836px;width:1440px;height:18px;border-radius:0 0 26px 26px;',
    'background:linear-gradient(#d9dce1,#a4a8b0);box-shadow:0 30px 50px -20px rgba(0,0,0,.45)}',
    '.cdf-base::before{content:"";position:absolute;left:50%;top:0;width:220px;height:7px;margin-left:-110px;border-radius:0 0 12px 12px;background:#8e929a}',

    '.cdf iframe{display:block;border:0;background:#fff}',
    '.cdf-phone iframe{width:390px;height:797px}',
    '.cdf-lscreen iframe{width:1280px;height:800px}',

    /* móvil: botón grande en lugar del dispositivo */
    '.cdf-mobile{display:none;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:8px 0}',
    '.cdf-mobile button{appearance:none;border:0;cursor:pointer;background:var(--cdf-accent);color:#fff;font-size:18px;font-weight:700;line-height:1;font-family:inherit;padding:18px 28px;border-radius:16px;width:100%;max-width:420px;box-shadow:0 10px 24px -10px var(--cdf-accent)}',
    '.cdf-mobile small{opacity:.7;font-size:13px}',
    '@media ' + MOBILE_MQ + '{.cdf-bar,.cdf-stage{display:none!important}.cdf-mobile{display:flex}}',

    /* pantalla completa */
    '.cdf-overlay{position:fixed;inset:0;z-index:2147483000;background:#000;display:flex}',
    '.cdf-overlay iframe{flex:1;width:100%;height:100%;border:0;background:#fff}',
    '.cdf-close{position:absolute;top:max(12px,env(safe-area-inset-top));left:12px;z-index:2;appearance:none;border:0;cursor:pointer;width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;font:400 22px/1 system-ui;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}',
    '.cdf-close:focus-visible{outline:3px solid #fff;outline-offset:2px}',
  ].join('');

  var ICON = {
    phone:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
    full:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };
  var STATUS_ICONS =
    '<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5" width="3" height="7" rx=".8"/><rect x="10" y="2.5" width="3" height="9.5" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>' +
    '<svg viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="#111" opacity=".45"/><rect x="2" y="2" width="19" height="9" rx="2.2"/><rect x="24" y="4.2" width="2" height="4.6" rx="1" opacity=".5"/></svg>';

  function injectCss() {
    if (document.getElementById('cdf-css')) return;
    var s = document.createElement('style');
    s.id = 'cdf-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function ChaiDemoFrame() { return Reflect.construct(HTMLElement, [], ChaiDemoFrame); }
  ChaiDemoFrame.prototype = Object.create(HTMLElement.prototype);
  ChaiDemoFrame.prototype.constructor = ChaiDemoFrame;
  Object.setPrototypeOf(ChaiDemoFrame, HTMLElement);
  ChaiDemoFrame.observedAttributes = ['src'];

  ChaiDemoFrame.prototype.connectedCallback = function () {
    if (this._ready) return;
    this._ready = true;
    injectCss();

    var self = this;
    this._device = this.getAttribute('device') === 'laptop' ? 'laptop' : 'phone';
    this._mq = window.matchMedia(MOBILE_MQ);
    this._loaded = { phone: false, laptop: false };

    var root = el('div', 'cdf');

    /* controles */
    var bar = el('div', 'cdf-bar');
    if (!this.hasAttribute('no-toggle')) {
      var seg = el('div', 'cdf-seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Dispositivo');
      this._btns = {};
      [['phone', 'Móvil'], ['laptop', 'Portátil']].forEach(function (d) {
        var b = el('button', '', ICON[d[0]] + '<span>' + d[1] + '</span>');
        b.type = 'button';
        b.addEventListener('click', function () { self.setDevice(d[0]); });
        self._btns[d[0]] = b;
        seg.appendChild(b);
      });
      bar.appendChild(seg);
    }
    var full = el('button', 'cdf-full', ICON.full + '<span></span>');
    full.type = 'button';
    full.lastChild.textContent = this.getAttribute('label') || 'Pantalla completa';
    full.addEventListener('click', function () { self.openFullscreen(); });
    bar.appendChild(full);
    root.appendChild(bar);

    /* escenario */
    var stage = el('div', 'cdf-stage');
    this._stage = stage;

    var phone = el('div', 'cdf-dev');
    phone.innerHTML =
      '<div class="cdf-phone">' +
        '<span class="cdf-btn l1"></span><span class="cdf-btn l2"></span><span class="cdf-btn l3"></span><span class="cdf-btn r1"></span>' +
        '<div class="cdf-screen">' +
          '<div class="cdf-island"></div>' +
          '<div class="cdf-status"><span>9:41</span><i>' + STATUS_ICONS + '</i></div>' +
          '<div class="cdf-slot"></div>' +
          '<div class="cdf-home"></div>' +
        '</div>' +
      '</div>';
    var laptop = el('div', 'cdf-dev');
    laptop.innerHTML =
      '<div class="cdf-laptop">' +
        '<div class="cdf-lid"><span class="cdf-cam"></span><div class="cdf-lscreen"><div class="cdf-slot"></div></div></div>' +
        '<div class="cdf-base"></div>' +
      '</div>';
    this._devEl = { phone: phone, laptop: laptop };
    stage.appendChild(phone);
    stage.appendChild(laptop);
    root.appendChild(stage);

    /* móvil */
    var mob = el('div', 'cdf-mobile');
    var cta = el('button', '', '');
    cta.type = 'button';
    cta.textContent = this.getAttribute('cta') || 'Probar la demo';
    cta.addEventListener('click', function () { self.openFullscreen(); });
    mob.appendChild(cta);
    mob.appendChild(el('small', '', 'Se abre a pantalla completa'));
    root.appendChild(mob);

    this.appendChild(root);

    this._onMq = function () { self._sync(); };
    if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMq);
    else this._mq.addListener(this._onMq);

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self._fit(); });
      this._ro.observe(this);
    } else {
      this._onResize = function () { self._fit(); };
      window.addEventListener('resize', this._onResize);
    }
    this.setDevice(this._device);
  };

  ChaiDemoFrame.prototype.disconnectedCallback = function () {
    if (this._ro) this._ro.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._mq && this._onMq) {
      if (this._mq.removeEventListener) this._mq.removeEventListener('change', this._onMq);
      else this._mq.removeListener(this._onMq);
    }
    this.closeFullscreen();
    this._ready = false;
  };

  ChaiDemoFrame.prototype.attributeChangedCallback = function (name) {
    if (name !== 'src' || !this._ready) return;
    var self = this;
    ['phone', 'laptop'].forEach(function (d) {
      var f = self._devEl[d].querySelector('iframe');
      if (f) f.src = self.getAttribute('src');
    });
  };

  ChaiDemoFrame.prototype.setDevice = function (d) {
    this._device = d;
    for (var k in this._devEl) this._devEl[k].classList.toggle('on', k === d);
    if (this._btns) for (var b in this._btns) this._btns[b].setAttribute('aria-pressed', String(b === d));
    this._sync();
  };

  /* Crea el iframe del dispositivo activo solo cuando se va a ver (no en móvil). */
  ChaiDemoFrame.prototype._sync = function () {
    var src = this.getAttribute('src');
    if (src && !this._mq.matches && !this._loaded[this._device]) {
      var slot = this._devEl[this._device].querySelector('.cdf-slot');
      var f = document.createElement('iframe');
      f.title = this.getAttribute('title') || 'Demo de la app';
      f.loading = 'lazy';
      f.allow = 'clipboard-write; fullscreen';
      f.src = src;
      slot.replaceWith(f);
      this._loaded[this._device] = true;
    }
    this._fit();
  };

  ChaiDemoFrame.prototype._fit = function () {
    if (!this._stage) return;
    var dev = DEV[this._device];
    var w = this._stage.clientWidth;
    if (!w) return;
    var maxH = parseInt(this.getAttribute('max-height'), 10) || 760;
    var s = Math.min(1, w / dev.w, maxH / dev.h);
    var node = this._devEl[this._device];
    node.style.width = dev.w + 'px';
    node.style.height = dev.h + 'px';
    node.style.transform = 'scale(' + s + ')';
    node.style.left = Math.max(0, (w - dev.w * s) / 2) + 'px';
    this._stage.style.height = Math.round(dev.h * s) + 'px';
  };

  ChaiDemoFrame.prototype.openFullscreen = function () {
    var src = this.getAttribute('src');
    if (!src || this._overlay) return;
    var self = this;
    var ov = el('div', 'cdf-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    var f = document.createElement('iframe');
    f.title = this.getAttribute('title') || 'Demo de la app';
    f.allow = 'clipboard-write; fullscreen';
    f.src = src;
    var x = el('button', 'cdf-close', '&times;');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar');
    x.addEventListener('click', function () { self.closeFullscreen(); });
    ov.appendChild(f);
    ov.appendChild(x);
    document.body.appendChild(ov);
    this._overlay = ov;
    this._prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    this._onKey = function (e) { if (e.key === 'Escape') self.closeFullscreen(); };
    document.addEventListener('keydown', this._onKey);
    this._onFs = function () { if (!document.fullscreenElement && self._overlay) self.closeFullscreen(); };
    document.addEventListener('fullscreenchange', this._onFs);
    try { if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {}); } catch (e) {}
    x.focus();
  };

  ChaiDemoFrame.prototype.closeFullscreen = function () {
    if (!this._overlay) return;
    var ov = this._overlay;
    this._overlay = null;
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('fullscreenchange', this._onFs);
    document.documentElement.style.overflow = this._prevOverflow || '';
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    ov.remove();
  };

  customElements.define('chai-demo-frame', ChaiDemoFrame);
})();
