/**
 * @file auth.js
 * @description Autenticacion, gestion de sesion y guards de ruta para la plataforma.
 *
 * Responsabilidades:
 *  - Singleton Supabase via getSupabase()
 *  - Login / Logout / Registro contra Supabase Auth
 *  - Sesión Auth compartida y memoizada: ensureSession() / getValidSession()
 *  - Guards: requireAuth(), requireAdmin(), verifyAdminRealtime() (todos async)
 *  - Helpers: getAvatarColor(), renderAvatar()
 *
 * DEPENDENCIAS: cargar CDN supabase-js ANTES que este archivo.
 *
 * SEGURIDAD (ver CLAUDE.md apartado 8):
 *  [SEC-01] requireAdmin() es solo una comprobación de UI (rol cacheado).
 *           Usar verifyAdminRealtime() en operaciones destructivas/lectura
 *           privada de admin. verifyAdminRealtime() NUNCA concede acceso
 *           por la identidad local ante un error: siempre exige confirmar
 *           el rol contra Supabase.
 *  [SEC-02] Sesion en localStorage: persistente y legible por JS. Es solo
 *           una identidad cacheada para pintar la UI, NUNCA prueba de
 *           autenticación — la prueba real es la sesión de Supabase.
 *  [SEC-03] anon key publica por diseno. Segura SOLO con RLS + GRANT activos
 *           en Supabase (anon sin acceso a tablas privadas).
 *
 * DEBUG: cambiar AUTH_DEBUG a true para ver logs en consola.
 */

/** Controla si se muestran logs de debug. Poner false en produccion. */
const AUTH_DEBUG = false;

// ─── Configuración Supabase ───────────────────
// En producción ({{domain}} y previews de Vercel) Supabase se llama a través
// del proxy /sb/ definido en vercel.json: el navegador solo habla con Vercel y
// no con las IPs de Cloudflare que bloquean las operadoras durante el fútbol.
// En local (o si hay que revertir rápido) se usa la URL directa.
const SUPABASE_DIRECT_URL = '{{integrations.supabaseUrl}}';
const SUPABASE_USE_PROXY = {{integrations.supabaseProxy}} && (window.location.hostname === '{{domain}}' || window.location.hostname === 'www.{{domain}}' || /\.vercel\.app$/.test(window.location.hostname));
const SUPABASE_URL = SUPABASE_USE_PROXY ? window.location.origin + '/sb' : SUPABASE_DIRECT_URL;
// Nombre fijo de la sesión en localStorage: es el que supabase-js genera para
// la URL directa. Sin esto, al cambiar SUPABASE_URL se perdería la sesión de
// todos los usuarios.
const SUPABASE_STORAGE_KEY = 'sb-{{integrations.supabaseRef}}-auth-token';
const SUPABASE_ANON_KEY = '{{integrations.supabaseAnonKey}}';

// Modo demo (integrations.demoLogin): «Entrar» acepta cualquier email/contraseña
// y crea una sesión local falsa, sin Supabase. Solo para enseñar la app; las
// pantallas no tendrán datos. NUNCA activarlo en una comunidad real.
const DEMO_LOGIN = {{integrations.demoLogin}};
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000';
const _isDemoUser = (u) => DEMO_LOGIN && !!u && u.source === 'demo';

// Cliente Supabase
let _supabase = null;
/**
 * Devuelve el cliente Supabase inicializado (singleton).
 * Debe llamarse despues de que el CDN de Supabase haya cargado.
 * @returns {object|null}
 */
function getSupabase() {
  if (_supabase) return _supabase;
  // Modo demo: cliente falso con datos de ejemplo (js/demo.js, solo en builds de demo)
  if (DEMO_LOGIN && typeof window.createDemoSupabase === 'function') {
    _supabase = window.createDemoSupabase();
    return _supabase;
  }
  // El CDN de Supabase v2 expone supabase.createClient en window
  const lib = window.supabase || (window.supabaseJs) || null;
  if (lib && lib.createClient) {
    _supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: SESSION_STORAGE, storageKey: SUPABASE_STORAGE_KEY, persistSession: true, autoRefreshToken: true }
    });
    console.log('✅ Supabase conectado');
  } else {
    console.warn('⚠️ SDK Supabase no encontrado, usando mock');
  }
  return _supabase;
}

const SESSION_KEY = 'kehila_user';

// Sesión SIEMPRE persistente, tanto en web como en la app nativa (Capacitor).
// El usuario introduce la contraseña una sola vez y no vuelve a salir hasta
// que pulse "Cerrar sesión". En la app, guardar el token en sessionStorage
// hacía que Android/iOS lo borraran al matar el WebView en segundo plano →
// al reabrir no había sesión de Supabase → RLS devolvía 0 filas (sin eventos,
// sin noticias…) y re-login forzado en cada apertura.
const SESSION_STORAGE = window.localStorage;

// Migración única: usuarios que quedaron con la sesión en sessionStorage
// (builds antiguos que usaban ese almacenamiento). La copiamos a localStorage
// para que no tengan que volver a entrar.
try {
  if (!localStorage.getItem(SESSION_KEY) && sessionStorage.getItem(SESSION_KEY)) {
    localStorage.setItem(SESSION_KEY, sessionStorage.getItem(SESSION_KEY));
  }
  Object.keys(sessionStorage)
    .filter(k => k.startsWith('sb-') && k.includes('-auth-token'))
    .forEach(k => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, sessionStorage.getItem(k));
    });
} catch (e) { /* ignorar */ }

// ─── Analytics: plataforma, sesión y eventos ──
// Vive aquí (y no en nav.js) porque auth.js se carga en TODAS las páginas,
// incluidas index.html (login/registro) y reset-password.html, que no
// cargan nav.js. El panel lo lee con la RPC analytics_dashboard().

/** 'ios' | 'android' (app nativa Capacitor), 'pwa' (instalada) o 'web'. */
function getAppPlatform() {
  try {
    const cap = window.Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'pwa';
    if (window.navigator.standalone === true) return 'pwa';
  } catch { /* sin acceso a Capacitor/matchMedia */ }
  return 'web';
}

/** Id aleatorio por visita (pestaña/arranque de la app), no identifica a la persona. */
function getAnalyticsSessionId() {
  const KEY = 'kehila_an_sid';
  try {
    let sid = sessionStorage.getItem(KEY);
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    if (!window._kehilaAnSid) window._kehilaAnSid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return window._kehilaAnSid;
  }
}

/** Versión de la app nativa (CFBundleShortVersionString / versionName); null en web. */
let _appVersionPromise = null;
function getAppVersion() {
  if (!_appVersionPromise) {
    _appVersionPromise = (async () => {
      try {
        const App = window.Capacitor?.Plugins?.App;
        if (!App || typeof App.getInfo !== 'function') return null;
        const info = await App.getInfo();
        return info?.version ? String(info.version).slice(0, 32) : null;
      } catch { return null; }
    })();
  }
  return _appVersionPromise;
}

function _analyticsPageId() {
  const file = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  return file || 'index';
}

// Eventos que se aceptan sin sesión (la política RLS ae_insert_anon solo
// admite estos prefijos): embudo de registro, login y errores.
const _ANON_EVENT_RE = /^(registro|login|error)_/;
let _trackEventBlocked = false;

/**
 * Registra una acción del usuario en app_events. Nunca lanza ni bloquea la UI.
 * Nombres: minúsculas y _ (p.ej. 'mikve_paso', 'inscripcion_ok'). Para embudos
 * por pasos, pasar props.paso. No meter datos personales en props.
 * @param {string} event
 * @param {object} [props]
 */
async function trackEvent(event, props = {}) {
  if (_trackEventBlocked || !/^[a-z0-9_]{1,64}$/.test(event || '')) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const session = typeof getValidSession === 'function' ? await getValidSession() : null;
    if (!session && !_ANON_EVENT_RE.test(event)) return;

    const localUser = getCurrentUser();
    if (localUser && localUser.status === 'banned') return;

    const { error } = await sb.from('app_events').insert({
      event,
      page: _analyticsPageId(),
      props: props && typeof props === 'object' ? props : {},
      platform: getAppPlatform(),
      app_version: await getAppVersion(),
      session_id: getAnalyticsSessionId(),
      user_id: session ? session.user.id : null
    });
    if (error) {
      // Tabla aún no creada (42P01) o permiso denegado: no reintentar en esta carga
      if (error.code === '42501' || error.code === '42P01' || error.code === 'PGRST205') _trackEventBlocked = true;
      if (AUTH_DEBUG) console.warn('[analytics] app_events:', error.message);
    }
  } catch (e) {
    if (AUTH_DEBUG) console.warn('[analytics] trackEvent falló:', e);
  }
}

// Captura de errores JS reales de los usuarios → app_events 'error_js'.
// Máx. 5 por carga de página y sin repetir el mismo mensaje.
(function bindErrorCapture() {
  const seen = new Set();
  function report(msg, extra) {
    msg = String(msg || '').slice(0, 300);
    if (!msg || msg === 'Script error.' || seen.has(msg) || seen.size >= 5) return;
    seen.add(msg);
    trackEvent('error_js', Object.assign({ msg }, extra));
  }
  window.addEventListener('error', (e) => {
    if (!e || !e.message) return; // errores de carga de recursos (img/script) no traen message
    const src = String(e.filename || '').split('/').pop().slice(0, 60);
    report(e.message, { src, line: e.lineno || null });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    report(r && r.message ? r.message : r, { tipo: 'promise' });
  });
})();

// ─── Login ────────────────────────────────────
/**
 * Autentica un usuario con email y contrasena. Guarda sesion en localStorage.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, status?: string, error?: string}>}
 */
async function login(email, password, captchaToken = '') {
  const normalizedEmail = email.toLowerCase().trim();
  if (DEMO_LOGIN) {
    SESSION_STORAGE.setItem(SESSION_KEY, JSON.stringify({
      userId: DEMO_USER_ID,
      name: (localStorage.getItem('kehila_lang') === 'en') ? 'Demo User' : 'Usuario Demo',
      email: normalizedEmail,
      role: /^admin@/.test(normalizedEmail) ? 'admin' : 'miembro',   // admin@… → panel de administración
      status: 'active',
      comunidad: '{{name}}',
      initials: 'UD',
      areas: [],
      loginAt: new Date().toISOString(),
      source: 'demo'
    }));
    return { ok: true, status: 'active' };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'No hay conexión con el servidor.' };

  try {
    const authOptions = captchaToken ? { email: normalizedEmail, password, options: { captchaToken } } : { email: normalizedEmail, password };
    const { data, error } = await sb.auth.signInWithPassword(authOptions);
    if (error) { trackEvent('login_error'); return { ok: false, error: 'Email o contraseña incorrectos.' }; }

    // 2FA: si esta cuenta tiene un factor TOTP verificado, la sesión se
    // queda en aal1 (solo contraseña) hasta completar el código — no se
    // considera el login terminado todavía.
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
      const { data: factors } = await sb.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.find(f => f.status === 'verified');
      if (totpFactor) {
        return { ok: true, mfaRequired: true, factorId: totpFactor.id };
      }
    }

    return await finishLogin(sb, data.user.id, normalizedEmail);
  } catch (e) {
    return { ok: false, error: 'Error de conexión. Inténtalo de nuevo.' };
  }
}

/**
 * Segundo paso del login cuando la cuenta tiene 2FA activado: verifica el
 * código de 6 dígitos de la app de autenticación y, si es correcto,
 * completa el login exactamente igual que login() sin 2FA.
 * @param {string} factorId - devuelto por login() en result.factorId
 * @param {string} code - código de 6 dígitos introducido por el usuario
 * @returns {Promise<{ok: boolean, status?: string, error?: string}>}
 */
async function verifyLoginMfa(factorId, code) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'No hay conexión con el servidor.' };

  try {
    const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId });
    if (chErr) return { ok: false, error: 'Error iniciando la verificación. Inténtalo de nuevo.' };

    const { error: vErr } = await sb.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (vErr) return { ok: false, error: 'Código incorrecto.' };

    const { data: { user } } = await sb.auth.getUser();
    return await finishLogin(sb, user.id, user.email);
  } catch (e) {
    return { ok: false, error: 'Error de conexión. Inténtalo de nuevo.' };
  }
}

/**
 * Completa el login: comprueba estado de la cuenta, carga áreas de staff,
 * guarda la sesión local. Compartido entre login() (sin 2FA) y
 * verifyLoginMfa() (segundo paso con 2FA).
 * @param {object} sb - cliente Supabase
 * @param {string} userId
 * @param {string} email
 */
async function finishLogin(sb, userId, email) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profile && profile.status === 'banned') {
    await sb.auth.signOut();
    return { ok: false, error: 'Tu cuenta ha sido baneada. Contacta al administrador.' };
  }
  if (profile && profile.status === 'suspended') {
    await sb.auth.signOut();
    return { ok: false, error: 'Tu cuenta está suspendida temporalmente. Contacta al administrador.' };
  }

  // Para staff: cargar áreas asignadas
  let areas = [];
  const userRole = profile?.role || 'miembro';
  if (userRole === 'staff') {
    try {
      const { data: permisos } = await sb
        .from('staff_permisos')
        .select('area')
        .eq('user_id', userId);
      areas = (permisos || []).map(p => p.area);
    } catch(_) {}
  }

  const sessionData = {
    userId: userId,
    name: profile?.name || normalizedEmail.split('@')[0],
    email: email,
    role: userRole,
    status: profile?.status || 'pending',
    comunidad: profile?.comunidad || '{{name}}',
    initials: profile?.initials || normalizedEmail.slice(0, 2).toUpperCase(),
    areas: areas,
    loginAt: new Date().toISOString(),
    source: 'supabase'
  };
  SESSION_STORAGE.setItem(SESSION_KEY, JSON.stringify(sessionData));
  completePendingDocUpload(sb, userId); // no await — no bloquea el login
  trackEvent('login_ok', { estado: sessionData.status });
  return { ok: true, status: profile?.status || 'active' };
}

// ─── Documento pendiente (DNI/Pasaporte) ──────
/**
 * Si el registro se hizo sin sesión activa (email sin confirmar), el documento
 * de identidad quedó guardado en localStorage en vez de subirse a Storage
 * (ver regSubmit en registro.js). En el primer login ya hay sesión válida,
 * así que lo subimos aquí y actualizamos el perfil.
 */
async function completePendingDocUpload(sb, userId) {
  const key = `kehila_pending_doc_${userId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const { fileName, dataUrl } = JSON.parse(raw);
    const ext = (fileName || '').split('.').pop() || 'jpg';
    const fileBase64 = dataUrl.split(',')[1];

    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) return; // sin sesion valida todavia: se reintentara en el siguiente login

    // Subida vía Edge Function: cifra el documento antes de guardarlo (ver
    // supabase/functions/upload-document) en vez de subirlo en claro.
    const res = await fetch(SUPABASE_URL + '/functions/v1/upload-document', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, fileBase64, fileExt: ext }),
    });
    const data = await res.json();
    if (!res.ok || !data.path) { console.error('Error subiendo documento pendiente (cifrado):', data.error); return; }

    localStorage.removeItem(key);
  } catch (e) {
    console.error('Error completando documento pendiente:', e);
  }
}

// ─── Registro ─────────────────────────────────
/**
 * Registro de nuevo usuario en Supabase.
 */
/**
 * Crea nueva cuenta en Supabase Auth. Perfil extendido via trigger Supabase.
 * @param {string} email
 * @param {string} password - Min 8 chars recomendado (NIST SP 800-63B)
 * @param {string} name
 * @returns {Promise<{ok: boolean, userId?: string, error?: string}>}
 */
async function register(email, password, name) {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Registro solo disponible con conexión a internet.' };

  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name, initials } }
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, userId: data.user?.id, data };
}

// ─── Logout ───────────────────────────────────
/**
 * Cierra sesion: invalida JWT en Supabase y limpia localStorage.
 * Redirige siempre a index.html.
 */
async function logout() {
  // Quitar el push token ANTES de signOut(): así todavía hay sesión real
  // para identificar de quién es, y no queda asociado a la cuenta anterior
  // si otro usuario entra después en el mismo dispositivo.
  if (typeof removePushToken === 'function') {
    try { await removePushToken(); } catch (_) {}
  }
  const sb = getSupabase();
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) {}
  }
  clearPrivateSession();
  window.location.href = 'index.html';
}

// ─── Sesión actual ────────────────────────────
/**
 * Devuelve datos de sesion de localStorage. NO valida el JWT.
 * Es solo una identidad cacheada para pintar la interfaz al instante
 * (nombre, avatar, rol aproximado): NUNCA debe tratarse como prueba de
 * autenticacion. La prueba real es la sesion de Supabase (ver ensureSession()
 * / getValidSession()) y la autorizacion real la deciden los GRANT/RLS del
 * servidor, no este objeto.
 * @returns {{userId, name, email, role, status, comunidad, initials}|null}
 */
function getCurrentUser() {
  try {
    const raw = SESSION_STORAGE.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Sesión Auth compartida ────────────────────
// Una única promesa memoizada por documento: todas las páginas cargan
// auth.js + nav.js (+ a veces push.js) y cada uno llamaba a getSession()
// por su cuenta, disparando múltiples round-trips y registrando varios
// listeners onAuthStateChange duplicados. Con esto, la primera llamada
// dispara la comprobación real contra Supabase y el resto de llamadas en
// la misma página reciben el mismo resultado ya resuelto.
let _sessionPromise = null;
let _cachedSession = undefined;
let _authListenerBound = false;

function _bindAuthListener(sb) {
  if (_authListenerBound) return;
  _authListenerBound = true;
  sb.auth.onAuthStateChange((event, session) => {
    _cachedSession = session || null;
    if (event === 'SIGNED_OUT') {
      clearPrivateSession();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      const localUser = getCurrentUser();
      if (session && localUser && localUser.userId && localUser.userId !== session.user.id) {
        // La identidad cacheada pertenece a otra cuenta (cambio de sesión
        // sin recarga de página): limpiar para que analytics/push no
        // asocien datos nuevos al usuario anterior.
        clearPrivateSession();
      }
    }
  });
}

/**
 * Devuelve (memoizada) la sesión real de Supabase para este documento.
 * Múltiples llamadas concurrentes desde distintos scripts comparten la
 * misma petición de red en vez de duplicarla.
 * @returns {Promise<object|null>}
 */
function ensureSession() {
  const demoUser = getCurrentUser();
  if (_isDemoUser(demoUser)) return Promise.resolve({ user: { id: demoUser.userId, email: demoUser.email } });
  const sb = getSupabase();
  if (!sb) return Promise.resolve(null);
  if (!_sessionPromise) {
    _bindAuthListener(sb);
    _sessionPromise = sb.auth.getSession()
      .then(({ data }) => { _cachedSession = data.session || null; return _cachedSession; })
      .catch((e) => { _sessionPromise = null; throw e; });
  }
  return _sessionPromise;
}

/**
 * Como ensureSession() pero nunca lanza: ante error de red devuelve null.
 * Pensado para código que solo necesita saber "¿hay sesión real o no?"
 * sin distinguir el motivo (usado por nav.js/push.js antes de escribir).
 * @returns {Promise<object|null>}
 */
async function getValidSession() {
  try { return await ensureSession(); } catch { return null; }
}

/**
 * Limpia SOLO la identidad y los tokens de sesión (kehila_user + sb-*-auth-token).
 * Nunca borra localStorage entero: ahí viven también altas de registro
 * pendientes de confirmar (kehila_pending_doc_*) y documentos por subir.
 */
function clearPrivateSession() {
  try {
    SESSION_STORAGE.removeItem(SESSION_KEY);
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.includes('-auth-token'))
      .forEach(k => localStorage.removeItem(k));
    // Fotos privadas: enlaces firmados (valen 7 días), instantáneas que los
    // contienen y la caché de fotos del service worker.
    Object.keys(localStorage)
      .filter(k => k === 'kehila_signed_url_cache' || k.startsWith('kehila_snap_'))
      .forEach(k => localStorage.removeItem(k));
    if (window.caches) caches.delete('kehila-media-v1').catch(() => {});
  } catch (_) { /* ignorar */ }
  _sessionPromise = null;
  _cachedSession = null;
}

// ─── Volver a la página tras el login ─────────
// Si alguien abre un enlace (p. ej. un evento compartido por WhatsApp) sin
// sesión, se guarda a dónde iba y, al entrar, se le lleva allí en vez de
// al inicio. Solo páginas internas .html, y caduca en 1 h.
const VOLVER_KEY = 'kehila_volver';
const _volverValido = (p) => typeof p === 'string' && /^[a-z0-9-]+\.html([?#][^\s<>"']*)?$/i.test(p) && !/^index\.html/i.test(p);

function guardarVolver() {
  try {
    const qs = new URLSearchParams(location.search); qs.delete('abrir_app');   // marca de abrir-app.js
    const p = location.pathname.split('/').pop() + (qs.toString() ? '?' + qs : '') + location.hash;
    if (_volverValido(p)) localStorage.setItem(VOLVER_KEY, JSON.stringify({ p, t: Date.now() }));
  } catch (_) { /* ignorar */ }
}

/** Devuelve (y borra) la página pendiente, o null. */
function tomarVolver() {
  try {
    const v = JSON.parse(localStorage.getItem(VOLVER_KEY) || 'null');
    localStorage.removeItem(VOLVER_KEY);
    if (v && Date.now() - v.t < 3600e3 && _volverValido(v.p)) return v.p;
  } catch (_) { /* ignorar */ }
  return null;
}

// ─── Guards ───────────────────────────────────
/**
 * Guard real de ruta protegida: espera la sesión de Supabase antes de
 * confirmar. kehila_user en localStorage solo sirve para pintar la UI al
 * instante (ver getCurrentUser) — la confirmación viene de aquí.
 *
 * Los llamadores DEBEN esperar esta promesa antes de disparar cualquier
 * consulta privada:
 *   const user = await requireAuth();
 *   if (!user) return; // ya se está redirigiendo, no seguir cargando datos
 *
 * Ante un error de red puntual NO se fuerza el logout (evita expulsar a
 * usuarios con mala cobertura): se deja pasar con la identidad cacheada y
 * son las escrituras concretas (nav.js, push.js) las que exigen sesión
 * real antes de escribir, vía getValidSession().
 *
 * @returns {Promise<{userId, name, email, role, ...}|null>}
 */
async function requireAuth() {
  const localUser = getCurrentUser();
  if (!localUser) {
    guardarVolver();
    window.location.href = 'index.html';
    return null;
  }

  let session;
  try {
    session = await ensureSession();
  } catch (e) {
    if (AUTH_DEBUG) console.warn('[auth] requireAuth: error de red comprobando sesión, se mantiene identidad cacheada:', e.message);
    return localUser;
  }

  if (!session) {
    clearPrivateSession();
    guardarVolver();
    window.location.href = 'index.html';
    return null;
  }

  if (localUser.userId !== session.user.id) {
    // kehila_user no corresponde a la sesión real activa: no es prueba
    // de autenticación válida para esta cuenta.
    clearPrivateSession();
    window.location.href = 'index.html';
    return null;
  }

  return localUser;
}

/**
 * Guard de admin: espera requireAuth() y comprueba el rol cacheado.
 * Sigue siendo solo una comprobación de UI rápida — [SEC-01] toda
 * operación sensible de admin debe pasar además por verifyAdminRealtime().
 * @returns {Promise<{userId, name, role, ...}|null>}
 */
async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  if (!['admin', 'super_admin', 'staff'].includes(user.role)) {
    window.location.href = 'home.html';
    return null;
  }
  return user;
}

/**
 * Comprueba si el usuario actual es admin sin redirigir.
 * @returns {boolean}
 */
function isAdmin() {
  const user = getCurrentUser();
  return user && ['admin', 'super_admin'].includes(user.role);
}

/**
 * Comprueba si el usuario actual es super_admin.
 * @returns {boolean}
 */
function isSuperAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'super_admin';
}

/**
 * Devuelve las áreas del usuario actual.
 * admin/super_admin tienen acceso a todo ['*'].
 * @returns {string[]}
 */
function getUserAreas() {
  const user = getCurrentUser();
  if (!user) return [];
  if (['admin', 'super_admin'].includes(user.role)) return ['*'];
  return user.areas || [];
}

/**
 * Comprueba si el usuario tiene acceso a un área concreta.
 * @param {string} area
 * @returns {boolean}
 */
function hasArea(area) {
  const areas = getUserAreas();
  return areas.includes('*') || areas.includes(area);
}

// ─── Helpers ──────────────────────────────────
/**
 * Devuelve indice de color 0-7 basado en el nombre (deterministico).
 * Colores definidos en CSS via data-color atributo.
 * @param {string} name
 * @returns {string}
 */
function getAvatarColor(name) {
  if (!name) return '0';
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return String(code % 8);
}

/**
 * Genera HTML de avatar circular con iniciales del usuario.
 * @param {{name?: string, initials?: string}} user
 * @param {string} [size] - Clase CSS: sm | md | lg
 * @returns {string} HTML del avatar
 */
function renderAvatar(user, size = 'md') {
  const color = getAvatarColor(user.name || user.initials || 'U');
  const initials = user.initials || (user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '??');
  const safeInitials = String(initials || '??').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<div class="avatar avatar-${size}" data-color="${color}">${safeInitials}</div>`;
}

// ─── Auto-init ────────────────────────────────

/**
 * Verifica que la sesion de Supabase siga activa (JWT no expirado).
 * Mas lento que getCurrentUser() pero garantiza que el token es valido.
 * @returns {Promise<boolean>}
 * @example
 * if (!(await verifySession())) { logout(); return; }
 */
async function verifySession() {
  try {
    const session = await ensureSession();
    return session !== null;
  } catch { return false; }
}

/**
 * Guard de admin con verificacion real contra Supabase.
 * Consulta profiles usando JWT activo - no puede falsificarse desde localStorage.
 * Requiere RLS en profiles: CREATE POLICY ON profiles FOR SELECT USING (auth.uid() = id)
 *
 * Usar en operaciones destructivas de admin (aprobar/banear usuarios, borrar contenido).
 *
 * IMPORTANTE: esta función NUNCA concede acceso admin basándose en el rol
 * cacheado en localStorage. Ante cualquier error (sin cliente, sin red, sin
 * perfil) se deniega (return null) sin cerrar sesión — el error puede ser
 * puntual — pero tampoco se confía en la identidad local para dejar pasar
 * la operación.
 *
 * @returns {Promise<{userId, name, role, ...}|null>}
 * @example
 * const adminUser = await verifyAdminRealtime();
 * if (!adminUser) return;
 */
async function verifyAdminRealtime() {
  const localUser = getCurrentUser();
  if (!localUser) { window.location.href = 'index.html'; return null; }

  const sb = getSupabase();
  if (!sb) {
    console.warn('[auth] verifyAdminRealtime: sin cliente Supabase disponible; se deniega la operación.');
    return null;
  }

  let session;
  try {
    session = await ensureSession();
  } catch (e) {
    console.error('[auth] verifyAdminRealtime: error de red comprobando sesión:', e.message);
    return null; // Error puntual: no se concede admin ni se cierra sesión.
  }

  if (!session) {
    clearPrivateSession();
    guardarVolver();
    window.location.href = 'index.html';
    return null;
  }

  // 2FA: la sesión puede ser válida y sin embargo no haber completado el
  // código (ej. sesión ya abierta desde antes de activar el 2FA, o abierta
  // en otro dispositivo sin el código). Si la cuenta tiene un factor TOTP
  // verificado pero esta sesión sigue en aal1, no se concede acceso al
  // panel de admin — se fuerza a volver a entrar y verificar el código.
  try {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
      await sb.auth.signOut();
      clearPrivateSession();
      window.location.href = 'index.html';
      return null;
    }
  } catch (e) { /* si falla la comprobación de AAL, se sigue con el flujo normal */ }

  try {
    const { data: profile, error } = await sb
      .from('profiles')
      .select('role, status')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      console.error('[auth] verifyAdminRealtime: no se pudo confirmar el rol del servidor:', error && error.message);
      return null; // No se confirma admin: se deniega la operación puntual.
    }
    if (profile.status === 'banned' || profile.status === 'suspended') { await logout(); return null; }
    if (!['admin', 'super_admin', 'staff'].includes(profile.role)) {
      // Rol revocado: limpiar sesión y redirigir
      SESSION_STORAGE.setItem(SESSION_KEY, JSON.stringify({ ...localUser, role: profile.role, status: profile.status }));
      window.location.href = 'home.html';
      return null;
    }

    // Sincronizar rol en localStorage por si cambio en BD
    if (profile.role !== localUser.role) {
      SESSION_STORAGE.setItem(SESSION_KEY, JSON.stringify({ ...localUser, role: profile.role, status: profile.status }));
      // Forzar recarga para aplicar cambios de rol
      window.location.reload();
      return null;
    }
    return localUser;
  } catch (e) {
    console.error('[auth] verifyAdminRealtime error:', e.message);
    return null; // Nunca se concede admin por la identidad local ante un fallo.
  }
}

(function () {
  const publicPages = ['index.html', 'reset-password.html'];
  const path = window.location.pathname;
  const isPublic = path === '/' ||
                   path.endsWith('/') ||
                   publicPages.some(p => path.endsWith(p));
  if (!isPublic) {
    requireAuth();
  }
})();
