/**
 * @file perfil-notif.js
 * @description perfil.html → preferencias de notificaciones y cumpleaños hebreo.
 *
 *  · notif_preferencias: una fila por usuario (sin fila = todo activado salvo el Omer).
 *  · profiles.nacimiento_puesta_sol / cumple_hebreo_dia / cumple_hebreo_mes:
 *    la Edge Function notif-cron usa exactamente estos datos para el aviso.
 *
 * DEPENDENCIAS: auth.js (getSupabase, getValidSession)
 */

(function () {
  const PREFS = [
    ['eventos',   'Eventos',               'Nuevos eventos y recordatorios'],
    ['novedades', 'Novedades',             'Noticias y fotos nuevas de la comunidad'],
    ['tora',      'Torá',                  'Nuevos shiurim'],
    ['shabat',    'Shabat',                'El viernes, la hora del encendido de velas'],
    ['jaguim',    'Festividades',          'Jaguim, ayunos, Rosh Jodesh y Janucá'],
    ['cumple',    'Cumpleaños',            'Tu cumpleaños, tu cumpleaños hebreo y el de tus hijos'],
    ['resumen',   'Resumen semanal',       'El domingo, los eventos de la semana'],
    ['omer',      'Cuenta del Omer',       'Cada noche entre Pésaj y Shavuot'],
  ];
  const DEFECTO = { eventos: true, novedades: true, tora: true, shabat: true, jaguim: true, cumple: true, resumen: true, omer: false };

  const MESES_ES = {
    Tishrei: 'Tishrei', Cheshvan: 'Jeshván', Kislev: 'Kislev', Tevet: 'Tevet', "Sh'vat": 'Shevat',
    Adar: 'Adar', 'Adar I': 'Adar I', 'Adar II': 'Adar II', Nisan: 'Nisán', Iyyar: 'Iyar',
    Sivan: 'Siván', Tamuz: 'Tamuz', Av: 'Av', Elul: 'Elul',
  };

  let uid = null;
  let prefs = { ...DEFECTO };

  const toast = (m, t) => (typeof showToast === 'function' ? showToast(m, t) : null);

  /* ───────── Preferencias ───────── */

  function pintarPrefs() {
    const list = document.getElementById('np-list');
    if (!list) return;
    list.innerHTML = PREFS.map(([k, t, d]) => `
      <label class="np-item">
        <span><b>${t}</b><small>${d}</small></span>
        <input type="checkbox" data-k="${k}" ${prefs[k] ? 'checked' : ''}>
      </label>`).join('');
    list.querySelectorAll('input').forEach(i => i.onchange = () => guardarPref(i.dataset.k, i.checked, i));
  }

  async function guardarPref(k, v, input) {
    prefs[k] = v;
    const { error } = await getSupabase().from('notif_preferencias')
      .upsert({ user_id: uid, ...prefs, updated_at: new Date().toISOString() });
    if (error) { input.checked = !v; prefs[k] = !v; toast('No se pudo guardar. Inténtalo de nuevo.', 'error'); return; }
    toast(v ? 'Activado' : 'Desactivado', 'success');
  }

  async function avisoPermiso() {
    const el = document.getElementById('np-permiso');
    if (!el) return;
    try {
      const P = window.Capacitor?.Plugins?.PushNotifications;
      if (P) {
        const { receive } = await P.checkPermissions();
        if (receive !== 'granted') {
          el.textContent = 'Tienes las notificaciones del móvil desactivadas para esta app. Actívalas en Ajustes → Notificaciones → {{name}}. Mientras tanto, todo te llegará a la campana 🔔.';
          el.style.display = '';
        }
      } else {
        el.textContent = 'Para recibir avisos en el móvil, instala la app de {{name}}. En la web los verás en la campana 🔔.';
        el.style.display = '';
      }
    } catch { /* sin plugin: nada que mostrar */ }
  }

  /* ───────── Cumpleaños hebreo ───────── */

  async function hebcal(params) {
    const r = await fetch('https://www.hebcal.com/converter?cfg=json&' + params);
    if (!r.ok) throw new Error('hebcal');
    return r.json();
  }
  const esBisiesto = (hy) => ((7 * hy + 1) % 19) < 7;

  /** Misma regla que el servidor (supabase/functions/_shared/tiempo.ts → cumpleHebreoEn). */
  async function fechaEsteAno(hm, hd, hy) {
    if (hm === 'Adar' && esBisiesto(hy)) hm = 'Adar II';
    if ((hm === 'Adar I' || hm === 'Adar II') && !esBisiesto(hy)) hm = 'Adar';
    let g = await hebcal(`h2g=1&hy=${hy}&hm=${encodeURIComponent(hm)}&hd=${hd}`);
    if (hd === 30) {
      const back = await hebcal(`g2h=1&gy=${g.gy}&gm=${g.gm}&gd=${g.gd}`);
      if (!(back.hm === hm && back.hd === 30)) {
        const g29 = await hebcal(`h2g=1&hy=${hy}&hm=${encodeURIComponent(hm)}&hd=29`);
        const d = new Date(Date.UTC(g29.gy, g29.gm - 1, g29.gd + 1));
        g = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
      }
    }
    return new Date(g.gy, g.gm - 1, g.gd);
  }

  async function pintarCumple(p) {
    const el = document.getElementById('ch-resumen');
    if (!el) return;
    document.getElementById('ch-puesta').value = p.nacimiento_puesta_sol || '';
    document.getElementById('ch-dia').value = p.cumple_hebreo_dia || '';
    document.getElementById('ch-mes').value = p.cumple_hebreo_mes || '';
    try {
      let hm, hd, origen;
      if (p.cumple_hebreo_dia && p.cumple_hebreo_mes) {
        hm = p.cumple_hebreo_mes; hd = p.cumple_hebreo_dia; origen = 'corregida a mano';
      } else if (p.fecha_nac) {
        const [y, m, d] = String(p.fecha_nac).slice(0, 10).split('-');
        const h = await hebcal(`g2h=1&gy=${+y}&gm=${+m}&gd=${+d}${p.nacimiento_puesta_sol === 'despues' ? '&gs=on' : ''}`);
        hm = h.hm; hd = h.hd;
        origen = p.nacimiento_puesta_sol === 'despues' ? 'calculada (nacido/a tras la puesta de sol)' : 'calculada';
      } else {
        el.textContent = 'No tenemos tu fecha de nacimiento. Puedes indicar tu fecha hebrea a mano.';
        return;
      }
      const hoy = new Date();
      const hHoy = await hebcal(`g2h=1&gy=${hoy.getFullYear()}&gm=${hoy.getMonth() + 1}&gd=${hoy.getDate()}`);
      let prox = await fechaEsteAno(hm, hd, hHoy.hy);
      const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      if (prox < hoy0) prox = await fechaEsteAno(hm, hd, hHoy.hy + 1);
      const cuando = prox.getTime() === hoy0.getTime() ? '¡es hoy! 🎉'
        : prox.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      el.innerHTML = `Tu fecha hebrea: <b>${hd} de ${MESES_ES[hm] || hm}</b> <span style="opacity:.7">(${origen})</span>.<br>`
        + `Tu próximo cumpleaños hebreo: <b>${cuando}</b>.`
        + (p.nacimiento_puesta_sol ? '' : '<br>Si naciste después de la puesta de sol, la fecha hebrea es un día más tarde: indícalo abajo.');
    } catch {
      el.textContent = 'No se pudo calcular ahora mismo. Vuelve a intentarlo más tarde.';
    }
  }

  async function guardarPerfil(campos) {
    const { error } = await getSupabase().from('profiles').update(campos).eq('id', uid);
    if (error) { toast('No se pudo guardar. Inténtalo de nuevo.', 'error'); return false; }
    toast('Guardado', 'success');
    return true;
  }

  async function cargarPerfil() {
    const { data } = await getSupabase().from('profiles')
      .select('fecha_nac, nacimiento_puesta_sol, cumple_hebreo_dia, cumple_hebreo_mes').eq('id', uid).single();
    return data || {};
  }

  function enlazarCumple() {
    document.getElementById('ch-puesta').onchange = async (e) => {
      if (await guardarPerfil({ nacimiento_puesta_sol: e.target.value || null })) pintarCumple(await cargarPerfil());
    };
    document.getElementById('ch-guardar').onclick = async () => {
      const dia = parseInt(document.getElementById('ch-dia').value, 10);
      const mes = document.getElementById('ch-mes').value;
      if (!(dia >= 1 && dia <= 30) || !mes) { toast('Indica el día (1-30) y el mes hebreo', 'warning'); return; }
      if (await guardarPerfil({ cumple_hebreo_dia: dia, cumple_hebreo_mes: mes })) pintarCumple(await cargarPerfil());
    };
    document.getElementById('ch-borrar').onclick = async () => {
      if (await guardarPerfil({ cumple_hebreo_dia: null, cumple_hebreo_mes: null })) pintarCumple(await cargarPerfil());
    };
  }

  /* ───────── Inicio ───────── */

  async function iniciar() {
    if (!document.getElementById('np-list')) return;
    const session = typeof getValidSession === 'function' ? await getValidSession().catch(() => null) : null;
    uid = session?.user?.id;
    const sb = typeof getSupabase === 'function' ? getSupabase() : null;
    if (!uid || !sb) return;

    const { data: fila, error } = await sb.from('notif_preferencias').select('*').eq('user_id', uid).maybeSingle();
    if (error) {   // migración aún no aplicada: no mostramos secciones a medias
      document.getElementById('notificaciones').style.display = 'none';
      document.getElementById('cumple-hebreo').style.display = 'none';
      return;
    }
    if (fila) PREFS.forEach(([k]) => { prefs[k] = !!fila[k]; });
    pintarPrefs();
    avisoPermiso();
    enlazarCumple();
    pintarCumple(await cargarPerfil());
    if (location.hash === '#notificaciones') document.getElementById('notificaciones').scrollIntoView({ behavior: 'smooth' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
