/**
 * Edge Function: notif-instant
 *
 * Avisos al momento. La llaman:
 *   · los disparadores de Postgres (cabecera x-notif-secret) con
 *     { tabla, op, record, old, extra, actor };
 *   · admin.html con el JWT de un admin:
 *       { accion: 'info_solicitada', user_id, mensaje }  → aviso al usuario pendiente
 *       { test: '<tipo>' }                               → ejemplo SOLO al admin que llama
 *
 * Desplegar con --no-verify-jwt (la autenticación se hace aquí).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type Aviso, type SB, adminLlamante, CORS, equipo, json, notificar, secretoValido, usuariosActivos,
} from '../_shared/notif.ts'
import { cuandoTexto, fechaCorta, horaCorta, hoyMadrid, instanteMadrid } from '../_shared/tiempo.ts'

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>
type Cambio = { tabla: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; record: Row | null; old: Row | null; extra?: Row; actor?: string | null }

const corta = (s: unknown, n = 90) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const nombreDe = (r: Row) => r?.titulo || r?.nombre || r?.name || r?.title || ''

async function nombreUsuario(sb: SB, id?: string | null): Promise<string> {
  if (!id) return 'Alguien'
  const { data } = await sb.from('profiles').select('name').eq('id', id).maybeSingle()
  return data?.name || 'Un miembro'
}

/** Aviso interno al equipo. */
async function alEquipo(sb: SB, tipo: string, clave: string, area: string | null, actor: string | null | undefined,
  titulo: string, cuerpo: string, url: string): Promise<Aviso> {
  const ids = await equipo(sb, area, actor)
  return { tipo, clave, url, esAdmin: true, destinatarios: ids.map(user_id => ({ user_id, titulo, cuerpo })) }
}

const aUno = (tipo: string, clave: string, user_id: string, titulo: string, cuerpo: string, url: string,
  extra: Partial<Aviso> = {}): Aviso => ({ tipo, clave, url, destinatarios: [{ user_id, titulo, cuerpo }], ...extra })

/* ─────────────────────────────────────────────
   Traducción "cambio en la BD" → avisos
───────────────────────────────────────────── */

async function avisosDe(sb: SB, c: Cambio): Promise<Aviso[]> {
  const r = c.record || {}
  const o = c.old || {}
  const out: Aviso[] = []

  switch (c.tabla) {
    case 'profiles': {
      if (c.op === 'INSERT' && (r.status || 'pending') === 'pending') {
        out.push(await alEquipo(sb, 'adm_registro', `adm_registro:${r.id}`, 'usuarios', c.actor,
          'Nueva solicitud de registro', `${r.name || r.email || 'Alguien'} quiere unirse a la Kehilá.`,
          'admin.html?tab=usuarios'))
      }
      if (c.op === 'UPDATE' && o.status === 'pending' && r.status === 'active') {
        out.push(aUno('cuenta_aprobada', `cuenta_aprobada:${r.id}`, r.id,
          '¡Bienvenido/a a la Kehilá! 🎉', 'Tu cuenta ha sido aprobada. Ya puedes usar toda la app.',
          'home.html', { permitirPendientes: true }))
      }
      if (c.op === 'DELETE') {
        out.push(await alEquipo(sb, 'adm_baja', `adm_baja:${o.id}`, 'usuarios', c.actor,
          'Baja de un miembro', `${o.name || o.email || 'Un miembro'} ha eliminado su cuenta.`,
          'admin.html?tab=usuarios'))
      }
      break
    }

    case 'mikve_reservas': {
      // Texto discreto: se ve en la pantalla de bloqueo. Sin nombres.
      const cuando = `${fechaCorta(r.fecha || o.fecha)} ${horaCorta(r.hora || o.hora)}`
      if (c.op === 'INSERT') {
        out.push(await alEquipo(sb, 'adm_mikve', `adm_mikve:${r.id}`, null, c.actor,
          'Nueva reserva', cuando, 'admin.html?tab=mikve'))
      } else if (c.op === 'UPDATE') {
        const cancelada = r.estado === 'cancelada' && o.estado !== 'cancelada'
        const movida = r.fecha !== o.fecha || r.hora !== o.hora
        if (cancelada || movida) {
          out.push(await alEquipo(sb, 'adm_mikve', `adm_mikve:${r.id}:${r.estado}:${r.fecha}:${r.hora}`, null, c.actor,
            cancelada ? 'Reserva cancelada' : 'Reserva modificada', cuando, 'admin.html?tab=mikve'))
          // Si lo cambió el equipo (no la propia persona), se le avisa a ella
          if (c.actor && c.actor !== r.usuario_id) {
            out.push(aUno('mikve_estado', `mikve_estado:${r.id}:${r.estado}:${r.fecha}:${r.hora}`, r.usuario_id,
              cancelada ? 'Tu cita ha sido cancelada' : 'Tu cita ha cambiado',
              cancelada ? `La cita del ${fechaCorta(r.fecha)} se ha cancelado.` : `Nueva hora: ${cuando}.`,
              'mikve.html'))
          }
        }
      }
      break
    }

    case 'citas': {
      if (c.op === 'INSERT') {
        out.push(await alEquipo(sb, 'adm_cita', `adm_cita:${r.id}`, 'rav', c.actor,
          'Nueva cita con el Rav', `${r.usuario_nombre || 'Un miembro'} — ${corta(r.tipo_cita || 'cita', 40)}`,
          'admin.html?tab=tora-comunidad'))
      } else if (c.op === 'UPDATE' && r.estado !== o.estado && c.actor !== r.usuario_id) {
        const confirmada = /confirm/i.test(r.estado || '')
        out.push(aUno('cita_confirmada', `cita_estado:${r.id}:${r.estado}`, r.usuario_id,
          confirmada ? 'Tu cita con el Rav está confirmada' : 'Novedades sobre tu cita con el Rav',
          confirmada ? 'La oficina te contactará con los detalles.' : `Estado: ${r.estado}.`,
          'citas-rabino.html'))
      }
      break
    }

    case 'preguntas_rav': {
      if (c.op === 'INSERT') {
        const quien = r.anonima ? 'Pregunta anónima' : (r.usuario_nombre || 'Un miembro')
        out.push(await alEquipo(sb, 'adm_pregunta_rav', `adm_pregunta_rav:${r.id}`, 'rav', c.actor,
          'Nueva pregunta al Rav', `${quien}: ${corta(r.pregunta, 80)}`, 'admin.html?tab=tora-comunidad'))
      } else if (c.op === 'UPDATE' && r.respuesta && r.respuesta !== o.respuesta && r.usuario_id) {
        out.push(aUno('rav_respondio', `rav_respondio:${r.id}`, r.usuario_id,
          'El Rav ha respondido tu pregunta', corta(r.pregunta, 80), `rav.html?id=${r.id}`))
      }
      break
    }

    case 'servicios_solicitudes': {
      if (c.op === 'INSERT') {
        out.push(await alEquipo(sb, 'adm_servicio', `adm_servicio:${r.id}`, 'servicios', c.actor,
          `Nueva solicitud: ${corta(r.tipo, 40)}`, r.usuario_nombre || 'Un miembro', 'admin.html?tab=svc-solicitudes'))
      }
      break
    }

    case 'donaciones': {
      if (c.op === 'INSERT') {
        out.push(await alEquipo(sb, 'adm_donacion', `adm_donacion:${r.id}`, null, null,
          `Nueva donación: ${r.cantidad} €`, `${r.usuario_nombre || 'Anónimo'} — ${corta(r.campana_nombre || 'Donativo', 60)}`,
          'admin.html?tab=donativos'))
      }
      break
    }

    case 'app_events': {
      if (c.op === 'INSERT' && r.event === 'donacion_click') {
        const imp = r.props?.importe ? `${r.props.importe} €` : 'un importe'
        out.push(await alEquipo(sb, 'adm_donacion_intento', `adm_donacion_intento:${r.id}`, null, null,
          `Intención de donar: ${imp}`,
          `${await nombreUsuario(sb, r.user_id)} pulsó "Donar" (${r.props?.area || 'general'}). Pago externo, sin confirmar.`,
          'admin.html?tab=donativos'))
      }
      break
    }

    case 'eventos': {
      if (c.op === 'INSERT' && r.fecha >= hoyMadrid()) {
        const miembros = await usuariosActivos(sb, r.subgrupo_id)
        out.push({
          tipo: 'evento_nuevo', clave: `evento_nuevo:${r.id}`, url: `eventos.html?id=${r.id}`,
          preferencia: 'eventos', comunitaria: true, caduca: instanteMadrid(r.fecha, r.hora).toISOString(),
          destinatarios: miembros.map(m => ({
            user_id: m.id, titulo: `Nuevo evento: ${corta(r.titulo, 60)}`,
            cuerpo: `Es ${cuandoTexto(r.fecha, r.hora)}. ¡Inscríbete desde la app!`,
          })),
        })
      }
      if (c.op === 'UPDATE' && r.fecha >= hoyMadrid()
          && (r.fecha !== o.fecha || r.hora !== o.hora || r.lugar !== o.lugar)) {
        const { data: ins } = await sb.from('inscripciones').select('usuario_id').eq('evento_id', String(r.id))
        out.push({
          tipo: 'evento_cambio', clave: `evento_cambio:${r.id}:${r.fecha}:${r.hora}:${r.lugar}`,
          url: `eventos.html?id=${r.id}`,
          destinatarios: (ins || []).map((i: Row) => ({
            user_id: i.usuario_id, titulo: `Cambio en ${corta(r.titulo, 60)}`,
            cuerpo: `Ahora es ${cuandoTexto(r.fecha, r.hora)}${r.lugar ? `, en ${corta(r.lugar, 40)}` : ''}.`,
          })),
        })
      }
      if (c.op === 'DELETE' && o.fecha >= hoyMadrid()) {
        const inscritos: string[] = c.extra?.inscritos || []
        out.push({
          tipo: 'evento_cambio', clave: `evento_cancelado:${o.id}`, url: 'eventos.html',
          destinatarios: inscritos.map(user_id => ({
            user_id, titulo: `Evento cancelado: ${corta(o.titulo, 60)}`,
            cuerpo: `Lo sentimos, el evento ${cuandoTexto(o.fecha, o.hora)} se ha cancelado.`,
          })),
        })
      }
      break
    }

    case 'inscripciones': {
      const evId = r.evento_id || o.evento_id
      const { data: ev } = await sb.from('eventos').select('id, titulo, fecha, hora, aforo').eq('id', evId).maybeSingle()
      if (!ev || !ev.aforo) break
      const { count } = await sb.from('inscripciones').select('id', { count: 'exact', head: true }).eq('evento_id', String(evId))
      if (c.op === 'INSERT' && (count || 0) >= ev.aforo) {
        out.push(await alEquipo(sb, 'adm_evento_lleno', `adm_evento_lleno:${evId}`, 'eventos', null,
          `Evento completo: ${corta(ev.titulo, 50)}`, `Ya hay ${count}/${ev.aforo} inscritos.`, 'admin.html?tab=eventos'))
      }
      if (c.op === 'DELETE' && (count || 0) < ev.aforo && ev.fecha >= hoyMadrid()) {
        // Primera persona de la lista de espera que aún no ha sido avisada
        const { data: sig } = await sb.from('lista_espera').select('id, usuario_id')
          .eq('evento_id', String(evId)).is('avisado_at', null).order('created_at').limit(1).maybeSingle()
        if (sig) {
          await sb.from('lista_espera').update({ avisado_at: new Date().toISOString() }).eq('id', sig.id)
          out.push(aUno('plaza_libre', `plaza_libre:${evId}:${sig.usuario_id}`, sig.usuario_id,
            '¡Se ha liberado una plaza!', `${corta(ev.titulo, 50)} — ${cuandoTexto(ev.fecha, ev.hora)}. Inscríbete antes de que vuele.`,
            `eventos.html?id=${evId}`, { caduca: instanteMadrid(ev.fecha, ev.hora).toISOString() }))
        }
      }
      break
    }

    case 'lista_espera': {
      if (c.op === 'INSERT') {
        const { data: ev } = await sb.from('eventos').select('titulo').eq('id', r.evento_id).maybeSingle()
        out.push(await alEquipo(sb, 'adm_evento_lleno', `adm_espera:${r.id}`, 'eventos', null,
          'Alguien en lista de espera', `${await nombreUsuario(sb, r.usuario_id)} — ${corta(ev?.titulo || 'evento', 50)}`,
          'admin.html?tab=eventos'))
      }
      break
    }

    case 'noticias': {
      if (c.op === 'INSERT') {
        const miembros = await usuariosActivos(sb)
        out.push({
          tipo: 'noticia_nueva', clave: `noticia_nueva:${r.id}`, url: `noticia.html?id=${r.id}`,
          preferencia: 'novedades', comunitaria: true,
          destinatarios: miembros.map(m => ({
            user_id: m.id, titulo: `📰 ${corta(r.titulo, 70)}`, cuerpo: corta(r.excerpt || r.contenido || 'Nueva noticia de la comunidad', 110),
          })),
        })
      }
      break
    }

    case 'shiurim': {
      if (c.op === 'INSERT') {
        const miembros = await usuariosActivos(sb)
        out.push({
          tipo: 'shiur_nuevo', clave: `shiur_nuevo:${r.id}`, url: `shiurim.html?id=${r.id}`,
          preferencia: 'tora', comunitaria: true,
          destinatarios: miembros.map(m => ({
            user_id: m.id, titulo: 'Nuevo shiur 📖', cuerpo: corta(nombreDe(r) || 'Ya disponible en la app', 110),
          })),
        })
      }
      break
    }

    case 'fotos': {
      if (c.op === 'INSERT') {
        const dia = hoyMadrid()
        // Un único aviso por día aunque se suban muchas fotos
        const miembros = await usuariosActivos(sb)
        out.push({
          tipo: 'galeria_nueva', clave: `galeria_nueva:${dia}`, url: 'galeria.html',
          preferencia: 'novedades', comunitaria: true,
          destinatarios: miembros.map(m => ({
            user_id: m.id, titulo: 'Nuevas fotos de la comunidad 📸', cuerpo: corta(r.album || r.titulo || 'Échales un vistazo en la galería.', 110),
          })),
        })
        const { data: autor } = await sb.from('profiles').select('role, name').eq('id', r.uploaded_by).maybeSingle()
        if (!autor || !['admin', 'super_admin'].includes(autor.role)) {
          out.push(await alEquipo(sb, 'adm_galeria', `adm_galeria:${dia}:${r.uploaded_by}`, 'noticias', r.uploaded_by,
            'Fotos nuevas subidas', `${autor?.name || 'Un miembro'} ha subido fotos${r.album ? ` a "${corta(r.album, 40)}"` : ''}.`,
            'admin.html?tab=noticias'))
        }
      }
      break
    }

    case 'negocios':
    case 'profesionales': {
      if (c.op === 'INSERT') {
        const que = c.tabla === 'negocios' ? 'negocio' : 'profesional'
        out.push(await alEquipo(sb, 'adm_moderacion', `adm_moderacion:${c.tabla}:${r.id}`, 'comunidad', c.actor,
          `Nuevo ${que} en Jconnect`, corta(nombreDe(r) || r.propietario || 'Pendiente de revisar', 90), 'admin.html?tab=comunidad'))
      }
      break
    }

    case 'inscripciones_voluntariado': {
      if (c.op === 'INSERT') {
        out.push(await alEquipo(sb, 'adm_voluntariado', `adm_voluntariado:${r.id}`, 'comunidad', c.actor,
          'Nueva inscripción de voluntariado', `${r.nombre || await nombreUsuario(sb, r.usuario_id || r.user_id)}`,
          'admin.html?tab=comunidad'))
      }
      break
    }

    case 'subgrupo_miembros': {
      if (c.op === 'INSERT' && c.actor !== r.user_id) {
        const { data: g } = await sb.from('subgrupos').select('nombre').eq('id', r.subgrupo_id).maybeSingle()
        out.push(aUno('sg_alta', `sg_alta:${r.subgrupo_id}:${r.user_id}`, r.user_id,
          'Te han añadido a un grupo', `Ya formas parte de "${corta(g?.nombre || 'un grupo', 50)}".`, 'home.html'))
      }
      break
    }

    case 'notificaciones': {
      if (c.op === 'INSERT' && r.subgrupo_id) {
        const miembros = await usuariosActivos(sb, r.subgrupo_id)
        out.push({
          tipo: 'sg_mensaje', clave: `sg_mensaje:${r.id}`, url: 'home.html',
          destinatarios: miembros.filter(m => m.id !== c.actor).map(m => ({
            user_id: m.id, titulo: corta(r.titulo, 70), cuerpo: corta(r.mensaje, 160),
          })),
        })
      }
      break
    }
  }
  return out.filter(a => a.destinatarios.length)
}

/* ─────────────────────────────────────────────
   Ráfagas de avisos internos: > 3 del mismo tipo en 10 min → a la cola,
   y notif-cron los manda agrupados ("5 nuevas reservas").
───────────────────────────────────────────── */

async function esRafaga(sb: SB, tipo: string): Promise<boolean> {
  const desde = new Date(Date.now() - 10 * 60000).toISOString()
  const { count } = await sb.from('notif_envios').select('id', { count: 'exact', head: true })
    .eq('tipo', tipo).gte('created_at', desde).not('clave', 'like', 'cola:%')
  return (count || 0) >= 3
}

/* ─────────────────────────────────────────────
   Ejemplos para "Probar en mi dispositivo"
───────────────────────────────────────────── */

const EJEMPLOS: Record<string, [string, string, string]> = {
  adm_registro: ['Nueva solicitud de registro', 'Sara Cohen quiere unirse a la Kehilá.', 'admin.html?tab=usuarios'],
  adm_mikve: ['Nueva reserva', '17 oct 20:30', 'admin.html?tab=mikve'],
  adm_cita: ['Nueva cita con el Rav', 'David Levy — Consulta personal', 'admin.html?tab=tora-comunidad'],
  adm_pregunta_rav: ['Nueva pregunta al Rav', 'Pregunta anónima: ¿Se puede…?', 'admin.html?tab=tora-comunidad'],
  adm_servicio: ['Nueva solicitud: Bar Mitzvah', 'Rajel Benarroch', 'admin.html?tab=svc-solicitudes'],
  adm_donacion: ['Nueva donación: 36 €', 'Ana M. — Campaña de Shabat', 'admin.html?tab=donativos'],
  adm_donacion_intento: ['Intención de donar: 72 €', 'Un miembro pulsó "Donar" (educativo). Pago externo, sin confirmar.', 'admin.html?tab=donativos'],
  adm_evento_lleno: ['Evento completo: Paella Parasha', 'Ya hay 40/40 inscritos.', 'admin.html?tab=eventos'],
  adm_moderacion: ['Nuevo negocio en Jconnect', 'Panadería Kosher Gràcia', 'admin.html?tab=comunidad'],
  adm_voluntariado: ['Nueva inscripción de voluntariado', 'Ester Azulay', 'admin.html?tab=comunidad'],
  adm_baja: ['Baja de un miembro', 'Un miembro ha eliminado su cuenta.', 'admin.html?tab=usuarios'],
  adm_galeria: ['Fotos nuevas subidas', 'Un miembro ha subido fotos.', 'admin.html?tab=noticias'],
  cuenta_aprobada: ['¡Bienvenido/a a la Kehilá! 🎉', 'Tu cuenta ha sido aprobada. Ya puedes usar toda la app.', 'home.html'],
  info_solicitada: ['Necesitamos un dato más', 'Para aprobar tu registro falta tu documento. Revisa tu email.', 'home.html'],
  rav_respondio: ['El Rav ha respondido tu pregunta', '¿Se puede encender la luz en Shabat si…?', 'rav.html'],
  cita_confirmada: ['Tu cita con el Rav está confirmada', 'La oficina te contactará con los detalles.', 'citas-rabino.html'],
  mikve_estado: ['Tu cita ha cambiado', 'Nueva hora: 17 oct 21:00.', 'mikve.html'],
  evento_nuevo: ['Nuevo evento: Paella Parasha', 'Es el jueves 22 de octubre a las 20:30. ¡Inscríbete desde la app!', 'eventos.html'],
  evento_cambio: ['Cambio en Paella Parasha', 'Ahora es el jueves 22 de octubre a las 21:00.', 'eventos.html'],
  plaza_libre: ['¡Se ha liberado una plaza!', 'Paella Parasha — el jueves 22 de octubre. Inscríbete antes de que vuele.', 'eventos.html'],
  noticia_nueva: ['📰 Nueva noticia de la comunidad', 'Resumen de la noticia…', 'noticias.html'],
  shiur_nuevo: ['Nuevo shiur 📖', 'La parashá de la semana con el Rav', 'shiurim.html'],
  galeria_nueva: ['Nuevas fotos de la comunidad 📸', 'Échales un vistazo en la galería.', 'galeria.html'],
  sg_alta: ['Te han añadido a un grupo', 'Ya formas parte de "Jóvenes".', 'home.html'],
  sg_mensaje: ['Mensaje para tu grupo', 'Este domingo quedamos a las 11:00 en el centro comunitario.', 'home.html'],
}

/* ─────────────────────────────────────────────
   HANDLER
───────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const body = await req.json().catch(() => ({}))

    /* ── Llamadas desde el panel de admin ── */
    if (!req.headers.get('x-notif-secret')) {
      const admin = await adminLlamante(sb, req)
      if (!admin) return json({ error: 'No autorizado' }, 401)

      if (body.test) {
        const ej = EJEMPLOS[body.test]
        if (!ej) return json({ error: `Sin ejemplo para ${body.test}` }, 400)
        const res = await notificar(sb, aUno(body.test, `test:${body.test}`, admin, ej[0], ej[1], ej[2]), { soloUsuario: admin })
        return json(res)
      }

      if (body.accion === 'info_solicitada' && body.user_id) {
        const res = await notificar(sb, aUno('info_solicitada', `info_solicitada:${body.user_id}:${Date.now()}`, body.user_id,
          'Necesitamos un dato más', corta(body.mensaje || 'Para aprobar tu registro nos falta información. Revisa tu email.', 150),
          'home.html', { permitirPendientes: true }))
        return json(res)
      }
      return json({ error: 'Acción desconocida' }, 400)
    }

    /* ── Disparadores de la base de datos ── */
    if (!(await secretoValido(sb, req))) return json({ error: 'No autorizado' }, 401)

    const avisos = await avisosDe(sb, body as Cambio)
    const resultados = []
    for (const a of avisos) {
      if (a.esAdmin && await esRafaga(sb, a.tipo)) {
        await sb.from('notif_cola').insert({ tipo: a.tipo, payload: { ...a, agrupar: true },
          enviar_desde: new Date(Date.now() + 10 * 60000).toISOString() })
        resultados.push({ tipo: a.tipo, estado: 'agrupado' })
        continue
      }
      resultados.push(await notificar(sb, a))
    }
    return json({ resultados })
  } catch (err) {
    console.error('notif-instant', err)
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
