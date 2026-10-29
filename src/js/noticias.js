/**
 * @file noticias.js
 * @description Lógica completa de la página noticias.html.
 *
 * Responsabilidades:
 *  - Cargar noticias desde Supabase (con fallback a MOCK_NOTICIAS_V2 de data.js)
 *  - Renderizar el grid de tarjetas con filtros por categoría
 *  - Abrir el drawer de lectura estilo periódico
 *  - Crear/eliminar noticias (solo admin)
 *  - Tracking de lecturas via analytics.js
 *
 * DEPENDENCIAS (en orden de carga):
 *  - auth.js      → requireAuth(), getCurrentUser(), getSupabase()
 *  - nav.js       → initNav(), renderPageHeader()
 *  - data.js      → MOCK_NOTICIAS_V2, CATEGORIA_CONFIG
 *  - analytics.js → trackPageView(), trackNewsRead()
 *  - media.js     → uploadMedia() (solo para subir fotos)
 *
 * PUNTO DE ENTRADA: __noticiasInit(), invocado en DOMContentLoaded en carga
 * normal, o inmediatamente si el documento ya está listo (navegación SPA
 * vía js/router.js, que reinyecta este script sobre un documento ya cargado).
 *
 * DATOS:
 *  Los datos se cargan de Supabase (tabla `noticias`) al iniciar.
 *  Si Supabase no tiene datos, se usa MOCK_NOTICIAS_V2 como fallback.
 *  La variable MOCK_NOTICIAS_V2 es mutable — se vacía y rellena con datos reales.
 *
 * XSS: Los datos de usuario no se pasan por innerHTML directamente en la mayoría
 *  de casos, pero revisar títulos/autores si el contenido viene de usuarios finales.
 */

/* ─── Instantánea en localStorage: pinta el grid al instante en la primera
   visita de la sesión (sin esperar a Supabase), igual que el patrón de
   home.html/eventos.html. En revisitas dentro de la misma sesión SPA,
   MOCK_NOTICIAS_V2 ya tiene datos reales en memoria (data.js persiste
   entre navegaciones) y se pinta directo con eso. ─── */
const NOTICIAS_SNAP_KEY = 'kehila_snap_noticias';

function paintNoticiasFromSnapshot() {
  if (MOCK_NOTICIAS_V2.length) {
    renderDestacadas();
    renderFiltros();
    renderGrid('todas');
    return;
  }
  try {
    const raw = localStorage.getItem(NOTICIAS_SNAP_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw);
    if (Array.isArray(snap) && snap.length) {
      snap.forEach(n => MOCK_NOTICIAS_V2.push(n));
      renderDestacadas();
      renderFiltros();
      renderGrid('todas');
    }
  } catch (e) { /* instantánea corrupta: se ignora */ }
}

async function __noticiasInit() {
  try {
    requireAuth();
    initNav('noticias');
    renderPageHeader();
    paintNoticiasFromSnapshot();
    // Cargar noticias desde Supabase
    await loadNoticiasSupabase();
    renderDestacadas();
    renderFiltros();
    renderGrid('todas');
    initDelegation();

  } catch (e) {
    console.error('Error iniciando noticias:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __noticiasInit);
} else {
  __noticiasInit();
}

/**
 * Carga todas las noticias desde Supabase y sobrescribe el array MOCK_NOTICIAS_V2.
 * Si Supabase no tiene datos o falla, MOCK_NOTICIAS_V2 conserva sus valores de data.js.
 * @returns {Promise<void>}
 */
async function loadNoticiasSupabase() {
  try {
    const sb = typeof getSupabase === 'function' ? getSupabase() : null;
    if (!sb) return;
    const { data } = await sb.from('noticias').select('*').order('created_at', { ascending: false });
    if (typeof MOCK_NOTICIAS_V2 !== 'undefined') {
      if (data && data.length) {
        // Reemplazar mock con datos reales de Supabase
        MOCK_NOTICIAS_V2.length = 0;
        data.forEach(n => MOCK_NOTICIAS_V2.push(n));
        try { localStorage.setItem(NOTICIAS_SNAP_KEY, JSON.stringify(MOCK_NOTICIAS_V2)); } catch (e) {}
      }
      // Si no hay datos en Supabase, conservar mock como fallback
    }
  } catch(e) { console.warn('noticias supabase:', e); }
}

/* ── Helpers ── */

/**
 * Formatea una fecha ISO (YYYY-MM-DD) en formato largo en español.
 * @param {string} fechaStr - Fecha en formato 'YYYY-MM-DD'
 * @returns {string} Ej: "17 de abril de 2026"
 */
function formatearFecha(fechaStr) {
  try {
    const fecha = new Date(fechaStr + 'T12:00:00');
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return fechaStr ?? ''; }
}

function getNoticias() {
  return (typeof MOCK_NOTICIAS_V2 !== 'undefined') ? MOCK_NOTICIAS_V2 : [];
}

function getCfg() {
  return (typeof CATEGORIA_CONFIG !== 'undefined') ? CATEGORIA_CONFIG : {};
}

function catLabel(cat) {
  return getCfg()[cat]?.label ?? cat ?? '';
}

/* ── Page Header ── */

function renderPageHeader() {
  try {
    const user = getCurrentUser?.() ?? null;
    const adminBtn = user?.role === 'admin'
      ? `<button class="btn btn-primary btn-sm" data-action="nueva-noticia">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:15px;height:15px"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
           Nueva noticia
         </button>`
      : '';
    document.getElementById('page-header').innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-label">Comunidad</div>
          <h1 class="page-header-title">Noticias</h1>
          <p class="page-header-sub">Actualidad de tu comunidad y del mundo judío</p>
        </div>
        <div class="page-header-actions">${adminBtn}</div>
      </div>`;
  } catch (e) { console.error('renderPageHeader:', e); }
}

/* ── Destacadas (no-op, las destacadas se mezclan en el grid con badge) ── */

function renderDestacadas() {}

/* ── Filtros ── */

function renderFiltros() {
  try {
    const container = document.getElementById('filtros-container');
    if (!container) return;
    const cats = [
      { key: 'todas',     label: 'Todas' },
      { key: 'comunidad', label: 'Comunidad' },
      { key: 'israel',    label: 'Israel' },
      { key: 'halacha',   label: 'Halaká' },
      { key: 'evento',    label: 'Eventos' },
      { key: 'kashrut',   label: 'Kashrut' }
    ];
    const total = getNoticias().length;
    const chips = cats.map((c, i) =>
      `<button class="chip${i === 0 ? ' active' : ''}" data-categoria="${c.key}">${c.label}</button>`
    ).join('');
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="font-size:1rem;font-weight:600;color:var(--color-text)">Últimas noticias</h2>
        <span id="noticias-count" style="font-size:0.8rem;color:var(--color-text-muted)">${total} artículos</span>
      </div>
      <div class="filter-chips">${chips}</div>`;
  } catch (e) { console.error('renderFiltros:', e); }
}

/* ── Borrar noticia (admin) ── */

const _TRASH_ICON = `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>`;

/**
 * Elimina una noticia del array local y de Supabase. Solo admin.
 * @param {string} id - ID de la noticia a eliminar
 * @param {MouseEvent} e - Evento de clic (para stopPropagation)
 */
async function deleteNoticia(id, e) {
  e.stopPropagation();
  if (typeof MOCK_NOTICIAS_V2 !== 'undefined') {
    const idx = MOCK_NOTICIAS_V2.findIndex(n => n?.id === id);
    if (idx !== -1) MOCK_NOTICIAS_V2.splice(idx, 1);
  }
  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (sb) { try { await sb.from('noticias').delete().eq('id', id); } catch(_) {} }
  const activeFiltro = document.querySelector('.filter-chips [data-categoria].active')?.dataset.categoria ?? 'todas';
  renderGrid(activeFiltro);
  if (typeof showToast === 'function') showToast('Noticia eliminada', 'success');
}

/* ── Grid ── */

/**
 * Renderiza el grid de tarjetas de noticias, opcionalmente filtrado por categoría.
 * @param {string} filtro - Categoría a mostrar ('todas' o slug de categoría)
 */
function renderGrid(filtro) {
  try {
    const container = document.getElementById('noticias-grid');
    if (!container) return;

    let lista = getNoticias();
    if (filtro && filtro !== 'todas') lista = lista.filter(n => n?.categoria === filtro);

    const countEl = document.getElementById('noticias-count');
    if (countEl) countEl.textContent = `${lista.length} artículo${lista.length !== 1 ? 's' : ''}`;

    if (!lista.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:36px;height:36px;opacity:.4"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
          <p>No hay noticias en esta categoría</p>
        </div>`;
      return;
    }

    const _user   = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const _isAdmin = _user?.role === 'admin';

    // Inyectar CSS del botón basurita si no existe
    if (_isAdmin && !document.getElementById('trash-btn-style')) {
      const s = document.createElement('style');
      s.id = 'trash-btn-style';
      s.textContent = `.btn-trash{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;background:#fff;border:1.5px solid #fca5a5;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s,background .15s;z-index:10;box-shadow:0 1px 6px rgba(0,0,0,.12);padding:0;}.btn-trash:hover{background:#fef2f2;}.noticia-card-new{position:relative;}.noticia-card-new:hover .btn-trash{opacity:1;}`;
      document.head.appendChild(s);
    }

    container.innerHTML = lista.map(n => {
      const fecha = n.fecha ? new Date(n.fecha + 'T12:00:00') : new Date();
      const day   = fecha.getDate();
      const month = fecha.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
      const cat   = catLabel(n.categoria);
      const pinnedBadge = n.isPinned
        ? `<span class="chip" style="font-size:.7rem;padding:3px 8px;background:#FEF9C3;color:#92400E;border-color:#FDE68A">★ Dest.</span>`
        : '';
      const imgHTML = n.imagen_url
        ? `<img src="${n.imagen_url}" loading="lazy" decoding="async" style="width:100%;height:120px;object-fit:cover;" alt="">`
        : '';
      const trashBtn = _isAdmin
        ? `<button class="btn-trash" onclick="deleteNoticia('${n.id ?? ''}',event)" title="Eliminar noticia">${_TRASH_ICON}</button>`
        : '';
      return `
        <div class="noticia-card-new nc-cat-${n.categoria ?? 'comunidad'}" data-id="${n.id ?? ''}" data-action="abrir-noticia">
          ${trashBtn}
          ${imgHTML}
          <div class="ev-card-header">
            <div class="ev-date-block">
              <span class="ev-day">${day}</span>
              <span class="ev-month">${month}</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start">
              <span class="chip" style="font-size:.7rem;padding:3px 10px;cursor:default">${cat}</span>
              ${pinnedBadge}
            </div>
          </div>
          <div class="ev-card-body">
            <div class="ev-title">${escHtml(n.titulo ?? '')}</div>
            <div class="ev-desc">${escHtml(n.excerpt ?? '')}</div>
            <div class="ev-meta-row">
              <span class="ev-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                ${escHtml(n.autor ?? '')}
              </span>
              <span class="ev-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                ${n.tiempoLectura ?? ''} lectura
              </span>
            </div>
          </div>
          <div class="ev-card-footer">
            <span></span>
            <button class="btn btn-sm btn-primary" data-id="${n.id ?? ''}" data-action="abrir-noticia">Leer noticia</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) { console.error('renderGrid:', e); }
}

/* ── Delegación ── */

/**
 * Configura la delegación de eventos en document para gestionar clics en:
 * - Tarjetas de noticias (abrir drawer)
 * - Chips de filtro (cambiar categoría)
 * - Botón "Nueva noticia" (solo admin)
 * - Botones de cerrar modal/drawer
 */
function initDelegation() {
  document.addEventListener('click', (e) => {
    try {
      const card = e.target.closest('[data-action="abrir-noticia"]');
      if (card && card.dataset.id) { window.location.href = `noticia.html?id=${card.dataset.id}`; return; }

      const filtro = e.target.closest('.filter-chips [data-categoria]');
      if (filtro) {
        document.querySelectorAll('.filter-chips [data-categoria]').forEach(b => b.classList.remove('active'));
        filtro.classList.add('active');
        renderGrid(filtro.dataset.categoria);
        return;
      }

      if (e.target.closest('[data-action="nueva-noticia"]')) { abrirModalNueva(); return; }
      if (e.target.closest('[data-action="cerrar-modal"]')) { cerrarModal(); return; }
      if (e.target.classList.contains('drawer-overlay')) { cerrarModal(); return; }
      if (e.target.classList.contains('modal-overlay')) { cerrarModal(); return; }
    } catch (err) { console.error('delegación:', err); }
  });
}

/* ── Drawer newspaper style ── */

/**
 * Abre el drawer de lectura estilo periódico para una noticia.
 * Registra la lectura via trackNewsRead() para analytics.
 * @param {string} id - ID de la noticia a mostrar
 */
function abrirNoticia(id) {
  try {
    const n = getNoticias().find(x => x?.id === id);
    if (!n) return;
    if (typeof trackNewsRead === 'function') trackNewsRead(id);
    cerrarModal();

    const user = getCurrentUser?.() ?? null;
    const parrafos = (n.contenido ?? n.excerpt ?? '')
      .split(/\n\n+/).filter(p => p.trim());
    const bodyHTML = parrafos.map((p, i) =>
      `<p class="np-p${i === 0 ? ' np-dropcap' : ''}">${p.trim()}</p>`
    ).join('');
    const adminBtn = user?.role === 'admin'
      ? `<button class="btn btn-secondary btn-sm">Editar</button>` : '';
    const authorInitial = (n.autor?.[0] ?? 'A').toUpperCase();

    if (!document.getElementById('np-drawer-styles')) {
      const s = document.createElement('style');
      s.id = 'np-drawer-styles';
      s.textContent = `
        .np-drawer { background:#f9f7f2; }
        .np-masthead { background:#1a202c; padding:10px 22px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .np-cat-label { color:rgba(255,255,255,.85); font-size:9px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; }
        .np-close-btn { background:none; border:1px solid rgba(255,255,255,.2); color:rgba(255,255,255,.7); cursor:pointer; font-size:14px; line-height:1; padding:0; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:3px; transition:all .15s; }
        .np-close-btn:hover { background:rgba(255,255,255,.1); color:#fff; }
        .np-img { width:100%; height:200px; object-fit:cover; display:block; }
        .np-scroll { overflow-y:auto; flex:1; }
        .np-content { padding:22px 28px 4px; }
        .np-rule-double { border-top:3px solid #1a202c; border-bottom:1px solid #1a202c; padding:3px 0; margin-bottom:14px; text-align:center; }
        .np-rule-double span { font-size:8px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:#1a202c; }
        .np-headline { font-family:'Frank Ruhl Libre',Georgia,'Times New Roman',serif; font-size:1.85rem; font-weight:700; line-height:1.15; color:#1a202c; margin-bottom:16px; }
        .np-byline-bar { display:flex; align-items:center; gap:10px; padding:10px 0; border-top:1px solid #c8c3b8; border-bottom:1px solid #c8c3b8; margin-bottom:22px; }
        .np-avatar { width:30px; height:30px; border-radius:50%; background:#1a202c; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .np-avatar span { color:#fff; font-size:11px; font-weight:700; }
        .np-byline-name { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.09em; color:#1a202c; }
        .np-byline-date { font-size:10px; color:#718096; margin-top:2px; }
        .np-p { font-family:Georgia,'Times New Roman',serif; font-size:.9375rem; line-height:1.78; color:#2d3748; margin-bottom:1.1em; text-align:justify; hyphens:auto; }
        .np-dropcap::first-letter { font-family:'Frank Ruhl Libre',Georgia,serif; font-size:4em; font-weight:700; float:left; line-height:.7; margin:.06em .12em 0 0; color:#1a202c; }
        .np-rule-end { border:none; border-top:1px solid #c8c3b8; margin:18px 0 12px; text-align:center; overflow:visible; }
        .np-rule-end::after { content:'◆'; font-size:11px; color:#c8c3b8; background:#f9f7f2; padding:0 10px; position:relative; top:-9px; }
        .np-footer { padding:12px 22px; border-top:2px solid #1a202c; display:flex; gap:8px; justify-content:flex-end; background:#1a202c; flex-shrink:0; }
        .np-footer .btn { background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.25); color:#fff; }
        .np-footer .btn:hover { background:rgba(255,255,255,.2); }
        .np-footer .btn-primary { background:#C9A84C; border-color:#C9A84C; color:#1a202c; font-weight:700; }
        .np-footer .btn-primary:hover { background:#b8943f; }
        @media(max-width:768px){ .np-content{padding:18px 18px 4px;} .np-headline{font-size:1.45rem;} }
      `;
      document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';

    const drawer = document.createElement('div');
    drawer.className = 'drawer np-drawer';
    drawer.id = 'noticia-drawer';
    drawer.style.cssText = 'width:520px;max-width:100vw';
    drawer.innerHTML = `
      <div class="np-masthead">
        <span class="np-cat-label">${catLabel(n.categoria).toUpperCase()}</span>
        <button class="np-close-btn" data-action="cerrar-modal" title="Cerrar">✕</button>
      </div>
      ${n.imagen_url ? `<img src="${n.imagen_url}" class="np-img" alt="" decoding="async">` : ''}
      <div class="np-scroll">
        <div class="np-content">
          <div class="np-rule-double"><span>— ${catLabel(n.categoria).toUpperCase()} —</span></div>
          <h2 class="np-headline">${escHtml(n.titulo ?? '')}</h2>
          <div class="np-byline-bar">
            <div class="np-avatar"><span>${escHtml(authorInitial)}</span></div>
            <div>
              <div class="np-byline-name">${escHtml(n.autor ?? '')}</div>
              <div class="np-byline-date">${formatearFecha(n.fecha)} · ${n.tiempoLectura ?? ''} lectura</div>
            </div>
          </div>
          <div class="np-body">${bodyHTML}</div>
          <hr class="np-rule-end">
        </div>
      </div>
      <div class="np-footer">
        <button class="btn btn-secondary btn-sm" onclick="showToast('Enlace copiado','success')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:13px;height:13px"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.935-2.185 2.25 2.25 0 0 0-3.935 2.185Z"/></svg>
          Compartir
        </button>
        ${adminBtn}
        <button class="btn btn-primary btn-sm" data-action="cerrar-modal">Cerrar</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  } catch (e) { console.error('abrirNoticia:', e); }
}

/**
 * Cierra cualquier drawer o modal activo actualmente.
 * Usa animación de fade-out antes de eliminar del DOM.
 */
function cerrarModal() {
  try {
    const drawer = document.getElementById('noticia-drawer');
    const overlay = document.querySelector('.drawer-overlay');
    const modal = document.getElementById('modal-nueva-noticia');
    if (drawer) { drawer.classList.add('drawer-closing'); setTimeout(() => drawer.remove(), 220); }
    if (overlay) { overlay.style.transition = 'opacity .2s'; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 220); }
    if (modal) modal.remove();
  } catch (e) { console.error('cerrarModal:', e); }
}

/* ── Modal nueva noticia (admin) ── */

/**
 * Abre el modal de creación de nueva noticia. Solo admin.
 * Gestiona la subida de imagen y el guardado en Supabase.
 */
function abrirModalNueva() {
  try {
    cerrarModal();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'modal-nueva-noticia';
    modal.innerHTML = `
      <div class="modal" style="max-width:540px">
        <div class="modal-header">
          <h3 class="modal-title">Nueva noticia</h3>
          <button class="modal-close" data-action="cerrar-modal">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width:17px;height:17px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--space-4)">
          <div class="form-group">
            <label class="form-label">Título *</label>
            <input type="text" class="form-input" id="nueva-titulo" placeholder="Título de la noticia">
          </div>
          <div class="form-group">
            <label class="form-label">Categoría</label>
            <select class="form-input" id="nueva-categoria">
              <option value="comunidad">Comunidad</option>
              <option value="israel">Israel</option>
              <option value="halacha">Halaká</option>
              <option value="evento">Evento</option>
              <option value="kashrut">Kashrut</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Resumen * <span style="font-weight:400;color:var(--color-text-muted)">(máx. 200 caracteres)</span></label>
            <textarea class="form-input" id="nueva-excerpt" rows="3" maxlength="200" placeholder="Breve descripción visible en el listado"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Contenido completo</label>
            <textarea class="form-input" id="nueva-contenido" rows="5" placeholder="Texto completo de la noticia..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Foto de la noticia</label>
            <div style="border:2px dashed #ddd;border-radius:10px;padding:20px;text-align:center;cursor:pointer;" onclick="document.getElementById('nueva-img-file').click()">
              <img id="nueva-img-preview" style="display:none;max-height:130px;border-radius:8px;margin-bottom:8px;max-width:100%;">
              <div id="nueva-img-ph" style="color:#888;font-size:0.85rem;">📷 Toca para subir foto</div>
            </div>
            <input type="file" id="nueva-img-file" accept="image/*" style="display:none;">
          </div>
          <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;font-size:var(--text-sm)">
            <input type="checkbox" id="nueva-pinned"> Fijar como noticia destacada
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cerrar-modal">Cancelar</button>
          <button class="btn btn-primary" id="btn-publicar">Publicar noticia</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Preview de imagen
    document.getElementById('nueva-img-file').addEventListener('change', function() {
      const file = this.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        document.getElementById('nueva-img-preview').src = e.target.result;
        document.getElementById('nueva-img-preview').style.display = 'block';
        document.getElementById('nueva-img-ph').style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-publicar').addEventListener('click', async () => {
      try {
        const titulo = document.getElementById('nueva-titulo')?.value?.trim();
        const excerpt = document.getElementById('nueva-excerpt')?.value?.trim();
        if (!titulo || !excerpt) { showToast('El título y el resumen son obligatorios', 'error'); return; }

        const btn = document.getElementById('btn-publicar');
        btn.textContent = 'Publicando...'; btn.disabled = true;

        // Subir imagen
        const imgFile = document.getElementById('nueva-img-file')?.files[0];
        let imagen_url = null;
        if (imgFile && typeof uploadMedia === 'function') {
          imagen_url = await uploadMedia(imgFile, 'noticias');
        }

        const categoria = document.getElementById('nueva-categoria')?.value ?? 'comunidad';
        const nuevaNoticia = {
          isPinned: document.getElementById('nueva-pinned')?.checked ?? false,
          is_pinned: document.getElementById('nueva-pinned')?.checked ?? false,
          categoria,
          titulo, excerpt,
          contenido: document.getElementById('nueva-contenido')?.value?.trim() ?? excerpt,
          autor: getCurrentUser?.()?.name ?? 'Administrador',
          fecha: new Date().toISOString().split('T')[0],
          tiempoLectura: '2 min',
          colorCategoria: getCfg()[categoria]?.color ?? '#1B2E5E',
          imagen_url
        };

        // Guardar en Supabase
        const sb = typeof getSupabase === 'function' ? getSupabase() : null;
        if (sb) {
          const { data, error } = await sb.from('noticias').insert(nuevaNoticia).select().single();
          if (!error && data) nuevaNoticia.id = data.id;
          else if (error) { showToast('Error: ' + error.message, 'error'); btn.textContent = 'Publicar noticia'; btn.disabled = false; return; }
        } else {
          nuevaNoticia.id = 'n' + Date.now();
        }

        MOCK_NOTICIAS_V2.unshift(nuevaNoticia);
        cerrarModal();
        renderDestacadas();
        renderFiltros();
        renderGrid('todas');
        showToast('Noticia publicada para toda la comunidad ✓', 'success');
      } catch (err) { console.error('publicar:', err); showToast('Error al publicar', 'error'); }
    });
  } catch (e) { console.error('abrirModalNueva:', e); }
}
