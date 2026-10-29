/* =============================================
   {{name}} — Service Worker
   Estrategia: precache del "cascarón" + stale-while-revalidate.

   1) PRECACHE (install): al instalar se descargan de una vez TODAS las
      páginas .html, el CSS y el JS de la app. A partir de ahí, cambiar de
      pestaña NO espera red: el documento nuevo se sirve al instante desde
      caché (adiós al parpadeo / pantalla en blanco al navegar).
   2) stale-while-revalidate (fetch): responde al instante desde caché si
      existe y actualiza esa caché en segundo plano para la próxima visita.
   3) Supabase queda SIEMPRE fuera de la caché (datos siempre frescos),
      salvo las FOTOS con URL firmada (/storage/v1/object/sign/...), que se
      guardan en MEDIA_CACHE con "caché primero": así al abrir la app se
      pintan al instante desde el dispositivo (web, PWA y Android; en la app
      iOS no hay service worker y lo cubre la cabecera Cache-Control).

   Push: muestra notificación nativa cuando la app está cerrada.
   ============================================= */

const CACHE = '{{slug}}-{{buildId}}';
// Caché de fotos aparte y SIN versión: sobrevive a las subidas de versión
// del SW (cada foto tiene nombre único y no cambia). Se vacía al cerrar
// sesión (auth.js → clearPrivateSession) y se limita a MEDIA_MAX_ENTRIES.
const MEDIA_CACHE = 'kehila-media-v1';
const MEDIA_MAX_ENTRIES = 300;

// El cascarón completo de la app. Se precachea al instalar el SW para que
// la navegación entre secciones sea instantánea.
const PRECACHE = [
  '/admin.html',
  '/aviso-legal.html',
  '/business.html',
  '/calendario.html',
  '/citas-rabino.html',
  '/contacto.html',
  '/cookies.html',
  '/donativos.html',
  '/eliminar-cuenta.html',
  '/eventos.html',
  '/galeria.html',
  '/home.html',
  '/index.html',
  '/mikve.html',
  '/noticia.html',
  '/noticias.html',
  '/perfil.html',
  '/privacidad.html',
  '/rav-hub.html',
  '/rav.html',
  '/reset-password.html',
  '/servicios.html',
  '/shiurim.html',
  '/siddur.html',
  '/voluntariado.html',
  '/css/components.css',
  '/css/main.css',
  '/css/pages.css',
  '/css/siddur.css',
  '/js/analytics.js',
  '/js/auth.js',
  '/js/buzon.js',
  '/js/perfil-notif.js',
  '/js/data.js',
  '/js/familia.js',
  '/js/i18n.js',
  '/js/lang-en.js',
  '/js/lang-en-dict.js',
  '/js/media.js',
  '/js/nav.js',
  '/js/noticias.js',
  '/js/push.js',
  '/js/registro.js',
  '/js/router.js',
  '/js/siddur.js',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/logo.svg',
  // Librerías que bloquean el render en cada página. Se sirven desde /vendor
  // (mismo dominio) para no depender de CDNs detrás de Cloudflare.
  '/vendor/supabase.min.js',
  '/vendor/supabase.js',
  '/vendor/chart.umd.min.js',
  '/vendor/cropper.min.js',
  '/vendor/cropper.min.css',
];

// Instalar: precachear el cascarón y activar sin esperar.
// Cada recurso se añade por separado: si uno falla (404, offline puntual)
// no se aborta toda la instalación.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        PRECACHE.map(url =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos, tomar control inmediato y recargar las
// páginas abiertas para que apliquen la versión nueva sin depender de que
// el usuario cierre y reabra la app (en iOS la comprobación de SW nuevo
// tarda mucho más en dispararse por sí sola que en Android/Chrome).
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clientList => clientList.forEach(c => { try { c.navigate(c.url); } catch (_) {} }))
  );
});

/* ─── Push: recibir notificación cuando la app está cerrada (Web PWA) ─── */
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch (_) { payload = { title: '{{name}}', body: e.data.text() }; }

  const { title = '{{name}}', body = '', data = {} } = payload;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/img/icon-192.png',
      badge: '/img/icon-96.png',
      vibrate: [100, 50, 100],
      data,
      actions: [{ action: 'open', title: 'Ver' }],
    })
  );
});

/* ─── Notificationclick: abrir la app en la página correcta ─── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const ROUTES = { evento:'eventos.html', noticia:'noticias.html', rav:'rav.html', donativo:'donativos.html', calendario:'calendario.html' };
  const destino = ROUTES[data.tipo] || 'home.html';
  const url = '/' + destino + (data.id ? '?id=' + encodeURIComponent(data.id) : '');
  e.waitUntil(clients.matchAll({ type:'window' }).then(clientList => {
    const existing = clientList.find(c => c.url.includes(destino));
    if (existing) return existing.focus();
    return clients.openWindow(url);
  }));
});

/* ─── Fotos firmadas: caché primero ───
   La clave es la ruta SIN el ?token= (la firma cambia, la foto no), así una
   foto ya bajada se reutiliza aunque media.js haya renovado su enlace. Solo
   imágenes (no audios de shiurim ni JSON) y solo respuestas 200 de imagen. */
function isSignedMediaRequest(req, url) {
  return req.method === 'GET'
    && req.destination === 'image'
    && url.pathname.includes('/storage/v1/object/sign/');
}

async function mediaCacheFirst(req, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  const type = res.headers.get('content-type') || '';
  if (res.ok && type.startsWith('image/')) {
    cache.put(key, res.clone()).then(() => trimMediaCache(cache)).catch(() => {});
  }
  return res;
}

async function trimMediaCache(cache) {
  const keys = await cache.keys();
  // cache.keys() devuelve en orden de inserción: fuera las más antiguas
  for (let i = 0; i < keys.length - MEDIA_MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

// Fetch: stale-while-revalidate — caché al instante, red en segundo plano
self.addEventListener('fetch', e => {
  const reqUrl = new URL(e.request.url);
  if (isSignedMediaRequest(e.request, reqUrl)) {
    e.respondWith(mediaCacheFirst(e.request, reqUrl).catch(() => fetch(e.request)));
    return;
  }
  // Supabase (directo o a través del proxy /sb/ de Vercel) nunca se cachea.
  if (e.request.url.includes('supabase.co')) return;
  if (reqUrl.pathname.startsWith('/sb/')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('/home.html');
      });

      // Si hay versión en caché, responde con ella al instante y deja que
      // la petición de red actualice la caché para la próxima vez.
      return cached || network;
    })
  );
});
