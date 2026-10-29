/**
 * @file router.js
 * @description Router SPA para todas las páginas internas de la app (excepto
 * index.html, reset-password.html, eliminar-cuenta.html, admin.html y las
 * páginas puramente estáticas/de redirección).
 *
 * Intercepta navegaciones internas entre páginas de SPA_PAGES (vía el hook
 * window.__spaTryNavigate, consumido por el listener de clics ya existente
 * en nav.js) y las resuelve con un fetch + swap de <body>, sin recarga
 * completa. Fuera de esta lista, todo sigue funcionando igual que antes
 * (recarga normal con el overlay de nav.js).
 *
 * LIMPIEZA: los intervals/timeouts y los listeners de document/window que
 * registre el script de la página se registran automáticamente (parcheando
 * setInterval/setTimeout/addEventListener) y se limpian antes de entrar a
 * la siguiente página, para que no se acumulen en navegaciones repetidas
 * dentro del mismo documento.
 */
(function () {
  const SPA_PAGES = [
    'home.html', 'eventos.html', 'noticias.html',
    'calendario.html', 'galeria.html', 'mikve.html', 'siddur.html',
    'business.html', 'citas-rabino.html', 'contacto.html', 'donativos.html',
    'noticia.html', 'perfil.html',
    'rav.html', 'servicios.html', 'shiurim.html', 'voluntariado.html'
  ];

  // Scripts compartidos que ya están cargados en el documento persistente:
  // no se vuelven a añadir en cada navegación. Cualquier <script src> que
  // no matchee aquí (ej. js/noticias.js) se trata como propio de la página
  // y se reinyecta fresco en cada visita.
  const PERSISTENT_SRC = [
    /supabase-js/, /stripe\.com/, /_vercel\//,
    /js\/data\.js/, /js\/i18n\.js/, /js\/auth\.js/, /js\/nav\.js/,
    /js\/familia\.js/, /js\/media\.js/, /js\/router\.js/, /js\/push\.js/
  ];

  function fileOf(pathname) {
    return pathname.split('/').pop() || 'index.html';
  }

  function isSpaPage(pathname) {
    const file = fileOf(pathname);
    return SPA_PAGES.includes(file) ? file : null;
  }

  let tracking = null;

  function installTracking() {
    tracking = { intervals: [], timeouts: [], listeners: [] };

    const origSI = window.setInterval.bind(window);
    window.setInterval = function (fn, ms, ...rest) {
      const id = origSI(fn, ms, ...rest);
      tracking.intervals.push(id);
      return id;
    };

    const origST = window.setTimeout.bind(window);
    window.setTimeout = function (fn, ms, ...rest) {
      const id = origST(fn, ms, ...rest);
      tracking.timeouts.push(id);
      return id;
    };

    [document, window].forEach((target) => {
      const origAdd = target.addEventListener.bind(target);
      target.addEventListener = function (type, fn, opts) {
        tracking.listeners.push({ target, type, fn, opts });
        return origAdd(type, fn, opts);
      };
    });
  }

  function cleanupTracked() {
    if (!tracking) return;
    tracking.intervals.forEach((id) => clearInterval(id));
    tracking.timeouts.forEach((id) => clearTimeout(id));
    tracking.listeners.forEach(({ target, type, fn, opts }) => {
      try { target.removeEventListener(type, fn, opts); } catch (_) {}
    });
    tracking = null;
  }

  function isPersistentSrc(src) {
    return PERSISTENT_SRC.some((re) => re.test(src));
  }

  function runScripts(scripts) {
    return scripts.reduce((chain, old) => chain.then(() => {
      if (old.src) {
        if (isPersistentSrc(old.src)) return;
        return new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = old.src;
          s.onload = resolve;
          s.onerror = resolve;
          document.body.appendChild(s);
        });
      }
      const s = document.createElement('script');
      s.textContent = old.textContent;
      document.body.appendChild(s);
    }), Promise.resolve());
  }

  async function navigate(file, url, push) {
    let html;
    try {
      const res = await fetch(url.href, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('bad status ' + res.status);
      html = await res.text();
    } catch (_) {
      // Fallback seguro: navegación normal completa.
      window.location.href = url.href;
      return;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.body.querySelectorAll('script'));
    scripts.forEach((s) => s.remove());

    cleanupTracked();

    document.title = doc.title;
    document.body.innerHTML = doc.body.innerHTML;
    document.body.className = doc.body.className;
    document.body.classList.remove('page-ready');

    if (push) history.pushState({ spa: true, file }, '', url.href);
    currentFile = file;

    installTracking();
    await runScripts(scripts);
    window.scrollTo(0, 0);
    document.body.classList.add('page-ready');
  }

  let currentFile = fileOf(location.pathname);

  // DESACTIVADO TEMPORALMENTE (2026-09-15): el swap solo reemplaza <body>,
  // nunca <head> -> el <style> propio de cada pagina nunca se aplica al
  // navegar por SPA, dejando la pagina destino con el CSS de la pagina
  // anterior (iconos SVG sin su tamano real, texto decorativo sin contener,
  // grids rotos). Reactivar solo despues de que navigate() tambien
  // reconcilie <head> (o inyecte los <style> de la pagina destino).
  window.__spaTryNavigate = function () {
    return false;
  };

  // NOTA (2026-09-16): antes forzaba window.location.reload() en cada
  // popstate. Con __spaTryNavigate desactivado ya no hace falta (no hay
  // estado de navegación SPA que reconciliar) y era la causa de que el
  // botón atrás del hardware en Android se quedara "pensando": interceptaba
  // el goBack() nativo del WebView y forzaba una recarga completa (con su
  // requireAuth()/verifyAdminRealtime() async) en vez de dejar que el
  // WebView mostrara la página anterior directamente.

  installTracking();
})();
