/**
 * @file analytics.js
 * @description Panel de analíticas del admin (pestaña "Analíticas").
 *
 * Todos los números salen de la función SQL analytics_dashboard(desde, hasta)
 * (supabase/migrations/20261015120000_analytics_v2.sql): se calculan en la
 * base de datos, sin el límite de 1000 filas de la API y sin traer datos
 * personales al navegador — solo agregados. Excluye admins/staff/baneados.
 *
 * Fuentes que alimentan esa función:
 *  - page_views  → qué sección abre cada miembro (trackPageView, js/nav.js)
 *  - app_events  → qué HACE: pasos de registro/mikve, inscripciones, citas,
 *                  errores JS... (trackEvent, js/auth.js)
 *  - profiles, inscripciones, mikve_reservas, citas, preguntas_rav,
 *    donaciones, news_reads, push_tokens, push_log (tablas de negocio)
 *
 * PUNTO DE ENTRADA: loadAnalyticsDashboard() — admin.html la llama al abrir
 * la pestaña. Secciones: Termómetro (KPIs) + Crecimiento, Uso, Retención,
 * Acciones, Audiencia y Calidad.
 *
 * DEPENDENCIAS: auth.js (getSupabase), /vendor/chart.umd.min.js (window.Chart)
 */

'use strict';

// ─── 1. Estado y utilidades ──────────────────────────────────────

// Primer page_view registrado en producción: 7-sep-2026 (lanzamiento)
const AN_LAUNCH = '2026-09-07T00:00:00+02:00';
const AN_RANGES = [
  { id: '7',      label: '7 días',  days: 7 },
  { id: '30',     label: '30 días', days: 30 },
  { id: '90',     label: '90 días', days: 90 },
  { id: 'launch', label: 'Desde el lanzamiento' }
];
const AN_SUBTABS = [
  { id: 'crecimiento', label: 'Crecimiento' },
  { id: 'uso',         label: 'Uso' },
  { id: 'retencion',   label: 'Retención' },
  { id: 'acciones',    label: 'Acciones' },
  { id: 'audiencia',   label: 'Audiencia' },
  { id: 'calidad',     label: 'Calidad técnica' }
];

let _anRange = '30';
let _anSubtab = 'crecimiento';
let _anData = null;
let _anLoading = false;

function _anSB() { return typeof getSupabase === 'function' ? getSupabase() : null; }

function _anEsc(str) {
  if (typeof escHtml === 'function') return escHtml(str == null ? '' : String(str));
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _fmtNum(n) { return Number(n || 0).toLocaleString('es-ES'); }
function _fmtEur(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function _fmtDay(d) {
  const x = new Date(d);
  return isNaN(x) ? '—' : x.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
function _pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function _el(id) { return document.getElementById(id); }
function _set(id, html) { const el = _el(id); if (el) el.innerHTML = html; }

const _anCharts = {};
function _destroyChart(id) {
  if (_anCharts[id]) { try { _anCharts[id].destroy(); } catch (e) {} delete _anCharts[id]; }
}

const _PAGE_LABELS = {
  home: 'Inicio', noticias: 'Noticias', eventos: 'Eventos', donativos: 'Donativos',
  'rav-hub': 'Rav Hub', rav: 'Preguntas al Rav', shiurim: 'Shiurim', kosher: 'Kosher',
  wallap: 'Wallap', servicios: 'Servicios', calendario: 'Calendario', mikve: 'Mikvé',
  perfil: 'Perfil', 'citas-rabino': 'Citas con el Rav', business: 'Business',
  professionals: 'Profesionales', galeria: 'Galería', siddur: 'Sidur',
  voluntariado: 'Voluntariado', tienda: 'Tienda', jconnect: '{{labels.business}}', contacto: 'Contacto'
};
// Secciones que registran visitas; las que no aparezcan en el periodo = "sin uso"
const _TRACKED_PAGES = ['home', 'eventos', 'calendario', 'mikve', 'servicios', 'business',
  'professionals', 'shiurim', 'donativos', 'rav', 'citas-rabino', 'noticias', 'galeria',
  'kosher', 'siddur', 'voluntariado', 'contacto', 'perfil'];
function _pageLabel(id) { return _PAGE_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Otra'); }

function _rangeDates(rangeId) {
  const hasta = new Date();
  const r = AN_RANGES.find(x => x.id === rangeId) || AN_RANGES[1];
  const desde = r.days ? new Date(hasta.getTime() - r.days * 864e5) : new Date(AN_LAUNCH);
  return { desde, hasta };
}

/** "▲ 12%" / "▼ 30%" frente al periodo anterior de la misma duración. */
function _delta(cur, prev) {
  if (_anRange === 'launch') return '';
  if (!prev) return cur ? '<span class="an-delta up">nuevo</span>' : '';
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return '<span class="an-delta">= que antes</span>';
  return `<span class="an-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}% vs. periodo anterior</span>`;
}

function _empty(msg) { return `<p class="an-none">${_anEsc(msg || 'Sin datos todavía en este periodo.')}</p>`; }

/** Busca en app_events agregados: n.º de sesiones (o usuarios) con ese evento/paso. */
function _ev(d, event, paso) {
  const rows = (d.app_events || []).filter(r => r.event === event && (paso == null || String(r.paso) === String(paso)));
  return rows.reduce((s, r) => s + (r.sesiones || r.usuarios || r.veces || 0), 0);
}

// ─── 2. Carga ────────────────────────────────────────────────────

async function _anFetch() {
  const sb = _anSB();
  if (!sb) throw new Error('Sin conexión a Supabase');
  const { desde, hasta } = _rangeDates(_anRange);
  const { data, error } = await sb.rpc('analytics_dashboard', {
    p_desde: desde.toISOString(), p_hasta: hasta.toISOString()
  });
  if (error) throw error;
  return data;
}

/**
 * Punto de entrada: pinta la estructura (una vez) y carga el periodo actual.
 * @returns {Promise<void>}
 */
async function loadAnalyticsDashboard() {
  _anBuildShell();
  if (_anLoading) return;
  _anLoading = true;
  _set('an-status', 'Cargando…');
  _el('an-root')?.classList.add('an-loading');
  try {
    _anData = await _anFetch();
    _anRenderAll();
    const t = new Date(_anData?.periodo?.generado || Date.now());
    _set('an-status', 'Actualizado ' + t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    console.error('[analytics] fallo al cargar:', e);
    const msg = (e && (e.code === 'PGRST202' || /analytics_dashboard/.test(e.message || '')))
      ? 'Falta ejecutar la migración analytics v2 en Supabase.'
      : 'No se pudieron cargar los datos: ' + (e?.message || e);
    _set('an-status', `<span style="color:var(--color-danger)">${_anEsc(msg)}</span>`);
  } finally {
    _anLoading = false;
    _el('an-root')?.classList.remove('an-loading');
  }
}

function _anSetRange(id) {
  _anRange = id;
  document.querySelectorAll('.an-range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === id));
  loadAnalyticsDashboard();
}

function _anSetSubtab(id) {
  _anSubtab = id;
  document.querySelectorAll('.an-subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === id));
  document.querySelectorAll('.an-subpanel').forEach(p => p.classList.toggle('active', p.id === 'an-sub-' + id));
  // Chart.js necesita el canvas visible para medir: redibujar al cambiar de pestaña
  if (_anData) setTimeout(() => _anRenderCharts(_anData), 30);
}

function _anBuildShell() {
  const root = _el('an-root');
  if (!root || root.dataset.built) return;
  root.dataset.built = '1';
  root.innerHTML = `
    <div class="an-toolbar">
      <div class="an-ranges" role="group" aria-label="Periodo">
        ${AN_RANGES.map(r => `<button type="button" class="an-range-btn${r.id === _anRange ? ' active' : ''}" data-range="${r.id}" onclick="_anSetRange('${r.id}')">${r.label}</button>`).join('')}
      </div>
      <div class="an-toolbar-right">
        <span id="an-status" class="an-status"></span>
        <button type="button" class="an-export-btn" onclick="_anExportCSV()">Exportar CSV</button>
      </div>
    </div>

    <div id="an-alerts"></div>

    <p class="an-block-title">Termómetro</p>
    <div class="an-kpis" id="an-kpis"></div>

    <div class="an-subtabs" role="tablist">
      ${AN_SUBTABS.map(s => `<button type="button" role="tab" class="an-subtab${s.id === _anSubtab ? ' active' : ''}" data-sub="${s.id}" onclick="_anSetSubtab('${s.id}')">${s.label}</button>`).join('')}
    </div>

    <section class="an-subpanel${_anSubtab === 'crecimiento' ? ' active' : ''}" id="an-sub-crecimiento">
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Nuevos registros y aprobaciones por semana</p></div>
        <div class="an-chart"><canvas id="an-chart-crec"></canvas></div>
      </div>
      <div class="an-grid-2">
        <div class="an-card">
          <div class="an-card-head"><p class="an-card-title">Embudo de registro</p><span class="an-caption">Visitas que llegan a cada paso</span></div>
          <div id="an-funnel-registro" class="an-pad"></div>
        </div>
        <div class="an-card">
          <div class="an-card-head"><p class="an-card-title">Aprobación de solicitudes</p></div>
          <div id="an-aprobacion" class="an-pad"></div>
        </div>
      </div>
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">¿Cómo nos conocieron?</p><span class="an-caption">Respuesta del formulario de registro</span></div>
        <div id="an-conocio" class="an-pad"></div>
      </div>
    </section>

    <section class="an-subpanel${_anSubtab === 'uso' ? ' active' : ''}" id="an-sub-uso">
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Miembros activos por semana</p><span class="an-caption">Personas distintas que abrieron la app</span></div>
        <div class="an-chart"><canvas id="an-chart-activos"></canvas></div>
      </div>
      <div class="an-grid-2">
        <div class="an-card">
          <div class="an-card-head"><p class="an-card-title">Secciones más usadas</p><span class="an-caption">Personas distintas · visitas</span></div>
          <div id="an-secciones"></div>
        </div>
        <div>
          <div class="an-card">
            <div class="an-card-head"><p class="an-card-title">Dispositivo</p></div>
            <div id="an-plataformas" class="an-pad"></div>
          </div>
          <div class="an-card">
            <div class="an-card-head"><p class="an-card-title">Secciones sin uso en el periodo</p></div>
            <div id="an-sin-uso" class="an-pad"></div>
          </div>
        </div>
      </div>
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">¿Cuándo se usa la app?</p><span class="an-caption">Día y hora (hora local) · útil para programar avisos push</span></div>
        <div id="an-heatmap" class="an-pad an-scroll-x"></div>
      </div>
    </section>

    <section class="an-subpanel${_anSubtab === 'retencion' ? ' active' : ''}" id="an-sub-retencion">
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Retención por semana de registro</p><span class="an-caption">% de cada grupo que volvió a usar la app N semanas después</span></div>
        <div id="an-cohortes" class="an-scroll-x"></div>
        <p class="an-note">Cómo leerlo: de las personas que se registraron esa semana, qué porcentaje usó la app durante la 1.ª, 2.ª, 4.ª y 8.ª semana siguiente. "—" = todavía no ha pasado ese tiempo.</p>
      </div>
    </section>

    <section class="an-subpanel${_anSubtab === 'acciones' ? ' active' : ''}" id="an-sub-acciones">
      <div class="an-kpis an-kpis-small" id="an-acciones"></div>
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">¿Terminan lo que empiezan?</p><span class="an-caption">Empezaron → completaron · detecta dónde se atasca la gente</span></div>
        <div id="an-funnels" class="an-pad"></div>
      </div>
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Eventos: inscritos vs. aforo</p></div>
        <div id="an-eventos"></div>
      </div>
    </section>

    <section class="an-subpanel${_anSubtab === 'audiencia' ? ' active' : ''}" id="an-sub-audiencia">
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Uso por edad</p><span class="an-caption">Miembros aprobados y cuántos usaron la app en el periodo</span></div>
        <div id="an-edades"></div>
      </div>
      <div class="an-grid-3">
        <div class="an-card"><div class="an-card-head"><p class="an-card-title">Género</p></div><div id="an-genero" class="an-pad"></div></div>
        <div class="an-card"><div class="an-card-head"><p class="an-card-title">Práctica</p></div><div id="an-practica" class="an-pad"></div></div>
        <div class="an-card"><div class="an-card-head"><p class="an-card-title">Ciudad</p></div><div id="an-ciudad" class="an-pad"></div></div>
      </div>
    </section>

    <section class="an-subpanel${_anSubtab === 'calidad' ? ' active' : ''}" id="an-sub-calidad">
      <div class="an-kpis an-kpis-small" id="an-calidad-kpis"></div>
      <div class="an-card">
        <div class="an-card-head"><p class="an-card-title">Errores más frecuentes</p><span class="an-caption">Errores reales en los móviles de los usuarios</span></div>
        <div id="an-errores"></div>
      </div>
      <div class="an-grid-2">
        <div class="an-card"><div class="an-card-head"><p class="an-card-title">Acciones que fallaron</p></div><div id="an-fallos" class="an-pad"></div></div>
        <div class="an-card"><div class="an-card-head"><p class="an-card-title">Versiones de la app</p><span class="an-caption">iOS / Android en uso</span></div><div id="an-versiones" class="an-pad"></div></div>
      </div>
    </section>`;
}

// ─── 3. Render ───────────────────────────────────────────────────

function _anRenderAll() {
  const d = _anData || {};
  _anRenderAlerts(d);
  _anRenderKPIs(d);
  _anRenderCrecimiento(d);
  _anRenderUso(d);
  _anRenderRetencion(d);
  _anRenderAcciones(d);
  _anRenderAudiencia(d);
  _anRenderCalidad(d);
  setTimeout(() => _anRenderCharts(d), 30);
}

/** % medio de la cohorte que volvió la semana 1 (solo cohortes con dato). */
function _retencionS1(d) {
  let base = 0, vuelven = 0;
  (d.cohortes || []).forEach(c => { if (c.s1 != null) { base += c.tamano; vuelven += c.s1; } });
  return base ? { pct: _pct(vuelven, base), base } : null;
}

function _anRenderAlerts(d) {
  const k = d.kpis || {};
  const out = [];
  if (k.pendientes > 0) {
    out.push({
      tone: k.pendientes_mas_7d > 0 ? 'danger' : 'warn',
      html: `<strong>${_fmtNum(k.pendientes)} personas esperan aprobación</strong>` +
        (k.pendientes_mas_7d ? ` · ${_fmtNum(k.pendientes_mas_7d)} desde hace más de 7 días` : '') +
        ` · media ${_anEsc(k.pendientes_dias_media ?? '—')} días esperando.` +
        ` <a href="#" onclick="event.preventDefault();document.querySelector('[data-tab=&quot;usuarios&quot;]')?.click();">Revisar →</a>`
    });
  }
  if (k.nunca_abrieron > 0) {
    out.push({ tone: 'info', html: `<strong>${_fmtNum(k.nunca_abrieron)} miembros aprobados</strong> no han abierto la app ni una vez desde que se registra el uso (7-sep).` });
  }
  const sem = (d.semanal || []).slice(-3, -1); // dos últimas semanas completas
  if (sem.length === 2 && sem[0].activos > 0) {
    const ch = _pct(sem[1].activos - sem[0].activos, sem[0].activos);
    if (ch <= -20) out.push({ tone: 'warn', html: `El uso semanal bajó un <strong>${Math.abs(ch)}%</strong> (de ${sem[0].activos} a ${sem[1].activos} personas) la última semana completa.` });
  }
  _set('an-alerts', out.map(a => `<div class="an-alert ${a.tone}">${a.html}</div>`).join(''));
}

function _anRenderKPIs(d) {
  const k = d.kpis || {};
  const ret = _retencionS1(d);
  const ac = d.acciones || {};
  const accionesHechas = (ac.inscripciones_eventos || 0) + (ac.mikve_reservas || 0) + (ac.citas_rav || 0) +
    (ac.preguntas_rav || 0) + (ac.donaciones || 0);
  const cards = [
    { label: 'Nuevos registros', value: _fmtNum(k.nuevos), sub: _delta(k.nuevos, k.nuevos_prev) },
    { label: 'Miembros activos', value: _fmtNum(k.activos),
      sub: _delta(k.activos, k.activos_prev) || `${_pct(k.activos, k.miembros_activos)}% de los aprobados` },
    { label: 'Activos últimos 7 días', value: _fmtNum(k.activos_7d),
      sub: `<span class="an-delta">${_pct(k.activos_7d, k.miembros_activos)}% de ${_fmtNum(k.miembros_activos)} aprobados</span>` },
    { label: 'Vuelven la 2.ª semana', value: ret ? ret.pct + '%' : '—',
      sub: `<span class="an-delta">${ret ? 'de ' + _fmtNum(ret.base) + ' registrados' : 'aún sin datos'}</span>` },
    { label: 'Pendientes de aprobar', value: _fmtNum(k.pendientes), tone: k.pendientes_mas_7d ? 'danger' : (k.pendientes ? 'warn' : ''),
      sub: `<span class="an-delta">${k.aprobacion_horas_media != null ? 'aprobación media ' + _anEsc(k.aprobacion_horas_media) + ' h' : 'media ' + _anEsc(k.pendientes_dias_media ?? 0) + ' días esperando'}</span>` },
    { label: 'Acciones completadas', value: _fmtNum(accionesHechas),
      sub: '<span class="an-delta">inscripciones, mikve, citas, preguntas, donaciones</span>' }
  ];
  _set('an-kpis', cards.map(c => `
    <div class="an-kpi ${c.tone || ''}">
      <p class="an-kpi-label">${c.label}</p>
      <p class="an-kpi-value">${c.value}</p>
      <p class="an-kpi-sub">${c.sub || ''}</p>
    </div>`).join(''));
}

/** Barras horizontales de embudo: [{label, n}] — % respecto al primer paso. */
function _funnel(steps) {
  const base = steps[0]?.n || 0;
  if (!base) return _empty('Sin datos todavía: se empiezan a registrar desde esta versión.');
  return steps.map((s, i) => {
    const p = _pct(s.n, base);
    const prev = i > 0 ? steps[i - 1].n : null;
    const drop = prev ? _pct(prev - s.n, prev) : 0;
    return `<div class="an-fn-row">
      <span class="an-fn-label">${_anEsc(s.label)}</span>
      <span class="an-fn-bar"><span style="width:${Math.max(p, 2)}%"></span></span>
      <span class="an-fn-num">${_fmtNum(s.n)} <small>${p}%${i > 0 && drop >= 25 ? ` · <b class="an-drop">−${drop}%</b>` : ''}</small></span>
    </div>`;
  }).join('');
}

/** Lista "clave → n" con barra proporcional. */
function _bars(entries, total) {
  if (!entries.length) return _empty();
  const max = total || Math.max(...entries.map(e => e[1]));
  return entries.map(([k, n]) => `<div class="an-fn-row">
      <span class="an-fn-label">${_anEsc(k)}</span>
      <span class="an-fn-bar"><span style="width:${Math.max(_pct(n, max), 2)}%"></span></span>
      <span class="an-fn-num">${_fmtNum(n)}${total ? ` <small>${_pct(n, total)}%</small>` : ''}</span>
    </div>`).join('');
}

function _anRenderCrecimiento(d) {
  _set('an-funnel-registro', _funnel([
    { label: 'Abrieron el formulario', n: _ev(d, 'registro_paso', 1) },
    { label: 'Paso 2 (identidad)',     n: _ev(d, 'registro_paso', 2) },
    { label: 'Paso 3 (dirección)',     n: _ev(d, 'registro_paso', 3) },
    { label: 'Paso 4 (confirmación)',  n: _ev(d, 'registro_paso', 4) },
    { label: 'Enviaron la solicitud',  n: _ev(d, 'registro_enviado') }
  ]));
  const k = d.kpis || {};
  const aprobados = (d.semanal || []).reduce((s, w) => s + (w.aprobados || 0), 0);
  _set('an-aprobacion', `
    <div class="an-stat-row"><span>Pendientes ahora</span><strong>${_fmtNum(k.pendientes)}</strong></div>
    <div class="an-stat-row"><span>…de ellos, esperando más de 7 días</span><strong class="${k.pendientes_mas_7d ? 'an-bad' : ''}">${_fmtNum(k.pendientes_mas_7d)}</strong></div>
    <div class="an-stat-row"><span>Espera media de los pendientes</span><strong>${_anEsc(k.pendientes_dias_media ?? '—')} días</strong></div>
    <div class="an-stat-row"><span>Aprobados en el periodo</span><strong>${_fmtNum(aprobados)}</strong></div>
    <div class="an-stat-row"><span>Tiempo medio hasta aprobar</span><strong>${k.aprobacion_horas_media != null ? _anEsc(k.aprobacion_horas_media) + ' h' : '—'}</strong></div>
    <p class="an-note">El tiempo de aprobación se mide desde el 15-oct-2026 (antes no se guardaba la fecha).</p>`);
  const cc = Object.entries(d.audiencia?.como_conocio || {}).sort((a, b) => b[1] - a[1]);
  const total = cc.reduce((s, e) => s + e[1], 0);
  const sinDato = (d.audiencia?.como_conocio || {})['Sin dato'] || 0;
  _set('an-conocio', _bars(cc, total) +
    (sinDato && sinDato / total > 0.5 ? '<p class="an-note">La mayoría no tiene respuesta: el formulario de registro actual no pregunta "¿cómo nos conociste?".</p>' : ''));
}

function _anRenderUso(d) {
  const k = d.kpis || {};
  const secc = d.secciones || [];
  _set('an-secciones', secc.length ? `<table class="an-table"><thead><tr><th>Sección</th><th class="r">Personas</th><th class="r">% activos</th><th class="r">Visitas</th></tr></thead><tbody>
    ${secc.map(s => `<tr><td>${_anEsc(_pageLabel(s.page))}</td><td class="r">${_fmtNum(s.usuarios)}</td><td class="r">${_pct(s.usuarios, k.activos)}%</td><td class="r">${_fmtNum(s.visitas)}</td></tr>`).join('')}
    </tbody></table>` : _empty());

  const usadas = new Set(secc.filter(s => s.usuarios > 0).map(s => s.page));
  const sinUso = _TRACKED_PAGES.filter(p => !usadas.has(p));
  const pocoUso = secc.filter(s => k.activos && _pct(s.usuarios, k.activos) < 5).map(s => s.page);
  _set('an-sin-uso',
    (sinUso.length ? `<p class="an-chips">${sinUso.map(p => `<span class="an-chip">${_anEsc(_pageLabel(p))}</span>`).join('')}</p>` : '<p class="an-note">Todas las secciones tuvieron visitas.</p>') +
    (pocoUso.length ? `<p class="an-note">Menos del 5% de los activos: ${pocoUso.map(p => _anEsc(_pageLabel(p))).join(', ')}.</p>` : ''));

  const pl = d.plataformas || {};
  const act = Object.entries(pl.actividad || {}).filter(([k2]) => k2 !== 'sin_dato');
  const PL = { ios: 'iPhone (app)', android: 'Android (app)', pwa: 'Web instalada', web: 'Navegador' };
  const push = Object.entries(pl.push || {}).map(([k2, n]) => [PL[k2] || k2, n]);
  _set('an-plataformas',
    (act.length ? _bars(act.map(([k2, n]) => [PL[k2] || k2, n]).sort((a, b) => b[1] - a[1]), act.reduce((s, e) => s + e[1], 0))
      : '<p class="an-note">Uso por dispositivo: se registra desde esta versión.</p>') +
    (push.length ? `<p class="an-mini-title">Con notificaciones push activadas</p>${_bars(push.sort((a, b) => b[1] - a[1]))}` : ''));

  // Mapa de calor 7×24
  const hm = d.heatmap || [];
  if (!hm.length) { _set('an-heatmap', _empty()); return; }
  const grid = {}; let max = 0;
  hm.forEach(([dow, h, n]) => { grid[dow + '-' + h] = n; if (n > max) max = n; });
  const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  let html = '<div class="an-heat"><span></span>';
  for (let h = 0; h < 24; h++) html += `<span class="an-heat-h">${h % 3 === 0 ? h : ''}</span>`;
  for (let dow = 1; dow <= 7; dow++) {
    html += `<span class="an-heat-d">${DIAS[dow]}</span>`;
    for (let h = 0; h < 24; h++) {
      const n = grid[dow + '-' + h] || 0;
      const a = n ? (0.12 + 0.88 * Math.sqrt(n / max)).toFixed(2) : 0; // raíz: que un pico no apague el resto
      html += `<span class="an-heat-c"${n ? ` style="background:rgba(27,46,94,${a})"` : ''} title="${DIAS[dow]} ${h}:00 · ${n} visitas"></span>`;
    }
  }
  _set('an-heatmap', html + '</div>');
}

function _anRenderRetencion(d) {
  const rows = d.cohortes || [];
  if (!rows.length) { _set('an-cohortes', _empty('Nadie se registró en este periodo. Prueba "Desde el lanzamiento".')); return; }
  const cell = (n, base) => {
    if (n == null) return '<td class="r an-muted">—</td>';
    const p = _pct(n, base);
    return `<td class="r an-ret" style="background:rgba(16,185,129,${(p / 100 * 0.6).toFixed(2)})">${p}%</td>`;
  };
  _set('an-cohortes', `<table class="an-table"><thead><tr><th>Semana de registro</th><th class="r">Personas</th><th class="r">Semana 1</th><th class="r">Semana 2</th><th class="r">Semana 4</th><th class="r">Semana 8</th></tr></thead><tbody>
    ${rows.map(c => `<tr><td>${_fmtDay(c.semana)}</td><td class="r">${_fmtNum(c.tamano)}</td>${cell(c.s1, c.tamano)}${cell(c.s2, c.tamano)}${cell(c.s4, c.tamano)}${cell(c.s8, c.tamano)}</tr>`).join('')}
    </tbody></table>`);
}

function _anRenderAcciones(d) {
  const a = d.acciones || {};
  const items = [
    ['Inscripciones a eventos', a.inscripciones_eventos, `${_fmtNum(a.inscritos_unicos)} personas distintas`],
    ['Reservas de mikve', a.mikve_reservas],
    ['Citas con el Rav', a.citas_rav],
    ['Preguntas al Rav', a.preguntas_rav],
    ['Donaciones', a.donaciones, _fmtEur(a.donaciones_eur)],
    ['Noticias leídas', a.noticias_leidas],
    ['Shiurim reproducidos', _ev(d, 'shiur_play'), `${_fmtNum(a.shiurim_vistas_total)} vistas en total`],
    ['Voluntariado', a.voluntariado],
    ['Solicitudes de servicios', a.servicios_solicitudes]
  ];
  _set('an-acciones', items.map(([l, n, sub]) => `
    <div class="an-kpi"><p class="an-kpi-label">${l}</p><p class="an-kpi-value">${_fmtNum(n)}</p>${sub ? `<p class="an-kpi-sub"><span class="an-delta">${sub}</span></p>` : ''}</div>`).join(''));

  const flujos = [
    ['Reserva de mikve', [
      { label: '1 · Fecha', n: _ev(d, 'mikve_paso', 1) }, { label: '2 · Servicio', n: _ev(d, 'mikve_paso', 2) },
      { label: '3 · Hora', n: _ev(d, 'mikve_paso', 3) }, { label: '4 · Notas', n: _ev(d, 'mikve_paso', 4) },
      { label: '5 · Donación', n: _ev(d, 'mikve_paso', 5) }, { label: '6 · Pago', n: _ev(d, 'mikve_paso', 6) },
      { label: 'Reserva confirmada', n: _ev(d, 'mikve_ok') }]],
    ['Inscripción a eventos', [
      { label: 'Abrieron la inscripción', n: _ev(d, 'inscripcion_inicio') },
      { label: 'Se inscribieron', n: _ev(d, 'inscripcion_ok') }]],
    ['Cita con el Rav', [
      { label: 'Eligieron tipo de cita', n: _ev(d, 'cita_inicio') },
      { label: 'Cita confirmada', n: _ev(d, 'cita_ok') }]],
    ['Donación', [
      { label: 'Abrieron un área', n: _ev(d, 'donacion_inicio') },
      { label: 'Fueron a pagar', n: _ev(d, 'donacion_click') }]]
  ];
  _set('an-funnels', flujos.map(([t, steps]) => `<p class="an-mini-title">${t}</p>${_funnel(steps)}`).join(''));

  const evs = d.eventos || [];
  _set('an-eventos', evs.length ? `<table class="an-table"><thead><tr><th>Evento</th><th>Fecha</th><th class="r">Inscritos</th><th class="r">Aforo</th><th class="r">Ocupación</th></tr></thead><tbody>
    ${evs.map(e => `<tr><td>${_anEsc(e.titulo)}</td><td>${_fmtDay(e.fecha)}</td><td class="r">${_fmtNum(e.inscritos)}</td><td class="r">${e.aforo ? _fmtNum(e.aforo) : '—'}</td><td class="r">${e.aforo ? _pct(e.inscritos, e.aforo) + '%' : '—'}</td></tr>`).join('')}
    </tbody></table>` : _empty('No hay eventos en este periodo.'));
}

function _anRenderAudiencia(d) {
  const au = d.audiencia || {};
  // 'Sin dato' al final (la SQL ordena por edad mínima de cada franja)
  const ed = (au.edades || []).slice().sort((a, b) => (a.franja === 'Sin dato') - (b.franja === 'Sin dato'));
  _set('an-edades', ed.length ? `<table class="an-table"><thead><tr><th>Edad</th><th class="r">Miembros</th><th class="r">Usaron la app</th><th>% que la usa</th></tr></thead><tbody>
    ${ed.map(e => { const p = _pct(e.activos, e.miembros); return `<tr><td>${_anEsc(e.franja)}</td><td class="r">${_fmtNum(e.miembros)}</td><td class="r">${_fmtNum(e.activos)}</td>
      <td><span class="an-fn-bar an-inline"><span style="width:${Math.max(p, 2)}%"></span></span> ${p}%</td></tr>`; }).join('')}
    </tbody></table>` : _empty());
  const toEntries = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
  const sum = es => es.reduce((s, e) => s + e[1], 0);
  const g = toEntries(au.genero).map(([k, n]) => [k === 'hombre' ? 'Hombres' : k === 'mujer' ? 'Mujeres' : k, n]);
  _set('an-genero', _bars(g, sum(g)));
  const p = toEntries(au.practica); _set('an-practica', _bars(p, sum(p)));
  const c = (au.ciudad || []).map(x => [x[0], x[1]]); _set('an-ciudad', _bars(c));
}

function _anRenderCalidad(d) {
  const q = d.calidad || {};
  const fallos = (d.app_events || []).filter(r => /_error$/.test(r.event));
  const totalFallos = fallos.reduce((s, r) => s + (r.veces || 0), 0);
  _set('an-calidad-kpis', [
    ['Errores JS', q.errores_total, `${_fmtNum(q.errores_usuarios)} personas afectadas`],
    ['Acciones fallidas', totalFallos, 'inscripción, mikve, cita, pregunta, login'],
    ['Avisos push enviados', q.push_enviados, `${_fmtNum(q.push_envios)} envíos`],
    ['Push fallidos', q.push_fallidos, q.push_enviados ? _pct(q.push_fallidos, q.push_enviados + q.push_fallidos) + '% del total' : '']
  ].map(([l, n, sub]) => `<div class="an-kpi ${l === 'Push fallidos' && n ? 'warn' : ''}"><p class="an-kpi-label">${l}</p><p class="an-kpi-value">${_fmtNum(n)}</p><p class="an-kpi-sub"><span class="an-delta">${sub}</span></p></div>`).join(''));

  const errs = q.errores_top || [];
  _set('an-errores', errs.length ? `<table class="an-table"><thead><tr><th>Mensaje</th><th>Página</th><th class="r">Veces</th><th>Última</th></tr></thead><tbody>
    ${errs.map(e => `<tr><td class="an-mono">${_anEsc(e.msg)}</td><td>${_anEsc(_pageLabel(e.page))}</td><td class="r">${_fmtNum(e.veces)}</td><td>${_fmtDay(e.ultima)}</td></tr>`).join('')}
    </tbody></table>` : _empty('Ningún error registrado en este periodo.'));

  const NOMBRES = { login_error: 'Login (contraseña incorrecta)', registro_error: 'Registro', inscripcion_error: 'Inscripción a evento',
    mikve_error: 'Reserva / pago de mikve', cita_error: 'Cita con el Rav', pregunta_error: 'Pregunta al Rav' };
  _set('an-fallos', _bars(fallos.map(r => [NOMBRES[r.event] || r.event, r.veces]).sort((a, b) => b[1] - a[1])));
  const vers = Object.entries(q.versiones || {}).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k.replace(/^ios /, 'iPhone ').replace(/^android /, 'Android '), n]);
  _set('an-versiones', vers.length ? _bars(vers) : '<p class="an-note">Se registra desde esta versión (solo app nativa).</p>');
}

function _anRenderCharts(d) {
  if (typeof Chart === 'undefined') return;
  const sem = d.semanal || [];
  const labels = sem.map(w => _fmtDay(w.semana));
  const font = { family: 'inherit', size: 11 };
  const base = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font, boxWidth: 12 } } },
    scales: { x: { grid: { display: false }, ticks: { font } }, y: { beginAtZero: true, ticks: { precision: 0, font } } }
  };
  const crec = _el('an-chart-crec');
  if (crec && crec.offsetParent) {
    _destroyChart('crec');
    _anCharts.crec = new Chart(crec, { type: 'bar', options: base, data: { labels, datasets: [
      { label: 'Nuevos registros', data: sem.map(w => w.nuevos), backgroundColor: '#1B2E5E', borderRadius: 4 },
      { label: 'Aprobados', data: sem.map(w => w.aprobados), backgroundColor: '#C9A84C', borderRadius: 4 }
    ] } });
  }
  const act = _el('an-chart-activos');
  if (act && act.offsetParent) {
    _destroyChart('act');
    _anCharts.act = new Chart(act, { type: 'line', options: base, data: { labels, datasets: [
      { label: 'Personas activas', data: sem.map(w => w.activos), borderColor: '#1B2E5E', backgroundColor: 'rgba(27,46,94,.08)', fill: true, tension: .3, pointRadius: 3 }
    ] } });
  }
}

// ─── 4. Exportar ─────────────────────────────────────────────────

/** CSV para la reunión mensual: KPIs, serie semanal, secciones, acciones, cohortes. */
function _anExportCSV() {
  const d = _anData;
  if (!d) return;
  const rows = [['seccion', 'clave', 'valor']];
  const add = (s, k, v) => rows.push([s, k, v == null ? '' : v]);
  add('periodo', 'desde', d.periodo?.desde); add('periodo', 'hasta', d.periodo?.hasta);
  Object.entries(d.kpis || {}).forEach(([k, v]) => add('kpis', k, v));
  (d.semanal || []).forEach(w => add('semanal', w.semana, `nuevos=${w.nuevos}; aprobados=${w.aprobados}; activos=${w.activos}; visitas=${w.visitas}`));
  (d.secciones || []).forEach(s => add('secciones', _pageLabel(s.page), `personas=${s.usuarios}; visitas=${s.visitas}`));
  Object.entries(d.acciones || {}).forEach(([k, v]) => add('acciones', k, v));
  (d.cohortes || []).forEach(c => add('retencion', c.semana, `personas=${c.tamano}; s1=${c.s1 ?? ''}; s2=${c.s2 ?? ''}; s4=${c.s4 ?? ''}; s8=${c.s8 ?? ''}`));
  (d.audiencia?.edades || []).forEach(e => add('edades', e.franja, `miembros=${e.miembros}; activos=${e.activos}`));
  (d.app_events || []).forEach(e => add('app_events', e.event + (e.paso ? ' paso ' + e.paso : ''), `veces=${e.veces}; personas=${e.usuarios}; sesiones=${e.sesiones}`));
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kehila-analiticas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
