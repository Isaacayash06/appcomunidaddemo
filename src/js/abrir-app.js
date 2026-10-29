/**
 * @file abrir-app.js
 * @description Barra «Abrir en la app» para quien abre un enlace de
 * {{domain}} (p. ej. un evento compartido por WhatsApp) en el navegador
 * del móvil en vez de en la app.
 *
 *  Como el enlace de /descarga: detecta iPhone o Android.
 *  · Primero intenta abrir la app en esta misma página con el esquema propio
 *    {{app.scheme}}://ruta (Info.plist / AndroidManifest). En iPhone solo si la
 *    versión de la App Store ya lo incluye (se consulta su fecha).
 *  · Si no se abre, lleva a la App Store / Google Play, que muestran «Abrir»
 *    si ya está instalada.
 *  · En Safari, además, el Smart App Banner de Apple (meta apple-itunes-app).
 *
 * No se muestra dentro de la app, en ordenador ni si el usuario la cerró
 * (se recuerda 7 días).
 */
(function () {
  const APP_STORE = '{{stores.appStore}}';
  const PLAY = '{{stores.playStore}}';
  const CERRADA_KEY = 'kehila_abrir_app_cerrada';

  if (window.Capacitor?.isNativePlatform?.()) return;
  if (window.self !== window.top) return;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!ios && !android) return;

  // Smart App Banner de Safari (iOS): «Abrir» si la tiene, «Obtener» si no
  if (ios && !document.querySelector('meta[name="apple-itunes-app"]')) {
    const m = document.createElement('meta');
    m.name = 'apple-itunes-app';
    m.content = `app-id=6781786203, app-argument=${location.href}`;
    document.head.appendChild(m);
  }

  try {
    const t = Number(localStorage.getItem(CERRADA_KEY) || 0);
    if (Date.now() - t < 7 * 864e5) return;
  } catch (_) { /* sin storage: se muestra */ }

  // Limpia la marca de la versión anterior del botón (?abrir_app=1)
  const params = new URLSearchParams(location.search);
  if (params.has('abrir_app')) {
    params.delete('abrir_app');
    const q = params.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (_) {}
  }
  const ruta = location.pathname + location.search + location.hash;
  const rutaApp = ruta.replace(/^\//, '') || 'home.html';

  // Tiendas: abren directamente la app de la App Store / Google Play, que
  // muestran «Abrir» si ya está instalada y «Obtener/Instalar» si no.
  const TIENDA = ios ? APP_STORE : 'market://details?id={{app.androidPackage}}';

  // Esquema propio ({{app.scheme}}://ruta): abre la app en esta misma página, como
  // TikTok o Instagram. En iPhone solo existe a partir de la versión que
  // salga después de la 1.0.5 (publicada el 19-10-2026, que NO lo lleva); se
  // comprueba la fecha de la versión de la App Store para no intentarlo con
  // una que no lo tiene (Safari mostraría «dirección no válida»).
  const ESQUEMA_DESDE = '2026-10-20T00:00:00Z';
  async function iosTieneEsquema() {
    try {
      const c = sessionStorage.getItem('kehila_app_esquema');
      if (c) return c === '1';
      const r = await fetch('https://itunes.apple.com/lookup?id=6781786203&country=es', { signal: AbortSignal.timeout(4000) });
      const fecha = (await r.json()).results?.[0]?.currentVersionReleaseDate || '';
      const si = fecha > ESQUEMA_DESDE;
      sessionStorage.setItem('kehila_app_esquema', si ? '1' : '0');
      return si;
    } catch (_) { return false; }
  }
  let iosEsquema = false;
  if (ios) iosTieneEsquema().then(v => { iosEsquema = v; });

  /** Intenta abrir la app; si a los 1,5 s seguimos en la web, va a la tienda. */
  function abrirApp(e) {
    e.preventDefault();
    if (android) {
      // Chrome: abre la app si la versión instalada conoce el esquema; si no
      // (o no está instalada), abre Google Play por sí solo.
      location.href = `intent://${rutaApp}#Intent;scheme={{app.scheme}};package={{app.androidPackage}};S.browser_fallback_url=${encodeURIComponent(TIENDA)};end`;
      return;
    }
    if (!iosEsquema) { location.href = TIENDA; return; }
    let salio = false;
    const marcar = () => { salio = true; };
    document.addEventListener('visibilitychange', marcar, { once: true });
    window.addEventListener('pagehide', marcar, { once: true });
    location.href = '{{app.scheme}}://' + rutaApp;
    setTimeout(() => { if (!salio && !document.hidden) location.href = TIENDA; }, 1500);
  }

  function pintar() {
    if (document.getElementById('abrir-app-bar')) return;
    const st = document.createElement('style');
    st.textContent = `
      #abrir-app-bar { position: fixed; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 10040;
        display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 12px; border-radius: 14px;
        background: #1B2E5E; color: #fff; box-shadow: 0 8px 28px rgba(0,0,0,.25); font-family: Inter, system-ui, sans-serif; }
      #abrir-app-bar img { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; }
      #abrir-app-bar .aa-txt { flex: 1; min-width: 0; font-size: .8rem; line-height: 1.3; }
      #abrir-app-bar .aa-txt b { display: block; font-size: .85rem; }
      #abrir-app-bar .aa-txt a { color: #C9A84C; text-decoration: none; font-size: .72rem; }
      #abrir-app-bar .aa-btn { background: #C9A84C; color: #1B2E5E; font-weight: 700; font-size: .8rem; padding: 9px 14px;
        border-radius: 10px; text-decoration: none; white-space: nowrap; }
      #abrir-app-bar .aa-x { background: none; border: none; color: rgba(255,255,255,.6); font-size: 1.3rem; line-height: 1; padding: 0 2px; cursor: pointer; }
`;
    document.head.appendChild(st);

    const bar = document.createElement('div');
    bar.id = 'abrir-app-bar';
    bar.innerHTML = `
      <img src="img/icon-192.png" alt="">
      <div class="aa-txt"><b>{{name}}</b>Mejor en la app · <a href="${ios ? APP_STORE : PLAY}" target="_blank" rel="noopener">¿No la tienes? Descárgala</a></div>
      <a class="aa-btn" href="${ios ? APP_STORE : PLAY}">Abrir en la app</a>
      <button class="aa-x" aria-label="Cerrar">&times;</button>`;
    bar.querySelector('.aa-x').onclick = () => {
      bar.remove();
      try { localStorage.setItem(CERRADA_KEY, String(Date.now())); } catch (_) {}
    };
    document.body.appendChild(bar);

    bar.querySelector('.aa-btn').addEventListener('click', abrirApp);
    // Si la página tiene barra de navegación inferior (móvil), subimos la nuestra
    if (document.querySelector('.bottom-nav')) bar.style.bottom = 'calc(76px + env(safe-area-inset-bottom, 0px))';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(pintar, 600));
  else setTimeout(pintar, 600);
})();
