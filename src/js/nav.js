/**
 * @file nav.js
 * @description Navegación global: sidebar desktop, bottom nav móvil, hamburger y toasts.
 *
 * Este archivo se incluye en TODAS las páginas protegidas y genera la navegación
 * de forma dinámica en el cliente (no hay servidor que genere el HTML).
 *
 * Componentes que genera:
 *  - Sidebar izquierdo (desktop ≥ 769px): con avatar, nombre, links y logout
 *  - Bottom navigation (móvil ≤ 768px): 4-5 iconos principales
 *  - Menú "Más" drawer (móvil): el resto de secciones
 *  - Hamburger menu: navegación completa en móvil
 *  - Page header: título de sección + acciones contextuales
 *  - Toast notifications: mensajes temporales de estado
 *  - Legal footer: enlace a páginas legales
 *
 * DEPENDENCIAS:
 *  - auth.js → getCurrentUser(), getAvatarColor(), renderAvatar(), logout()
 *    Debe cargarse ANTES que nav.js.
 *
 * PUNTO DE ENTRADA: initNav(activePage) — llamar en DOMContentLoaded de cada página.
 *
 * AÑADIR UNA NUEVA SECCIÓN AL MENÚ:
 *  1. Añadir entrada al array NAV_ITEMS (grupo + item con id, label, href, icon)
 *  2. Si debe aparecer en bottom nav móvil, añadir a BOTTOM_NAV_ITEMS
 *  3. Crear el archivo HTML correspondiente
 *  4. Llamar initNav('id-de-la-nueva-seccion') en esa página
 */

/**
 * Universal Links (iOS) / App Links (Android): cuando el usuario toca un
 * enlace de {{domain}} estando la app instalada, iOS/Android la abren y
 * disparan 'appUrlOpen' con la URL externa completa — pero el WebView no
 * navega solo. Traducimos esa URL a la ruta local equivalente dentro del
 * shell de Capacitor (ej. {{url}}/eventos.html?evento=5
 * → eventos.html?evento=5) para que aterrice en la página/evento correctos
 * en vez de quedarse en la pantalla de inicio.
 * Se registra en carga del script (no en DOMContentLoaded) para no perder
 * la URL de un cold start.
 */
/**
 * Pila de navegación propia en sessionStorage para el botón "atrás" de
 * global-back-btn (ver buildBackBtn más abajo). No usa history.back():
 * en WKWebView (iOS) la vuelta atrás vía historial nativo se queda
 * colgada/no lleva a la pantalla anterior de forma fiable, mientras que la
 * navegación hacia delante (clic en enlaces, ver listener de 'click' más
 * abajo) usa location.href directo y esa sí funciona igual en todas las
 * plataformas. Por eso el botón "atrás" navega también con location.href,
 * a la URL anterior que esta pila recuerda, en vez de con history.back().
 */
(function () {
  try {
    const goingBack = sessionStorage.getItem('kehila_nav_going_back') === '1';
    sessionStorage.removeItem('kehila_nav_going_back');
    let stack = JSON.parse(sessionStorage.getItem('kehila_nav_stack') || '[]');
    const here = location.pathname + location.search;
    if (stack[stack.length - 1] !== here) stack.push(here);
    if (!goingBack && stack.length > 50) stack = stack.slice(-50);
    sessionStorage.setItem('kehila_nav_stack', JSON.stringify(stack));
  } catch (_) { /* sessionStorage no disponible: buildBackBtn cae a history.back() */ }
})();

if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  const { App } = window.Capacitor.Plugins;
  App.addListener('appUrlOpen', (data) => {
    try {
      const incoming = new URL(data.url);
      // {{url}}/eventos.html?evento=5 → pathname «/eventos.html»
      // {{app.scheme}}://eventos.html?evento=5             → host «eventos.html»
      const ruta = incoming.protocol === '{{app.scheme}}:'
        ? (incoming.host + incoming.pathname)
        : incoming.pathname;
      const target = ruta.replace(/^\//, '') + incoming.search + incoming.hash;
      // Solo páginas internas (.html); nunca URLs arbitrarias
      if (target && /^[a-z0-9-]+\.html([?#].*)?$/i.test(target)) window.location.href = target;
      else if (incoming.protocol === '{{app.scheme}}:') window.location.href = 'home.html';
    } catch (e) { /* URL externa no reconocida: ignorar */ }
  });
}

/**
 * Muestra el overlay #pt-overlay (spinner) al pulsar un enlace interno,
 * ANTES de que el navegador descargue la página actual. Sin esto, en
 * WKWebView (iOS) se ve un corte seco a blanco/negro entre el clic y el
 * primer pintado de la página siguiente — con esto, lo último que se ve
 * es el mismo spinner que ya trae la página nueva en su <head>, así el
 * cambio se percibe continuo en vez de un parpadeo.
 * Se registra en carga del script (no en DOMContentLoaded) para no perder
 * clics tempranos.
 */
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

  const href = a.getAttribute('href');
  if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;

  let url;
  try { url = new URL(href, location.href); } catch (_) { return; }
  if (url.origin !== location.origin) return;
  // Mismo documento con solo cambio de #hash: no hay navegación real.
  if (url.pathname === location.pathname && url.hash) return;

  // Router SPA (js/router.js): si la página actual y el destino están en el
  // piloto, navega sin recarga. Si no lo consume, cae al flujo normal.
  if (window.__spaTryNavigate && window.__spaTryNavigate(url, href)) {
    e.preventDefault();
    return;
  }

  const overlay = document.getElementById('pt-overlay');
  if (!overlay) return; // página sin overlay propio (ej. redirecciones): navegación normal

  // Con View Transitions entre páginas (html.vt, ver <head>): NO tapar la
  // página actual — se queda visible hasta que la nueva está lista y el
  // navegador hace el crossfade. Tapar aquí era justo el hueco crema que se
  // veía en iPhone. Solo si la carga tarda (red lenta) se muestra el spinner.
  if (document.documentElement.classList.contains('vt')) {
    clearTimeout(window.__vtWaitTimer);
    window.__vtWaitTimer = setTimeout(() => {
      document.documentElement.classList.add('vt-wait');
      document.body.classList.remove('page-ready');
    }, 700);
    return;
  }

  e.preventDefault();
  document.body.classList.remove('page-ready');
  setTimeout(() => { window.location.href = href; }, 60);
}, true);

// Volver atrás con el gesto de iOS restaura la página desde la caché
// (bfcache) tal cual se dejó: si se había llegado a mostrar el spinner de
// "carga lenta", quitarlo para que no se quede tapando la página.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  clearTimeout(window.__vtWaitTimer);
  document.documentElement.classList.remove('vt-wait');
  if (document.getElementById('pt-overlay')) document.body.classList.add('page-ready');
});

/**
 * Prefetch al tocar/pasar sobre un enlace interno, antes del clic.
 * Calienta la cache del Service Worker para que la navegación real
 * (arriba) llegue casi instantánea en vez de esperar la red.
 */
(() => {
  const prefetched = new Set();
  const tryPrefetch = (target) => {
    const a = target && target.closest && target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    let url;
    try { url = new URL(href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return;
    if (prefetched.has(url.href)) return;
    prefetched.add(url.href);
    fetch(url.href, { credentials: 'same-origin' }).catch(() => {});
  };
  // Solo touchstart: un "mouseover" en escritorio dispara un fetch por cada
  // enlace que el cursor cruza al pasar por el menu (sin debounce), lo que
  // en una sesion larga genera un volumen de peticiones grande e innecesario.
  document.addEventListener('touchstart', (e) => tryPrefetch(e.target), { passive: true, capture: true });
})();

/**
 * Pull-to-refresh nativo: solo dentro de la app (Capacitor), para no
 * interferir con el scroll normal en navegador de escritorio/móvil web.
 * Usa preventDefault() en touchmove mientras se arrastra: sin esto, en
 * WKWebView (iOS) el rubber-band/bounce nativo se adelanta al gesto y el
 * indicador nunca llega a mostrarse de forma fiable — con preventDefault
 * el gesto lo controlamos por completo desde JS.
 */
(() => {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;

  const THRESHOLD = 70;
  const MAX = 100;
  let startY = 0;
  let pulling = false;
  let dragging = false;
  let indicator = null;

  const ensureIndicator = () => {
    if (indicator) return indicator;
    indicator = document.createElement('div');
    indicator.id = 'kh-ptr';
    indicator.innerHTML = '<div class="kh-ptr-spinner"></div>';
    const style = document.createElement('style');
    style.textContent = `
      #kh-ptr{position:fixed;top:0;left:0;right:0;display:flex;justify-content:center;
        align-items:flex-start;padding-top:14px;height:70px;z-index:9998;
        transform:translateY(-70px);pointer-events:none}
      #kh-ptr .kh-ptr-spinner{width:28px;height:28px;border-radius:50%;
        border:3px solid rgba(27,46,94,.15);border-top-color:#1B2E5E;
        animation:kh-ptr-spin .7s linear infinite}
      @keyframes kh-ptr-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    return indicator;
  };

  const setDist = (dist, withTransition) => {
    const el = ensureIndicator();
    el.style.transition = withTransition ? 'transform .18s ease' : 'none';
    el.style.transform = `translateY(${dist - 70}px)`;
  };

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || e.touches.length !== 1) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
    dragging = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { pulling = false; return; }
    dragging = true;
    if (e.cancelable) e.preventDefault();
    const dist = Math.min(dy * 0.55, MAX);
    setDist(dist, false);
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!pulling || !dragging) { pulling = false; dragging = false; return; }
    pulling = false;
    dragging = false;
    if (!indicator) return;
    const currentDist = parseFloat(indicator.style.transform.match(/-?\d+(\.\d+)?/)?.[0] || '-70') + 70;
    if (currentDist > THRESHOLD) {
      setDist(70, true);
      window.location.reload();
    } else {
      setDist(0, true);
    }
  }, { passive: true });
})();

/**
 * Escapa caracteres HTML peligrosos para prevenir XSS.
 * Disponible globalmente — se usa en nav.js, noticias.js, wallap.html y otros.
 * @param {*} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV_ITEMS = [
  {
    group: '',
    items: [
      {
        id: 'home',
        label: 'Inicio',
        href: 'home.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>`
      }
    ]
  },
  {
    group: 'Principal',
    items: [
      {
        id: 'calendario',
        label: 'Calendario Hebreo',
        href: 'calendario.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>`
      },
      {
        id: 'eventos',
        label: 'Eventos',
        href: 'eventos.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>`
      },
      {
        id: 'comunidad',
        label: '{{labels.business}}',
        href: 'business.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>`
      },
      {
        id: 'rav-hub',
        label: 'Torá y Comunidad',
        href: 'shiurim.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"/></svg>`
      },
      {
        id: 'siddur',
        label: 'Sidur',
        href: 'siddur.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/></svg>`
      },
      {
        id: 'esencial',
        label: '{{labels.services}}',
        href: 'servicios.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"/></svg>`
      },
      {
        id: 'mikve',
        label: 'Mikve',
        href: 'mikve.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75c-4.5 6-6.75 10.125-6.75 12.75a6.75 6.75 0 0 0 13.5 0c0-2.625-2.25-6.75-6.75-12.75Z"/></svg>`
      },
      {
        id: 'donativos',
        label: 'Donativos',
        href: 'donativos.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg>`
      },
    ]
  },
  {
    group: 'Mi cuenta',
    items: [
      {
        id: 'perfil',
        label: 'Mi perfil',
        href: 'perfil.html',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>`
      }
    ]
  }
];

// Páginas de contenido que "pertenecen" a un item de menú cuyo href ya no
// apunta a su antigua página puente (jconnect, rav-hub,
// esencial): al entrar directo por ellas, el id activo real
// (activePage) no coincide con el id del item de menú, así que sin este
// mapa la pestaña correspondiente no se resaltaría como activa.
const NAV_ACTIVE_ALIAS = {
  business: 'comunidad', professionals: 'comunidad', wallap: 'comunidad',
  shiurim: 'rav-hub', rav: 'rav-hub', 'citas-rabino': 'rav-hub',
  servicios: 'esencial'
};

// Items de bottom nav (máximo 5 + botón "Más")
// Secciones clave: Calendario hebreo, Mikve, Eventos y Donativos (+ Inicio y "Más").
const navIcon = (id) => NAV_ITEMS.flatMap(g => g.items).find(i => i.id === id)?.icon || '';
const BOTTOM_NAV_ITEMS = [
  { id: 'home',       href: 'home.html',       icon: navIcon('home') },
  { id: 'calendario', href: 'calendario.html', icon: navIcon('calendario'), short: 'home_quick_cal' },
  { id: 'mikve',      href: 'mikve.html',      icon: navIcon('mikve') },
  { id: 'eventos',    href: 'eventos.html',    icon: navIcon('eventos') },
  { id: 'donativos',  href: 'donativos.html',  icon: navIcon('donativos') },
];

// ─── Módulos activos por comunidad ─────────────────────────────
// community/<slug>.json → "modules". COMMUNITY lo define js/community.js.
// Los items de módulos desactivados desaparecen del menú y de la barra inferior.
const NAV_ID_MODULE = {
  calendario: 'calendario', eventos: 'eventos', comunidad: 'business', 'rav-hub': 'rav-hub',
  siddur: 'siddur', esencial: 'servicios', mikve: 'mikve', donativos: 'donativos',
  business: 'business', shiurim: 'shiurim', rav: 'rav', 'citas-rabino': 'citas'
};
const navModuleOn = (id) => {
  const mod = NAV_ID_MODULE[id];
  return !mod || !window.COMMUNITY || window.COMMUNITY.enabled(mod);
};
NAV_ITEMS.forEach(g => { g.items = g.items.filter(i => navModuleOn(i.id)); });
// El hub "Torá y Comunidad" apunta a su primera pestaña activa.
NAV_ITEMS.forEach(g => g.items.forEach(i => {
  if (i.id !== 'rav-hub' || !window.COMMUNITY) return;
  const first = [['shiurim', 'shiurim.html'], ['rav', 'rav.html'], ['citas', 'citas-rabino.html']]
    .find(([m]) => window.COMMUNITY.enabled(m));
  if (first) i.href = first[1];
}));
for (let i = BOTTOM_NAV_ITEMS.length - 1; i >= 0; i--) {
  if (!navModuleOn(BOTTOM_NAV_ITEMS[i].id)) BOTTOM_NAV_ITEMS.splice(i, 1);
}

/**
 * Construye e inyecta el sidebar en .sidebar-placeholder o crea uno.
 * @param {string} activePage - id de la página activa
 */
/**
 * Construye e inyecta el sidebar de navegación lateral (solo desktop).
 * Si la página está en un iframe, oculta el sidebar y ajusta márgenes.
 *
 * @param {string} activePage - ID de la página activa (ej: 'home', 'eventos')
 *   Debe coincidir con el campo `id` en NAV_ITEMS.
 */
function buildSidebar(activePage) {
  // Si está en un iframe, suprimir sidebar y quitar márgenes
  if (window.self !== window.top) {
    var embedStyle = document.createElement('style');
    embedStyle.textContent = '.sidebar{display:none!important;}.main-content{margin-left:0!important;width:100vw!important;padding-bottom:0!important;}.page-header{display:none!important;}.bottom-nav{display:none!important;}';
    document.head.appendChild(embedStyle);
    return;
  }

  const user = getCurrentUser();
  if (!user) return;

  const color = getAvatarColor(user.name);
  const initials = user.initials || user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Función de traducción local (i18n puede no estar cargado aún)
  const _t = (key) => (typeof t === 'function') ? t(key) : key;
  const _lang = (typeof getLang === 'function') ? getLang() : 'es';

  // Mapa de ids a claves i18n
  const NAV_KEYS = {
    home: 'nav_home', eventos: 'nav_eventos', calendario: 'nav_calendario',
    'rav-hub': 'nav_rav_hub', comunidad: 'nav_comunidad', donativos: 'nav_donativos',
    esencial: 'nav_esencial', mikve: 'nav_mikve', perfil: 'nav_perfil'
  };
  const GROUP_KEYS = {
    'Principal': 'group_principal', 'Mi cuenta': 'group_cuenta'
  };

  // Construir grupos de navegación
  let navHTML = '';
  NAV_ITEMS.forEach(group => {
    const groupLabel = _t(GROUP_KEYS[group.group] || group.group);
    navHTML += `<div class="nav-group-label">${groupLabel}</div>`;
    group.items.forEach(item => {
      const active = item.id === (NAV_ACTIVE_ALIAS[activePage] || activePage) ? 'active' : '';
      const label = _t(NAV_KEYS[item.id] || ('nav_' + item.id)) || item.label;
      navHTML += `
        <a href="${item.href}" class="nav-item ${active}" data-page="${item.id}">
          ${item.icon}
          <span>${label}</span>
        </a>`;
    });
  });

  // Item admin (solo si es admin)
  let adminHTML = '';
  if (['admin', 'super_admin', 'staff'].includes(user.role)) {
    const adminActive = activePage === 'admin' ? 'active' : '';
    adminHTML = `
      <div class="nav-divider"></div>
      <a href="admin.html" class="nav-item admin-item ${adminActive}" data-page="admin">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>
        <span>${_t('nav_admin')}</span>
      </a>`;
  }

  const roleLabelMap = {
    es: { admin: 'Administrador', miembro: 'Miembro', mod: 'Moderador' },
    en: { admin: 'Administrator', miembro: 'Member', mod: 'Moderator' }
  };
  const roleLabel = (roleLabelMap[_lang] || roleLabelMap.es)[user.role] || user.role;
  const verPerfil = _lang === 'en' ? 'View profile' : 'Ver perfil';
  const cerrarSesion = _t('nav_logout');

  const sidebarHTML = `
    <aside class="sidebar">
      <div class="sidebar-inner">
        <!-- Logo -->
        <a href="home.html" class="sidebar-logo" style="text-decoration:none;cursor:pointer;display:flex;justify-content:center;align-items:center;width:100%;padding:6px 0 14px;">
          <img src="img/{{brand.logoFile}}" alt="{{name}}" style="width:112px;height:112px;object-fit:contain;display:block;flex-shrink:0;">
        </a>

        <!-- Usuario -->
        <a href="perfil.html" class="sidebar-user" style="text-decoration:none;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background=''">
          <div class="avatar avatar-md" data-color="${color}">${escHtml(initials)}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${escHtml(user.name)}</div>
            <div class="sidebar-user-role">${roleLabel} · ${verPerfil}</div>
          </div>
        </a>

        <!-- Navegación -->
        <nav class="sidebar-nav">
          ${navHTML}
          ${adminHTML}
        </nav>

        <!-- Footer: lang toggle + logout -->
        <div class="sidebar-footer">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 18px 2px;">
            <button class="lang-toggle-btn" onclick="toggleLang()" style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;color:rgba(255,255,255,0.45);background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:3px;padding:3px 8px;cursor:pointer;font-family:inherit;transition:all 0.15s;" title="${_lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}">${_lang === 'es' ? 'EN' : 'ES'}</button>
          </div>
          <button class="sidebar-logout" onclick="logout()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"/></svg>
            <span>${cerrarSesion}</span>
          </button>
        </div>
      </div>
    </aside>`;

  // Inyectar en el DOM
  const placeholder = document.getElementById('sidebar-placeholder');
  if (placeholder) {
    placeholder.outerHTML = sidebarHTML;
  } else {
    // Insertar antes del main content si existe
    const layout = document.querySelector('.app-layout');
    if (layout) {
      layout.insertAdjacentHTML('afterbegin', sidebarHTML);
    }
  }
}

/**
 * Construye e inyecta la barra de navegación móvil inferior.
 * @param {string} activePage - id de la página activa
 */
/**
 * Construye e inyecta la barra de navegación inferior para móvil.
 * Muestra los items definidos en BOTTOM_NAV_ITEMS + botón "Más".
 *
 * @param {string} activePage - ID de la página activa
 */
function buildBottomNav(activePage) {
  if (window.self !== window.top) return;
  const _t = (key) => (typeof t === 'function') ? t(key) : key;
  const NAV_KEYS = {
    home: 'nav_home', eventos: 'nav_eventos', calendario: 'nav_calendario',
    'rav-hub': 'nav_rav_hub', comunidad: 'nav_comunidad', donativos: 'nav_donativos',
    esencial: 'nav_esencial', mikve: 'nav_mikve', perfil: 'nav_perfil'
  };

  const moreLabel = _t('nav_more') || 'Más';

  const resolvedActivePage = NAV_ACTIVE_ALIAS[activePage] || activePage;
  let itemsHTML = '';
  BOTTOM_NAV_ITEMS.forEach(item => {
    const active = item.id === resolvedActivePage ? 'active' : '';
    const label = _t(item.short || NAV_KEYS[item.id]) || item.id;
    itemsHTML += `
      <a href="${item.href}" class="bottom-nav-item ${active}">
        ${item.icon}
        <span>${label}</span>
      </a>`;
  });

  // Botón "Más"
  const moreActive = !BOTTOM_NAV_ITEMS.find(i => i.id === resolvedActivePage) ? 'active' : '';
  itemsHTML += `
    <button class="bottom-nav-item ${moreActive}" id="bottom-more-btn" onclick="toggleMoreDrawer()">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width:22px;height:22px;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
      </svg>
      <span>${moreLabel}</span>
    </button>`;

  const bottomNavHTML = `
    <nav class="bottom-nav" id="bottom-nav">
      <div class="bottom-nav-items">${itemsHTML}</div>
    </nav>`;

  const existing = document.getElementById('bottom-nav');
  if (existing) {
    existing.outerHTML = bottomNavHTML;
  } else {
    document.body.insertAdjacentHTML('beforeend', bottomNavHTML);
  }

  buildMoreDrawer(activePage);
}

/**
 * Construye el drawer "Más" con todas las páginas.
 */
function buildMoreDrawer(activePage) {
  const _t  = (key) => (typeof t === 'function') ? t(key) : key;
  const _lang = (typeof getLang === 'function') ? getLang() : 'es';
  const user = getCurrentUser();

  const NAV_KEYS = {
    home: 'nav_home', eventos: 'nav_eventos', calendario: 'nav_calendario',
    'rav-hub': 'nav_rav_hub', comunidad: 'nav_comunidad', donativos: 'nav_donativos',
    esencial: 'nav_esencial', mikve: 'nav_mikve', perfil: 'nav_perfil'
  };
  const GROUP_KEYS = {
    'Principal': 'group_principal', 'Mi cuenta': 'group_cuenta'
  };

  let sectionsHTML = '';
  NAV_ITEMS.forEach(group => {
    if (!group.group) return; // skip unlabelled groups (Inicio) — always reachable from bottom nav
    const groupLabel = _t(GROUP_KEYS[group.group] || group.group);
    let rowsHTML = '';
    group.items.forEach(item => {
      const label = _t(NAV_KEYS[item.id] || ('nav_' + item.id)) || item.label;
      const active = item.id === activePage ? 'style="color:var(--color-primary);font-weight:600;"' : '';
      rowsHTML += `
        <a href="${item.href}" class="more-drawer-item" ${active}>
          <span class="more-drawer-icon">${item.icon}</span>
          <span>${label}</span>
        </a>`;
    });
    sectionsHTML += `
      <div class="more-drawer-section">
        <div class="more-drawer-group-label">${groupLabel}</div>
        <div class="more-drawer-grid">${rowsHTML}</div>
      </div>`;
  });

  // Admin link
  if (['admin', 'super_admin', 'staff'].includes(user?.role)) {
    sectionsHTML += `
      <div class="more-drawer-section">
        <div class="more-drawer-grid">
          <a href="admin.html" class="more-drawer-item" ${activePage === 'admin' ? 'style="color:var(--color-primary);font-weight:600;"' : ''}>
            <span class="more-drawer-icon"><svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width:22px;height:22px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg></span>
            <span>${_t('nav_admin')}</span>
          </a>
        </div>
      </div>`;
  }

  const langLabel = _lang === 'es' ? 'EN' : 'ES';
  const langTitle = _lang === 'es' ? 'Switch to English' : 'Cambiar a Español';
  const closeLabel = _lang === 'es' ? 'Cerrar' : 'Close';

  const drawerHTML = `
    <div id="more-drawer-backdrop" onclick="toggleMoreDrawer()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:699;"></div>
    <div id="more-drawer" style="display:none;position:fixed;bottom:0;left:0;right:0;z-index:700;background:#fff;border-radius:20px 20px 0 0;padding:0 0 env(safe-area-inset-bottom,0);max-height:80vh;overflow-y:auto;transform:translateY(100%);transition:transform 0.3s cubic-bezier(.32,.72,0,1);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px;border-bottom:1px solid #e2e8f0;">
        <span style="font-weight:700;font-size:1rem;color:#1a202c;">{{name}}</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <button onclick="toggleLang();toggleMoreDrawer();" style="font-size:0.7rem;font-weight:700;color:#718096;background:#f7fafc;border:1px solid #e2e8f0;border-radius:4px;padding:4px 10px;cursor:pointer;">${langLabel}</button>
          <button onclick="toggleMoreDrawer()" style="background:none;border:none;font-size:0.85rem;color:#718096;cursor:pointer;padding:4px 8px;">${closeLabel}</button>
        </div>
      </div>
      <div style="padding:12px 16px 20px;">
        ${sectionsHTML}
      </div>
      <div style="padding:0 16px 16px;">
        <button onclick="logout()" style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;background:none;color:#718096;font-size:0.875rem;cursor:pointer;font-family:inherit;">
          ${_t('nav_logout')}
        </button>
      </div>
    </div>`;

  // CSS del drawer
  if (!document.getElementById('more-drawer-styles')) {
    const style = document.createElement('style');
    style.id = 'more-drawer-styles';
    style.textContent = `
      .more-drawer-section { margin-bottom: 16px; }
      .more-drawer-group-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #a0aec0; padding: 0 4px; margin-bottom: 6px; }
      .more-drawer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
      .more-drawer-item { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 10px 4px; border-radius: 10px; text-decoration: none; color: #4a5568; font-size: 0.72rem; font-weight: 500; transition: background 0.15s; }
      .more-drawer-item:active { background: #f7fafc; }
      .more-drawer-icon { color: #1B2E5E; }
      .more-drawer-icon svg { width: 22px; height: 22px; }
      #more-drawer.open { transform: translateY(0) !important; }
    `;
    document.head.appendChild(style);
  }

  // Eliminar drawer anterior si existe
  document.getElementById('more-drawer')?.remove();
  document.getElementById('more-drawer-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', drawerHTML);
}

/**
 * Abre o cierra el drawer "Más" en móvil que muestra secciones secundarias.
 */
function toggleMoreDrawer() {
  const drawer   = document.getElementById('more-drawer');
  const backdrop = document.getElementById('more-drawer-backdrop');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    drawer.classList.remove('open');
    backdrop.style.display = 'none';
    setTimeout(() => { drawer.style.display = 'none'; }, 300);
  } else {
    drawer.style.display = 'block';
    backdrop.style.display = 'block';
    requestAnimationFrame(() => drawer.classList.add('open'));
  }
}

/**
 * Construye e inyecta el botón hamburguesa + drawer lateral (solo móvil).
 * @param {string} activePage
 */
function buildHamburger(activePage) {
  if (window.self !== window.top) return;
  const user = getCurrentUser();
  if (!user) return;

  const color = getAvatarColor(user.name);
  const initials = user.initials || user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = { admin: 'Administrador', miembro: 'Miembro', mod: 'Moderador' }[user.role] || user.role;

  // Construir nav items para el drawer
  let navHTML = '';
  NAV_ITEMS.forEach(group => {
    navHTML += `<div class="hb-group-label">${group.group}</div>`;
    group.items.forEach(item => {
      const active = item.id === (NAV_ACTIVE_ALIAS[activePage] || activePage) ? 'active' : '';
      navHTML += `<a href="${item.href}" class="hb-nav-item ${active}">${item.icon}<span>${item.label}</span></a>`;
    });
  });
  if (['admin', 'super_admin', 'staff'].includes(user.role)) {
    navHTML += `
      <div class="hb-divider"></div>
      <a href="admin.html" class="hb-nav-item${activePage === 'admin' ? ' active' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>
        <span>Panel Admin</span>
      </a>`;
  }

  const drawerHTML = `
    <div id="hb-overlay" onclick="closeHamburger()" style="display:none"></div>
    <div id="hb-drawer">
      <div class="hb-header">
        <a href="home.html" class="hb-logo" style="text-decoration:none;" onclick="closeHamburger()">
          <img src="img/{{brand.logoFile}}" alt="{{name}}" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;">
          <div>
            <div class="hb-logo-text">{{name}}</div>
            <div class="hb-logo-sub">{{tagline}}</div>
          </div>
        </a>
        <button class="hb-close" onclick="closeHamburger()" aria-label="Cerrar menú">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="hb-user">
        <div class="avatar avatar-md" data-color="${color}">${escHtml(initials)}</div>
        <div class="hb-user-info">
          <div class="hb-user-name">${escHtml(user.name)}</div>
          <div class="hb-user-role">${roleLabel}</div>
        </div>
      </div>
      <nav class="hb-nav">${navHTML}</nav>
      <div class="hb-footer">
        <button class="hb-logout" onclick="logout()">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"/></svg>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = `
    /* Hamburger button */
    #hb-btn {
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 500;
      width: 40px; height: 40px;
      border-radius: 10px;
      background: var(--color-primary, #1b2e5e);
      border: none;
      color: #fff;
      cursor: pointer;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 0;
      box-shadow: 0 2px 8px rgba(27,46,94,.25);
    }
    #hb-btn span {
      display: block;
      width: 18px; height: 2px;
      background: #fff;
      border-radius: 2px;
      transition: transform .2s, opacity .2s;
    }
    @media (max-width: 768px) {
      #hb-btn { display: flex; }
    }

    /* Overlay.
       z-index por encima de .bottom-nav (10000 en css/pages.css): si no, la
       barra inferior se pintaba ENCIMA del drawer y tapaba justo su footer,
       que es donde está "Cerrar sesión" — no había forma de llegar a él. */
    #hb-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 10050;
      backdrop-filter: blur(2px);
    }

    /* Drawer */
    #hb-drawer {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 280px;
      background: var(--color-surface, #fff);
      z-index: 10060;
      display: flex; flex-direction: column;
      transform: translateX(-100%);
      transition: transform .28s cubic-bezier(.4,0,.2,1);
      box-shadow: 4px 0 24px rgba(0,0,0,.15);
      /* hidden, NO auto: el que scrollea es .hb-nav (flex:1 + overflow-y).
         Con overflow en los dos, el scroll se iba al contenedor exterior y
         se llevaba cabecera y footer con él; así quedan fijos arriba/abajo
         y solo se desplaza la lista de secciones. */
      overflow: hidden;
      padding-top: env(safe-area-inset-top, 0px);
    }
    #hb-drawer.open { transform: translateX(0); }

    .hb-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }
    .hb-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .hb-logo-icon {
      width: 36px; height: 36px;
      background: var(--color-primary, #1b2e5e);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #c9a84c;
      flex-shrink: 0;
    }
    .hb-logo-icon svg { width: 20px; height: 20px; }
    .hb-logo-text { font-size: 15px; font-weight: 700; color: var(--color-primary, #1b2e5e); }
    .hb-logo-sub { font-size: 10px; color: var(--color-text-muted, #64748b); }
    .hb-close {
      width: 32px; height: 32px;
      background: var(--color-bg, #f8fafc);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 8px;
      cursor: pointer; color: var(--color-text, #1e293b);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .hb-close svg { width: 16px; height: 16px; }

    .hb-user {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }
    .hb-user-name { font-size: 13px; font-weight: 600; color: var(--color-text, #1e293b); }
    .hb-user-role { font-size: 11px; color: var(--color-text-muted, #64748b); }

    .hb-nav { flex: 1; padding: 8px 10px; overflow-y: auto; }
    .hb-group-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: var(--color-text-muted, #64748b);
      padding: 12px 8px 4px;
    }
    .hb-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 8px;
      text-decoration: none; color: var(--color-text, #1e293b);
      font-size: 13.5px; font-weight: 500;
      transition: background .15s, color .15s;
      margin-bottom: 1px;
    }
    .hb-nav-item svg { width: 18px; height: 18px; flex-shrink: 0; opacity: .7; }
    .hb-nav-item:hover { background: var(--color-bg, #f8fafc); }
    .hb-nav-item.active {
      background: var(--color-primary, #1b2e5e);
      color: #fff;
    }
    .hb-nav-item.active svg { opacity: 1; }
    .hb-divider { height: 1px; background: var(--color-border, #e2e8f0); margin: 8px 0; }

    .hb-footer {
      padding: 12px 16px;
      /* + safe area: el botón de cerrar sesión es lo último del drawer y
         quedaría bajo la barra de gestos del iPhone. */
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }
    .hb-logout {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 9px 10px; border-radius: 8px;
      background: none; border: none; cursor: pointer;
      color: #dc2626; font-size: 13.5px; font-weight: 500;
    }
    .hb-logout svg { width: 18px; height: 18px; }
    .hb-logout:hover { background: #fef2f2; }
  `;
  document.head.appendChild(style);

  // Botón hamburguesa
  const btn = document.createElement('button');
  btn.id = 'hb-btn';
  btn.setAttribute('aria-label', 'Abrir menú');
  btn.innerHTML = `<span></span><span></span><span></span>`;
  btn.onclick = openHamburger;
  document.body.appendChild(btn);

  // Drawer + overlay
  const wrapper = document.createElement('div');
  wrapper.innerHTML = drawerHTML;
  document.body.appendChild(wrapper.children[0]); // overlay
  document.body.appendChild(wrapper.children[0]); // drawer
}

function openHamburger() {
  document.getElementById('hb-overlay').style.display = 'block';
  document.getElementById('hb-drawer').classList.add('open');
}
function closeHamburger() {
  document.getElementById('hb-overlay').style.display = 'none';
  document.getElementById('hb-drawer').classList.remove('open');
}

/**
 * Inyecta el botón de volver atrás en todas las páginas excepto home.
 * @param {string} activePage - id de la página activa
 */
function buildBackBtn(activePage) {
  if (window.self !== window.top) return;
  if (activePage === 'home') return;

  const btn = document.createElement('button');
  btn.id = 'global-back-btn';
  btn.setAttribute('aria-label', 'Volver atrás');
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>`;
  btn.onclick = () => {
    let prev = null;
    try {
      const stack = JSON.parse(sessionStorage.getItem('kehila_nav_stack') || '[]');
      stack.pop(); // la página actual
      prev = stack[stack.length - 1] || null;
      sessionStorage.setItem('kehila_nav_stack', JSON.stringify(stack));
      sessionStorage.setItem('kehila_nav_going_back', '1');
    } catch (_) { /* sin sessionStorage: cae al history.back() de abajo */ }

    const overlay = document.getElementById('pt-overlay');
    const vt = document.documentElement.classList.contains('vt');
    if (overlay && !vt) document.body.classList.remove('page-ready');

    setTimeout(() => {
      if (prev) window.location.href = prev;
      else history.back();
    }, 60);
  };

  const style = document.createElement('style');
  style.textContent = `
    #global-back-btn {
      position: fixed;
      top: 16px;
      left: calc(var(--sidebar-width, 240px) + 16px);
      z-index: 200;
      width: 36px; height: 36px;
      border-radius: 50%;
      background: white;
      border: 1.5px solid var(--color-border, #e2e8f0);
      color: var(--color-text, #1e293b);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 6px rgba(0,0,0,0.10);
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    #global-back-btn:hover {
      border-color: var(--color-primary, #1b2e5e);
      box-shadow: 0 2px 10px rgba(0,0,0,0.14);
    }
    @media (max-width: 768px) {
      #global-back-btn {
        left: 62px;
        top: 12px;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(btn);

}

/**
 * Inicializa sidebar y bottom nav.
 * @param {string} activePage - id de la página
 */
/**
 * Punto de entrada principal. Inicializa todos los componentes de navegación.
 * Llamar en DOMContentLoaded en cada página protegida.
 *
 * @param {string} activePage - ID de la sección activa (debe existir en NAV_ITEMS)
 *
 * @example
 * document.addEventListener('DOMContentLoaded', () => {
 *   requireAuth();
 *   initNav('eventos');
 *   trackPageView('eventos');
 * });
 */
// ─── Sub-page group tabs ────────────────────────────────────────────────────
const _SUB_GROUPS = {
  business: 'jconnect',
  shiurim: 'rav-hub', rav: 'rav-hub', 'citas-rabino': 'rav-hub'
};
const _SUB_TABS = {
  jconnect: [
    { id: 'business',      label: 'Negocios',         href: 'business.html' }
  ],
  'rav-hub': [
    { id: 'shiurim',       label: 'Shiurim',          href: 'shiurim.html' },
    { id: 'rav',           label: 'Preguntas al Rav',  href: 'rav.html' },
    { id: 'citas-rabino',  label: 'Cita con el Rav',   href: 'citas-rabino.html' }
  ]
};
Object.keys(_SUB_TABS).forEach(k => { _SUB_TABS[k] = _SUB_TABS[k].filter(t => navModuleOn(t.id)); });

function renderSubTabs(pageId) {
  if (window.self !== window.top) return;
  var group = _SUB_GROUPS[pageId];
  if (!group) return;
  var tabs = _SUB_TABS[group];
  if (!tabs) return;

  // ── Inject page-transition styles once ──────────────────────────────
  if (!document.getElementById('sub-tab-transition-styles')) {
    var s = document.createElement('style');
    s.id = 'sub-tab-transition-styles';
    s.textContent = [
      '@keyframes _stFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
      '.main-content{animation:_stFadeIn 0.18s ease both;}'
    ].join('');
    document.head.appendChild(s);
  }

  var GROUP_META = {
    jconnect:  { title: '{{labels.business}}',         subtitle: 'Directorio y comercio de la comunidad' },
    'rav-hub': { title: 'Torá y Comunidad',  subtitle: 'Shiurim, consultas y citas con el Rav' }
  };
  var meta = GROUP_META[group] || { title: group, subtitle: '' };

  var wrapper = document.createElement('div');
  wrapper.id = 'sub-tabs-bar';
  wrapper.innerHTML =
    '<div style="padding:24px 0 0;">' +
      '<h1 style="font-size:1.5rem;font-weight:700;color:var(--color-text);margin:0 0 4px;font-family:var(--font-brand);">' + escHtml(meta.title) + '</h1>' +
      '<p style="font-size:0.875rem;color:var(--color-text-muted);margin:0 0 16px;">' + escHtml(meta.subtitle) + '</p>' +
    '</div>' +
    '<div id="sub-tabs-row" style="display:flex;border-bottom:2px solid var(--color-border);overflow-x:auto;scrollbar-width:none;margin-bottom:24px;"></div>';

  // Insert at the top of the page's inner content container
  var inner = document.querySelector('.main-content > div');
  var container = inner || document.querySelector('.main-content');
  if (!container) return;
  container.insertAdjacentElement('afterbegin', wrapper);

  var row = document.getElementById('sub-tabs-row');
  tabs.forEach(function(tab) {
    var active = tab.id === pageId;
    var a = document.createElement('a');
    a.href = tab.href;
    a.textContent = tab.label;
    a.style.cssText = 'display:inline-flex;align-items:center;padding:10px 18px;font-size:0.875rem;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? 'var(--color-primary)' : 'var(--color-text-muted)') + ';text-decoration:none;border-bottom:2.5px solid ' + (active ? 'var(--color-primary)' : 'transparent') + ';margin-bottom:-2px;white-space:nowrap;font-family:inherit;transition:color 0.15s,border-color 0.15s;';
    if (!active) {
      a.addEventListener('mouseenter', function() { a.style.color = 'var(--color-text)'; });
      a.addEventListener('mouseleave', function() { a.style.color = 'var(--color-text-muted)'; });
    }
    // La transición suave entre páginas la hace ahora la View Transitions API
    // nativa (ver css/main.css) — este handler ya no retrasa la navegación.
    row.appendChild(a);
  });
}

// Lock viewport: disable zoom and horizontal scroll in native WKWebView app
(function() {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

  // Block pinch-zoom gestures at the JS level (WebKit-specific events)
  document.addEventListener('gesturestart',  function(e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gestureend',    function(e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();

/* ─── Tracking de analíticas ──────────────────────────────────────
   Estas dos funciones viven aquí (no en analytics.js) porque nav.js
   se carga en TODAS las páginas, mientras que analytics.js solo se
   carga en admin.html. Escriben en Supabase; el dashboard del panel
   admin (js/analytics.js) las lee. Fallo silencioso: nunca deben
   romper la navegación.
   ───────────────────────────────────────────────────────────────── */

// Tras un 42501 (permiso denegado) dejamos de intentar escribir analytics
// en esta carga de página: reintentar en cada navegación no arregla nada
// (la sesión sigue sin ser válida) y solo genera más errores en logs/Sentry.
let _analyticsBlocked = false;

/** Registra una visita a una sección. Llamada desde initNav(). */
async function trackPageView(page) {
  if (_analyticsBlocked || !page) return;
  try {
    const sb = typeof getSupabase === 'function' ? getSupabase() : null;
    if (!sb) return;
    // user_id sale de la sesión real de Supabase, nunca del objeto local
    // (kehila_user es manipulable y puede no corresponder a ninguna sesión).
    const session = typeof getValidSession === 'function' ? await getValidSession() : null;
    if (!session) return; // sin sesión real: no se escribe

    const localUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (localUser && ['pending', 'banned', 'suspended'].includes(localUser.status)) return;

    const row = { page: String(page), user_id: session.user.id };
    if (typeof getAppPlatform === 'function') {
      row.platform = getAppPlatform();
      row.session_id = getAnalyticsSessionId();
    }
    let { error } = await sb.from('page_views').insert(row);
    // Columnas platform/session_id aún no creadas (migración analytics v2): reintento sin ellas
    if (error && error.code === 'PGRST204') {
      ({ error } = await sb.from('page_views').insert({ page: row.page, user_id: row.user_id }));
    }
    // Primera sección de esta visita: un evento con plataforma y versión de la app
    if (!error && typeof trackEvent === 'function') {
      try {
        if (!sessionStorage.getItem('kehila_an_started')) {
          sessionStorage.setItem('kehila_an_started', '1');
          trackEvent('sesion_inicio');
        }
      } catch { /* sessionStorage bloqueado */ }
    }
    if (error) {
      if (error.code === '42501') _analyticsBlocked = true;
      console.warn('[analytics] page_views:', error.message);
    }
  } catch (e) {
    console.warn('[analytics] page_views falló:', e);
  }
}

/** Registra la lectura de una noticia. Llamada desde abrirNoticia() en noticias.js. */
async function trackNewsRead(newsId) {
  if (_analyticsBlocked || !newsId) return;
  try {
    const sb = typeof getSupabase === 'function' ? getSupabase() : null;
    if (!sb) return;
    const session = typeof getValidSession === 'function' ? await getValidSession() : null;
    if (!session) return;

    const localUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (localUser && ['pending', 'banned', 'suspended'].includes(localUser.status)) return;

    const { error } = await sb.from('news_reads').insert({
      news_id: String(newsId),
      user_id: session.user.id
    });
    if (error) {
      if (error.code === '42501') _analyticsBlocked = true;
      console.warn('[analytics] news_reads:', error.message);
    }
  } catch (e) {
    console.warn('[analytics] news_reads falló:', e);
  }
}

function initNav(activePage) {
  if (typeof trackPageView === 'function') trackPageView(activePage);
  loadBuzon();
  // Cargar i18n.js si no está disponible
  if (typeof t === 'undefined' && !document.querySelector('script[src*="i18n"]')) {
    const s = document.createElement('script');
    s.src = 'js/i18n.js';
    s.onload = () => { buildSidebar(activePage); buildBottomNav(activePage); buildHamburger(activePage); buildBackBtn(activePage); buildLegalFooter(); renderSubTabs(activePage); };
    document.head.appendChild(s);
    return;
  }
  buildSidebar(activePage);
  buildBottomNav(activePage);
  buildHamburger(activePage);
  buildBackBtn(activePage);
  buildLegalFooter();
  renderSubTabs(activePage);
}

/** Campana de notificaciones (js/buzon.js), una sola vez por página. */
function loadBuzon() {
  if (document.querySelector('script[src*="js/buzon.js"]')) return;
  const s = document.createElement('script');
  s.src = 'js/buzon.js';
  s.defer = true;
  document.head.appendChild(s);
}

/**
 * Muestra un toast de notificación.
 * @param {string} message - Texto del mensaje
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms antes de desaparecer (default 3500)
 */
/**
 * Muestra una notificación toast temporal en la esquina inferior de la pantalla.
 * Se puede llamar desde cualquier página que haya cargado nav.js.
 *
 * @param {string} message        - Texto a mostrar
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Tipo de toast
 * @param {number} [duration=3500] - Duración en milisegundos antes de desaparecer
 *
 * @example
 * showToast('Cambios guardados', 'success');
 * showToast('Error al conectar', 'error', 5000);
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="toast-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="toast-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="toast-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="toast-icon"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>`
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span class="toast-message">${escHtml(message)}</span>`;

  toast.addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);

  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('hide');
  setTimeout(() => toast.remove(), 350);
}

/* ─── Legal Footer ────────────────────────────────────────────────
   Se inyecta automáticamente al final de .main-content en cada página
   ────────────────────────────────────────────────────────────────── */
/**
 * Genera el HTML del footer legal (Aviso Legal, Privacidad, Cookies).
 * Se inyecta al final del sidebar desktop.
 *
 * @returns {string} HTML string del footer
 */
function buildLegalFooter() {
  // No crear footer dentro de iframes
  if (window.self !== window.top) return;
  // Siempre eliminar todos los footers existentes antes de crear uno nuevo
  document.querySelectorAll('#legal-footer').forEach(el => el.remove());

  // Inyectar estilos una sola vez
  if (!document.getElementById('legal-footer-styles')) {
    const s = document.createElement('style');
    s.id = 'legal-footer-styles';
    s.textContent = `
      .legal-footer {
        border-top: 1px solid var(--color-border-light);
        padding: 20px 24px;
        margin-top: 48px;
      }
      .legal-footer-inner {
        max-width: 1100px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
      }
      .legal-footer-copy {
        font-size: 0.775rem;
        color: var(--color-text-muted);
      }
      .legal-footer-links {
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
      }
      .legal-footer-links a {
        font-size: 0.775rem;
        color: var(--color-text-muted);
        text-decoration: none;
        transition: color 0.15s;
      }
      .legal-footer-links a:hover { color: var(--color-primary); }
      @media (max-width: 480px) {
        .legal-footer-inner { flex-direction: column; align-items: flex-start; gap: 8px; }
      }
    `;
    document.head.appendChild(s);
  }

  const footer = document.createElement('footer');
  footer.id = 'legal-footer';
  footer.className = 'legal-footer';
  footer.innerHTML = `
    <div class="legal-footer-inner">
      <span class="legal-footer-copy">&copy; ${new Date().getFullYear()} {{name}}</span>
      <nav class="legal-footer-links">
        <a href="privacidad.html">Pol&iacute;tica de Privacidad</a>
        <a href="aviso-legal.html">Aviso Legal</a>
        <a href="cookies.html">Cookies</a>
      </nav>
    </div>`;

  const main = document.querySelector('.main-content');
  if (main) main.appendChild(footer);
}
