/**
 * @file buzon.js
 * @description Campana de notificaciones + buzón dentro de la app.
 *
 * Todo lo que el sistema notifica (automático o manual) se guarda también en
 * la tabla `notif_buzon`, así nadie se pierde nada aunque no tenga la app
 * instalada, tenga el push desactivado o haya borrado la notificación.
 *
 * Lo carga nav.js (initNav) en todas las páginas. Solo se muestra con sesión.
 *
 * DEPENDENCIAS: auth.js (getSupabase, getValidSession / getCurrentUser)
 */

(function () {
  if (window.__buzonInit || window.self !== window.top) return;
  window.__buzonInit = true;

  const LIMITE = 50;
  let items = [];
  let uid = null;

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function hace(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function estilos() {
    const st = document.createElement('style');
    st.textContent = `
      #bz-btn {
        position: fixed; top: 16px; right: 20px; z-index: 500;
        width: 40px; height: 40px; border-radius: 10px; border: none; cursor: pointer;
        background: var(--color-primary, #1b2e5e); color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(27,46,94,.25);
      }
      #bz-btn svg { width: 20px; height: 20px; }
      #bz-badge {
        position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 999px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700;
        display: none; align-items: center; justify-content: center; box-sizing: border-box;
        border: 2px solid var(--color-bg, #faf6f0);
      }
      @media (max-width: 768px) { #bz-btn { top: 12px; right: 12px; } }

      #bz-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 10050; display: none; }
      #bz-panel {
        position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 100vw;
        background: var(--color-white, #fff); z-index: 10060; display: flex; flex-direction: column;
        transform: translateX(100%); transition: transform .28s cubic-bezier(.32,.72,0,1);
        box-shadow: -8px 0 32px rgba(0,0,0,.15);
        padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);
      }
      #bz-panel.open { transform: translateX(0); }
      .bz-head {
        display: flex; align-items: center; gap: 8px; padding: 16px 16px 12px;
        border-bottom: 1px solid var(--color-border, #e8e2d6);
      }
      .bz-head h2 { flex: 1; margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--color-text, #1a1a2e); }
      .bz-head button { background: none; border: none; cursor: pointer; color: var(--color-text-muted, #6b7280); font-size: .8rem; padding: 6px; }
      .bz-head .bz-close { font-size: 1.4rem; line-height: 1; }
      #bz-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .bz-item {
        display: flex; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--color-border, #f0ebe2);
        cursor: pointer; text-align: left; width: 100%; background: none; border-left: 0; border-right: 0; border-top: 0;
        font: inherit; color: inherit;
      }
      .bz-item:hover { background: var(--color-bg, #faf6f0); }
      .bz-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: transparent; }
      .bz-item.nueva .bz-dot { background: var(--color-gold, #c9a84c); }
      .bz-item.nueva .bz-title { font-weight: 700; }
      .bz-body { flex: 1; min-width: 0; }
      .bz-title { font-size: .875rem; color: var(--color-text, #1a1a2e); margin-bottom: 2px; overflow-wrap: anywhere; }
      .bz-text { font-size: .8rem; color: var(--color-text-muted, #6b7280); line-height: 1.4; overflow-wrap: anywhere; }
      .bz-time { font-size: .7rem; color: var(--color-text-muted, #9ca3af); margin-top: 4px; }
      .bz-empty { padding: 48px 24px; text-align: center; color: var(--color-text-muted, #6b7280); font-size: .875rem; }
      .bz-foot { padding: 10px 16px; border-top: 1px solid var(--color-border, #e8e2d6); text-align: center; }
      .bz-foot a { font-size: .8rem; color: var(--color-primary, #1b2e5e); text-decoration: none; }
    `;
    document.head.appendChild(st);
  }

  function construir() {
    estilos();
    const btn = document.createElement('button');
    btn.id = 'bz-btn';
    btn.setAttribute('aria-label', 'Notificaciones');
    btn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg><span id="bz-badge"></span>`;
    btn.onclick = abrir;
    document.body.appendChild(btn);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="bz-overlay"></div>
      <aside id="bz-panel" role="dialog" aria-label="Notificaciones">
        <div class="bz-head">
          <h2>Notificaciones</h2>
          <button id="bz-leer-todas">Marcar todo como leído</button>
          <button class="bz-close" aria-label="Cerrar">&times;</button>
        </div>
        <div id="bz-list"><p class="bz-empty">Cargando…</p></div>
        <div class="bz-foot"><a href="perfil.html#notificaciones">Elegir qué notificaciones recibo</a></div>
      </aside>`;
    while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
    document.getElementById('bz-overlay').onclick = cerrar;
    document.querySelector('#bz-panel .bz-close').onclick = cerrar;
    document.getElementById('bz-leer-todas').onclick = leerTodas;
  }

  function pintarBadge() {
    const n = items.filter(i => !i.leida).length;
    const b = document.getElementById('bz-badge');
    if (!b) return;
    b.textContent = n > 9 ? '9+' : String(n);
    b.style.display = n ? 'flex' : 'none';
  }

  function pintarLista() {
    const list = document.getElementById('bz-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="bz-empty">Aún no tienes notificaciones.<br>Aquí verás avisos de eventos, respuestas del Rav y novedades de la comunidad.</p>';
      return;
    }
    list.innerHTML = items.map(i => `
      <button class="bz-item ${i.leida ? '' : 'nueva'}" data-id="${esc(i.id)}">
        <span class="bz-dot"></span>
        <span class="bz-body">
          <div class="bz-title">${esc(i.titulo)}</div>
          ${i.cuerpo ? `<div class="bz-text">${esc(i.cuerpo)}</div>` : ''}
          <div class="bz-time">${hace(i.created_at)}</div>
        </span>
      </button>`).join('');
    list.querySelectorAll('.bz-item').forEach(el => el.onclick = () => tocar(el.dataset.id));
  }

  async function cargar() {
    const sb = typeof getSupabase === 'function' ? getSupabase() : null;
    if (!sb || !uid) return;
    const { data, error } = await sb.from('notif_buzon')
      .select('id, tipo, titulo, cuerpo, url, leida, created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(LIMITE);
    if (error) return;   // tabla aún no creada: la campana simplemente queda vacía
    items = data || [];
    pintarBadge();
    pintarLista();
  }

  async function marcar(ids) {
    const sb = getSupabase();
    if (!sb || !ids.length) return;
    await sb.from('notif_buzon').update({ leida: true }).in('id', ids);
  }

  /** Solo se navega a páginas internas de la app (nunca a URLs externas). */
  function urlSegura(url) {
    return typeof url === 'string' && /^[a-z0-9-]+\.html([?#].*)?$/i.test(url) ? url : null;
  }

  async function tocar(id) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    if (!it.leida) { it.leida = true; pintarBadge(); pintarLista(); await marcar([id]); }
    const destino = urlSegura(it.url);
    if (destino) window.location.href = destino;
  }

  async function leerTodas() {
    const ids = items.filter(i => !i.leida).map(i => i.id);
    items.forEach(i => { i.leida = true; });
    pintarBadge(); pintarLista();
    await marcar(ids);
  }

  function abrir() {
    document.getElementById('bz-overlay').style.display = 'block';
    document.getElementById('bz-panel').classList.add('open');
    cargar();
  }
  function cerrar() {
    document.getElementById('bz-overlay').style.display = 'none';
    document.getElementById('bz-panel').classList.remove('open');
  }

  async function iniciar() {
    const session = typeof getValidSession === 'function' ? await getValidSession().catch(() => null) : null;
    uid = session?.user?.id || (typeof getCurrentUser === 'function' ? getCurrentUser()?.userId : null);
    if (!uid) return;
    construir();
    cargar();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
  }

  window.cargarBuzon = cargar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
