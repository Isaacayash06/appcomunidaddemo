/**
 * @file data.js
 * @description Contenedores de estado compartido en memoria para páginas que
 * cargan listas desde Supabase (eventos, negocios, kosher, noticias...) y
 * configuración estática de categorías de noticias.
 *
 * Estos arrays NO contienen datos mock: se declaran vacíos y cada página los
 * rellena con `push`/`unshift`/`length = 0` al recibir la respuesta real de
 * Supabase. Viven aquí en vez de en cada página porque varias páginas
 * comparten el mismo nombre de variable (p.ej. MOCK_EVENTOS en eventos.html,
 * home.html y admin.html).
 */

/* ─── EVENTOS (eventos.html, home.html, admin.html, calendario.html) ─── */
const MOCK_EVENTOS = [];

/* Un evento ya ha pasado si su fecha es anterior a hoy (en hora local), o si
   es hoy y su hora de inicio ya pasó. Los eventos pasados no se muestran ni
   permiten inscribirse. */
function eventoPasado(ev) {
  if (!ev || !ev.fecha) return false;
  const d = new Date();
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fecha = String(ev.fecha).slice(0, 10);
  if (fecha !== hoy) return fecha < hoy;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(ev.hora || ''));
  if (!m) return false;
  return d.getHours() * 60 + d.getMinutes() >= Number(m[1]) * 60 + Number(m[2]);
}

/* ─── USUARIOS (admin.html) ─── */
const MOCK_USERS = [];

/* ─── NEGOCIOS Y COWORK (business.html) ─── */
const MOCK_BUSINESSES = [];
const MOCK_COWORK = [];

/* ─── KOSHER (kosher.html) ─── */
const MOCK_KOSHER_PRODUCTOS = [];
const MOCK_RESTAURANTES = [];

/* ─── NOTICIAS (js/noticias.js, noticia.html) ─── */
const MOCK_NOTICIAS_V2 = [];

const CATEGORIA_CONFIG = {
  'comunidad': { color: '#1B2E5E', label: 'Comunidad' },
  'israel':    { color: '#991B1B', label: 'Israel' },
  'halacha':   { color: '#C9A84C', label: 'Halaká' },
  'evento':    { color: '#166534', label: 'Evento' },
  'kashrut':   { color: '#92400E', label: 'Kashrut' }
};

/* ─── HELPERS ─── */
function formatEuros(cantidad) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cantidad);
}
