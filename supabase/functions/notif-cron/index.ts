/**
 * Edge Function: notif-cron
 *
 * La ejecuta pg_cron cada 15 minutos (cabecera x-notif-secret). En cada pasada:
 *   1. Si es Shabat / Yom Tov en Barcelona → no hace nada.
 *   2. Vacía la cola (avisos retenidos por Shabat, horario de silencio o ráfagas).
 *   3. Calcula los avisos programados que tocan ahora. Cada generador decide si
 *      es su momento; el anti-duplicados (notif_envios) garantiza que nada se
 *      envía dos veces aunque el cron pase cada 15 min.
 *
 * Desde admin.html (JWT de admin):
 *   { dry_run: true [, forzar: true] }  → qué se enviaría ahora (sin enviar nada)
 *   { test: '<tipo>' }                   → un ejemplo real SOLO al admin que llama
 *
 * Desplegar con --no-verify-jwt.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type Aviso, type Destino, type SB, adminLlamante, CORS, equipo, json, notificar, secretoValido, usuariosActivos,
} from '../_shared/notif.ts'
import {
  aHebreo, cuandoTexto, cumpleHebreoEn, esShabatOYomTov, fechaCorta, hebcal, horaCorta, horaDeIso,
  hoyMadrid, instanteMadrid, madrid, sumarDias,
} from '../_shared/tiempo.ts'

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>
type Ctx = { sb: SB; now: Date; hoy: string; forzar: boolean; dryRun: boolean }
type Generador = (ctx: Ctx) => Promise<Aviso[]>

const H = 3600_000
const corta = (s: unknown, n = 90) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const primerNombre = (n?: string) => (n || '').trim().split(/\s+/)[0] || ''

/** ¿Ya son (en Barcelona) más de las hh:mm y menos de las hasta? */
function entre(ctx: Ctx, desde: string, hasta = '23:59'): boolean {
  if (ctx.forzar) return true
  const l = madrid(ctx.now)
  const min = l.getUTCHours() * 60 + l.getUTCMinutes()
  const [a, b] = desde.split(':').map(Number), [c, d] = hasta.split(':').map(Number)
  return min >= a * 60 + b && min < c * 60 + d
}

/** Generadores pesados: una sola vez al día. */
async function unaVezAlDia(ctx: Ctx, nombre: string): Promise<boolean> {
  if (ctx.forzar || ctx.dryRun) return true
  const { error } = await ctx.sb.from('notif_envios').insert({ clave: `cron:${nombre}:${ctx.hoy}`, tipo: 'cron' })
  return !error
}

async function hebcalCache(ctx: Ctx, dias = 4) {
  return hebcal(sumarDias(ctx.hoy, -1), sumarDias(ctx.hoy, dias))
}

/* ═════════════════════════════════════════════
   EVENTOS
═════════════════════════════════════════════ */

async function eventosProximos(ctx: Ctx, dias: number): Promise<Row[]> {
  const { data } = await ctx.sb.from('eventos').select('id, titulo, fecha, hora, lugar, subgrupo_id')
    .gte('fecha', ctx.hoy).lte('fecha', sumarDias(ctx.hoy, dias)).order('fecha')
  return (data || []).map((e: Row) => ({ ...e, inicio: instanteMadrid(e.fecha, e.hora) }))
    .filter((e: Row) => e.inicio > ctx.now)
}

async function inscritosDe(ctx: Ctx, eventoId: unknown): Promise<Set<string>> {
  const { data } = await ctx.sb.from('inscripciones').select('usuario_id').eq('evento_id', String(eventoId))
  return new Set((data || []).map((r: Row) => r.usuario_id))
}

/** 48 h antes: a todos (o al subgrupo del evento). Inscritos y no inscritos con texto distinto. */
const evento48h: Generador = async (ctx) => {
  const out: Aviso[] = []
  for (const ev of await eventosProximos(ctx, 3)) {
    const faltan = ev.inicio.getTime() - ctx.now.getTime()
    if (!ctx.forzar && (faltan > 48 * H || faltan <= 36 * H)) continue
    const ins = await inscritosDe(ctx, ev.id)
    const miembros = await usuariosActivos(ctx.sb, ev.subgrupo_id)
    const url = `eventos.html?id=${ev.id}`
    const caduca = ev.inicio.toISOString()
    out.push({
      tipo: 'evento_48h', clave: `evento_48h:ins:${ev.id}`, url, caduca,
      destinatarios: miembros.filter(m => ins.has(m.id)).map(m => ({
        user_id: m.id, titulo: `Te esperamos: ${corta(ev.titulo, 60)}`,
        cuerpo: `Recuerda que es ${cuandoTexto(ev.fecha, ev.hora)}. ¡Nos vemos!`,
      })),
    })
    out.push({
      tipo: 'evento_48h', clave: `evento_48h:resto:${ev.id}`, url, caduca,
      preferencia: 'eventos', comunitaria: true,
      destinatarios: miembros.filter(m => !ins.has(m.id)).map(m => ({
        user_id: m.id, titulo: `¿Te apuntas? ${corta(ev.titulo, 60)}`,
        cuerpo: `Es ${cuandoTexto(ev.fecha, ev.hora)}. Inscríbete desde la app.`,
      })),
    })
  }
  return out
}

/** El mismo día, ~3 h antes, solo a inscritos (nunca antes de las 9:00). */
const eventoHoy: Generador = async (ctx) => {
  const out: Aviso[] = []
  for (const ev of await eventosProximos(ctx, 1)) {
    const faltan = ev.inicio.getTime() - ctx.now.getTime()
    if (!ctx.forzar && (faltan > 3 * H || !entre(ctx, '09:00'))) continue
    const ins = await inscritosDe(ctx, ev.id)
    out.push({
      tipo: 'evento_hoy', clave: `evento_hoy:${ev.id}`, url: `eventos.html?id=${ev.id}`,
      caduca: ev.inicio.toISOString(),
      destinatarios: [...ins].map(user_id => ({
        user_id, titulo: `Hoy: ${corta(ev.titulo, 60)}`,
        cuerpo: `A las ${horaCorta(ev.hora)}${ev.lugar ? ` en ${corta(ev.lugar, 40)}` : ''}. ¡Te esperamos!`,
      })),
    })
  }
  return out
}

/* ═════════════════════════════════════════════
   CUMPLEAÑOS
═════════════════════════════════════════════ */

/** ¿Hoy es el cumpleaños de alguien nacido en `fecha`? (29-feb → 28-feb en años no bisiestos) */
function cumpleHoy(fecha: string, hoy: string): boolean {
  const [, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [y, hm, hd] = hoy.split('-').map(Number)
  if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return hm === 2 && hd === 28
  return m === hm && d === hd
}

const cumple: Generador = async (ctx) => {
  if (!entre(ctx, '09:00', '20:00')) return []
  const { data } = await ctx.sb.from('profiles').select('id, name, fecha_nac, status')
    .not('fecha_nac', 'is', null)
  const hoyCumplen = (data || []).filter((p: Row) => (p.status || 'active') === 'active'
    && (ctx.forzar || cumpleHoy(p.fecha_nac, ctx.hoy)))
  return hoyCumplen.map((p: Row) => ({
    tipo: 'cumple', clave: `cumple:${p.id}:${ctx.hoy.slice(0, 4)}`, url: 'home.html', preferencia: 'cumple' as const,
    destinatarios: [{
      user_id: p.id, titulo: `¡Feliz cumpleaños${primerNombre(p.name) ? `, ${primerNombre(p.name)}` : ''}! 🎂`,
      cuerpo: 'Toda la comunidad de Jabad Barcelona te desea un año lleno de brajot.',
    }],
  }))
}

const cumpleHijo: Generador = async (ctx) => {
  if (!entre(ctx, '09:00', '20:00')) return []
  const { data } = await ctx.sb.from('children').select('id, nombre, fecha_nac, parent_id').not('fecha_nac', 'is', null)
  return (data || []).filter((h: Row) => h.parent_id && (ctx.forzar || cumpleHoy(h.fecha_nac, ctx.hoy))).map((h: Row) => {
    const edad = Number(ctx.hoy.slice(0, 4)) - Number(h.fecha_nac.slice(0, 4))
    return {
      tipo: 'cumple_hijo', clave: `cumple_hijo:${h.id}:${ctx.hoy.slice(0, 4)}`, url: 'perfil.html',
      preferencia: 'cumple' as const,
      destinatarios: [{
        user_id: h.parent_id, titulo: `¡Hoy ${primerNombre(h.nombre) || 'tu hijo/a'} cumple ${edad} años! 🎂`,
        cuerpo: 'Mazal tov de parte de toda la comunidad de Jabad Barcelona.',
      }],
    }
  })
}

/**
 * Cumpleaños hebreo. Fuente de verdad, por orden:
 *   1. corrección manual del perfil (cumple_hebreo_dia + cumple_hebreo_mes);
 *   2. fecha de nacimiento + "¿antes o después de la puesta de sol?".
 * Reglas de Adar / día 30 en tiempo.ts → cumpleHebreoEn().
 */
const cumpleHebreo: Generador = async (ctx) => {
  if (!entre(ctx, '09:00', '20:00') || !(await unaVezAlDia(ctx, 'cumple_hebreo'))) return []
  const { data } = await ctx.sb.from('profiles')
    .select('id, name, status, fecha_nac, nacimiento_puesta_sol, cumple_hebreo_dia, cumple_hebreo_mes')
  const hoyHeb = await aHebreo(ctx.hoy)
  const out: Aviso[] = []
  let perfiles = (data || []).filter((p: Row) => (p.status || 'active') === 'active'
    && (p.fecha_nac || (p.cumple_hebreo_dia && p.cumple_hebreo_mes)))
  if (ctx.forzar) perfiles = perfiles.slice(0, 3)   // prueba/simulación: no hace falta calcularlos todos

  for (let i = 0; i < perfiles.length; i += 8) {
    await Promise.all(perfiles.slice(i, i + 8).map(async (p: Row) => {
      try {
        const nac = p.cumple_hebreo_dia && p.cumple_hebreo_mes
          ? { hm: p.cumple_hebreo_mes, hd: p.cumple_hebreo_dia }
          : await aHebreo(p.fecha_nac, p.nacimiento_puesta_sol === 'despues')
        const fecha = await cumpleHebreoEn(nac, hoyHeb.hy)
        if (!ctx.forzar && fecha !== ctx.hoy) return
        out.push({
          tipo: 'cumple_hebreo', clave: `cumple_hebreo:${p.id}:${hoyHeb.hy}`, url: 'perfil.html',
          preferencia: 'cumple',
          destinatarios: [{
            user_id: p.id, titulo: 'Hoy es tu cumpleaños hebreo ✡️',
            cuerpo: `${nac.hd} de ${nac.hm}. Un día especial para dar tzedaká y tomar una buena resolución.`,
          }],
        })
      } catch (e) { console.warn('cumple_hebreo', p.id, e) }
    }))
  }
  return out
}

/* ═════════════════════════════════════════════
   MIKVE (texto discreto: se ve en la pantalla de bloqueo)
═════════════════════════════════════════════ */

const mikveRecordatorio: Generador = async (ctx) => {
  const { data } = await ctx.sb.from('mikve_reservas').select('id, usuario_id, fecha, hora, estado, servicio')
    .gte('fecha', ctx.hoy).lte('fecha', sumarDias(ctx.hoy, 1)).neq('estado', 'cancelada')
  const out: Aviso[] = []
  for (const r of data || []) {
    const inicio = instanteMadrid(r.fecha, r.hora)
    if (inicio <= ctx.now && !ctx.forzar) continue
    const caduca = inicio.toISOString()
    // Tevilat kelim: no es discreto, y les recordamos la berajá
    const kelim = String(r.servicio || '').startsWith('Tevilat Kelim')
    const titulo = kelim ? 'Tevilat kelim: tu cita' : 'Recordatorio de tu cita'
    const extra = kelim ? ` Recuerda la berajá: «…asher kidshanu bemitzvotav vetzivanu al tevilat kelim». Quita antes las etiquetas.` : ''
    // Víspera a partir de las 18:00
    if (ctx.forzar || (r.fecha === sumarDias(ctx.hoy, 1) && entre(ctx, '18:00', '21:30'))) {
      out.push({
        tipo: 'mikve_recordatorio', clave: `mikve_rec_dia:${r.id}`, url: 'mikve.html', caduca,
        destinatarios: [{ user_id: r.usuario_id, titulo, cuerpo: `Mañana a las ${horaCorta(r.hora)}.${extra}` }],
      })
    }
    // ~3 h antes
    const faltan = inicio.getTime() - ctx.now.getTime()
    if (ctx.forzar || (r.fecha === ctx.hoy && faltan <= 3 * H && faltan > 0)) {
      out.push({
        tipo: 'mikve_recordatorio', clave: `mikve_rec_3h:${r.id}`, url: 'mikve.html', caduca,
        destinatarios: [{ user_id: r.usuario_id, titulo, cuerpo: `Hoy a las ${horaCorta(r.hora)}.${extra}` }],
      })
    }
    if (ctx.forzar) break
  }
  return out
}

/* ═════════════════════════════════════════════
   CALENDARIO JUDÍO (Hebcal, Barcelona)
═════════════════════════════════════════════ */

async function aTodos(sb: SB, d: (id: string, name: string) => Omit<Destino, 'user_id'>): Promise<Destino[]> {
  return (await usuariosActivos(sb)).map(m => ({ user_id: m.id, ...d(m.id, m.name) }))
}

/** Viernes / víspera de Yom Tov: ~1 h antes del encendido de velas. */
const shabat: Generador = async (ctx) => {
  const items = await hebcalCache(ctx, 2)
  const velas = items.find(i => i.category === 'candles' && i.date.slice(0, 10) === ctx.hoy)
  if (!velas && !ctx.forzar) return []
  const vela = velas || items.find(i => i.category === 'candles')
  if (!vela) return []
  const t = new Date(vela.date).getTime()
  if (!ctx.forzar && (ctx.now.getTime() < t - 75 * 60000 || ctx.now.getTime() >= t - 20 * 60000)) return []

  const manana = sumarDias(vela.date.slice(0, 10), 1)
  const jag = items.find(i => i.category === 'holiday' && i.yomtov && i.date.slice(0, 10) === manana)
  const parasha = items.find(i => i.category === 'parashat' && i.date.slice(0, 10) === manana)
  const esViernes = madrid(new Date(vela.date)).getUTCDay() === 5
  const titulo = jag && !esViernes ? `Jag Sameaj — ${jag.title} 🕯️` : 'Shabat Shalom 🕯️'
  const cuerpo = `Encendido de velas hoy a las ${horaDeIso(vela.date)}.${parasha ? ` ${parasha.title}.` : ''}`
  return [{
    tipo: 'shabat', clave: `shabat:${vela.date.slice(0, 10)}`, url: 'calendario.html', preferencia: 'shabat', comunitaria: true,
    caduca: vela.date, destinatarios: await aTodos(ctx.sb, () => ({ titulo, cuerpo })),
  }]
}

/** Festividades: aviso 2 días antes (a partir de las 10:00). */
const jag: Generador = async (ctx) => {
  if (!entre(ctx, '10:00', '21:00')) return []
  const items = await hebcal(ctx.hoy, sumarDias(ctx.hoy, ctx.forzar ? 60 : 3))
  const objetivo = sumarDias(ctx.hoy, 2)
  const fiestas = items.filter(i => i.category === 'holiday' && i.subcat === 'major'
    && !/^Erev/i.test(i.title_orig || i.title) && !/^Chanukah:/i.test(i.title_orig || '')
    && (ctx.forzar || i.date.slice(0, 10) === objetivo))
  const out: Aviso[] = []
  const vistos = new Set<string>()
  for (const f of fiestas) {
    const base = f.title.replace(/\s*\(.*\)$/, '').replace(/\s+(I{1,3}|IV|V|VI{0,3}|\d{4})$/, '').trim()
    if (vistos.has(base)) continue
    vistos.add(base)
    // Pésaj II, Sukot III…: misma clave que el primer día → el anti-duplicados lo descarta
    const fecha = f.date.slice(0, 10)
    out.push({
      tipo: 'jag', clave: `jag:${base}:${fecha.slice(0, 4)}`, url: 'calendario.html', preferencia: 'jaguim', comunitaria: true,
      destinatarios: await aTodos(ctx.sb, () => ({
        titulo: `Se acerca ${base} ✡️`, cuerpo: `Empieza ${cuandoTexto(fecha)}. Consulta horarios y actividades en la app.`,
      })),
    })
    if (ctx.forzar) break
  }
  return out
}

/** Ayunos: la víspera, a partir de las 13:00, con la hora de inicio y fin. */
const ayuno: Generador = async (ctx) => {
  if (!entre(ctx, '13:00', '21:00')) return []
  const manana = sumarDias(ctx.hoy, 1)
  const items = await hebcal(ctx.hoy, sumarDias(ctx.hoy, ctx.forzar ? 120 : 2))
  const ayunos = items.filter(i => i.category === 'holiday' && i.subcat === 'fast'
    && (ctx.forzar || i.date.slice(0, 10) === manana))
  const out: Aviso[] = []
  for (const a of ayunos.slice(0, 1)) {
    const dia = a.date.slice(0, 10)
    const empieza = items.find(i => i.category === 'zmanim' && i.title_orig === 'Fast begins'
      && (i.date.slice(0, 10) === dia || i.date.slice(0, 10) === sumarDias(dia, -1)))
    const acaba = items.find(i => i.category === 'zmanim' && i.title_orig === 'Fast ends' && i.date.slice(0, 10) === dia)
    const partes = [
      empieza ? `Empieza ${empieza.date.slice(0, 10) === dia ? 'mañana' : 'hoy'} a las ${horaDeIso(empieza.date)}` : '',
      acaba ? `termina mañana a las ${horaDeIso(acaba.date)}` : '',
    ].filter(Boolean)
    out.push({
      tipo: 'ayuno', clave: `ayuno:${dia}`, url: 'calendario.html', preferencia: 'jaguim', comunitaria: true,
      destinatarios: await aTodos(ctx.sb, () => ({
        titulo: `Mañana: ${a.title}`, cuerpo: partes.length ? `${partes.join(' y ')}.` : 'Día de ayuno.',
      })),
    })
  }
  return out
}

/** Rosh Jodesh: la víspera, a partir de las 19:00. */
const roshJodesh: Generador = async (ctx) => {
  if (!entre(ctx, '19:00', '21:30')) return []
  const manana = sumarDias(ctx.hoy, 1)
  const items = await hebcal(ctx.hoy, sumarDias(ctx.hoy, ctx.forzar ? 40 : 2))
  const rj = items.find(i => i.category === 'roshchodesh' && (ctx.forzar || i.date.slice(0, 10) === manana))
  if (!rj) return []
  return [{
    tipo: 'rosh_jodesh', clave: `rosh_jodesh:${rj.title}:${rj.date.slice(0, 7)}`, url: 'calendario.html',
    preferencia: 'jaguim', comunitaria: true,
    destinatarios: await aTodos(ctx.sb, () => ({ titulo: `Mañana es ${rj.title} 🌙`, cuerpo: 'Jodesh tov a toda la comunidad.' })),
  }]
}

/** Janucá: cada tarde, ~1 h antes de encender (o a las 13:00 el viernes). */
const janucaNoche: Generador = async (ctx) => {
  const items = await hebcal(ctx.hoy, sumarDias(ctx.hoy, ctx.forzar ? 120 : 1))
  const noche = items.find(i => /^Chanukah: \d/.test(i.title_orig || '') && (ctx.forzar || i.date.slice(0, 10) === ctx.hoy))
  if (!noche) return []
  const n = Number((noche.title_orig || '').match(/\d/)?.[0] || 0)
  const t = new Date(noche.date).getTime()
  if (!ctx.forzar && (ctx.now.getTime() < t - 75 * 60000 || ctx.now.getTime() >= t)) return []
  return [{
    tipo: 'janucá', clave: `janucá:${noche.date.slice(0, 10)}`, url: 'calendario.html', preferencia: 'jaguim',
    caduca: new Date(t + 3 * H).toISOString(),
    destinatarios: await aTodos(ctx.sb, () => ({
      titulo: `Janucá: esta noche ${n} ${n === 1 ? 'vela' : 'velas'} 🕎`,
      cuerpo: `Encendido a partir de las ${horaDeIso(noche.date)}. ¡Jag Janucá Sameaj!`,
    })),
  }]
}

/** Cuenta del Omer: cada noche a las 21:00, solo a quien la activó. */
const omer: Generador = async (ctx) => {
  if (!entre(ctx, '21:00', '23:30')) return []
  const manana = sumarDias(ctx.hoy, 1)
  const items = await hebcal(ctx.hoy, sumarDias(ctx.hoy, ctx.forzar ? 200 : 2))
  const dia = items.find(i => i.category === 'omer' && (ctx.forzar || i.date.slice(0, 10) === manana))
  if (!dia) return []
  return [{
    tipo: 'omer', clave: `omer:${dia.date.slice(0, 10)}`, url: 'calendario.html', preferencia: 'omer',
    caduca: instanteMadrid(manana, '06:00').toISOString(),
    destinatarios: await aTodos(ctx.sb, () => ({ titulo: 'Cuenta del Omer', cuerpo: `Esta noche: ${dia.title}.` })),
  }]
}

/* ═════════════════════════════════════════════
   RESÚMENES Y REACTIVACIÓN
═════════════════════════════════════════════ */

/** Domingo a las 10:00: eventos de la semana. */
const resumenSemanal: Generador = async (ctx) => {
  if (!ctx.forzar && (madrid(ctx.now).getUTCDay() !== 0 || !entre(ctx, '10:00', '20:00'))) return []
  const evs = await eventosProximos(ctx, 7)
  if (!evs.length) return []
  const lista = evs.slice(0, 3).map(e => `${corta(e.titulo, 28)} (${fechaCorta(e.fecha)})`).join(', ')
  return [{
    tipo: 'resumen_semanal', clave: `resumen_semanal:${ctx.hoy}`, url: 'eventos.html', preferencia: 'resumen', comunitaria: true,
    destinatarios: await aTodos(ctx.sb, () => ({
      titulo: `Esta semana en la Kehilá: ${evs.length} ${evs.length === 1 ? 'evento' : 'eventos'}`,
      cuerpo: `${lista}${evs.length > 3 ? '…' : ''}`,
    })),
  }]
}

/** 30 días sin abrir la app → "Te echamos de menos" (máx. 1 vez cada 60 días). */
const reactivacion: Generador = async (ctx) => {
  if (!entre(ctx, '11:00', '19:00') || !(await unaVezAlDia(ctx, 'reactivacion'))) return []
  const hace30 = new Date(ctx.now.getTime() - 30 * 24 * H).toISOString()
  const hace60 = new Date(ctx.now.getTime() - 60 * 24 * H).toISOString()

  // Solo usuarios con la app instalada y con cuenta de más de 30 días
  const { data: tokens } = await ctx.sb.from('push_tokens').select('user_id')
  const conApp = new Set((tokens || []).map((t: Row) => t.user_id))
  const { data: perfiles } = await ctx.sb.from('profiles').select('id, name, status, created_at').lt('created_at', hace30)
  const candidatos = (perfiles || []).filter((p: Row) => conApp.has(p.id) && (p.status || 'active') === 'active')
  if (!candidatos.length) return []

  const ids = candidatos.map((p: Row) => p.id)
  const { data: vistos } = await ctx.sb.from('page_views').select('user_id').in('user_id', ids).gte('created_at', hace30)
  const { data: yaAvisados } = await ctx.sb.from('notif_buzon').select('user_id')
    .in('user_id', ids).eq('tipo', 'reactivacion').gte('created_at', hace60)
  const activos = new Set([...(vistos || []), ...(yaAvisados || [])].map((r: Row) => r.user_id))
  const evs = await eventosProximos(ctx, 14)
  const gancho = evs[0] ? `Próximo evento: ${corta(evs[0].titulo, 40)} (${fechaCorta(evs[0].fecha)}).` : 'Mira lo que está pasando en la comunidad.'

  return [{
    tipo: 'reactivacion', clave: `reactivacion:${ctx.hoy}`, url: 'home.html', comunitaria: true,
    destinatarios: candidatos.filter((p: Row) => ctx.forzar || !activos.has(p.id)).map((p: Row) => ({
      user_id: p.id, titulo: `Te echamos de menos${primerNombre(p.name) ? `, ${primerNombre(p.name)}` : ''} 💙`, cuerpo: gancho,
    })),
  }]
}

/* ═════════════════════════════════════════════
   AVISOS AL EQUIPO
═════════════════════════════════════════════ */

/** 20:00: lo que lleva más de 48 h sin atender + inscripciones del día. */
const admResumenDiario: Generador = async (ctx) => {
  if (!entre(ctx, '20:00', '21:30')) return []
  const hace48 = new Date(ctx.now.getTime() - 48 * H).toISOString()
  const inicioHoy = instanteMadrid(ctx.hoy, '00:00').toISOString()
  const contar = async (q: Promise<{ count: number | null }>) => (await q).count || 0
  const sb = ctx.sb
  const [registros, preguntas, citas, inscHoy] = await Promise.all([
    contar(sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('created_at', hace48)),
    contar(sb.from('preguntas_rav').select('id', { count: 'exact', head: true }).is('respuesta', null).lt('created_at', hace48)),
    contar(sb.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').lt('created_at', hace48)),
    contar(sb.from('inscripciones').select('id', { count: 'exact', head: true }).gte('created_at', inicioHoy)),
  ])
  const partes = [
    registros && `${registros} ${registros === 1 ? 'registro' : 'registros'}`,
    preguntas && `${preguntas} ${preguntas === 1 ? 'pregunta' : 'preguntas'} al Rav`,
    citas && `${citas} ${citas === 1 ? 'cita' : 'citas'}`,
  ].filter(Boolean)
  if (!partes.length && !inscHoy && !ctx.forzar) return []
  const cuerpo = [
    partes.length ? `Pendiente +48 h: ${partes.join(', ')}.` : 'Nada pendiente de más de 48 h.',
    inscHoy ? `Hoy: ${inscHoy} ${inscHoy === 1 ? 'inscripción' : 'inscripciones'}.` : '',
  ].filter(Boolean).join(' ')
  const ids = await equipo(sb, null)
  return [{
    tipo: 'adm_resumen_diario', clave: `adm_resumen_diario:${ctx.hoy}`, url: 'admin.html', esAdmin: true,
    destinatarios: ids.map(user_id => ({ user_id, titulo: 'Resumen del día 📋', cuerpo })),
  }]
}

/** 9:00: quién cumple años hoy (para felicitar en persona). */
const admCumpleEquipo: Generador = async (ctx) => {
  if (!entre(ctx, '09:00', '20:00')) return []
  const { data } = await ctx.sb.from('profiles').select('name, fecha_nac, status').not('fecha_nac', 'is', null)
  const hoy = (data || []).filter((p: Row) => (p.status || 'active') === 'active' && cumpleHoy(p.fecha_nac, ctx.hoy))
  if (!hoy.length && !ctx.forzar) return []
  const nombres = hoy.map((p: Row) => p.name).filter(Boolean)
  const ids = await equipo(ctx.sb, null)
  return [{
    tipo: 'adm_cumple_equipo', clave: `adm_cumple_equipo:${ctx.hoy}`, url: 'admin.html?tab=usuarios', esAdmin: true,
    destinatarios: ids.map(user_id => ({
      user_id, titulo: `Hoy cumplen años: ${nombres.length || 'nadie'} 🎂`,
      cuerpo: nombres.length ? corta(nombres.join(', '), 150) : 'Ejemplo de aviso de cumpleaños del día.',
    })),
  }]
}

/** Errores: muchos error_js en la última hora, o un envío con > 30 % de fallos. */
const admErrores: Generador = async (ctx) => {
  const haceHora = new Date(ctx.now.getTime() - H).toISOString()
  const { count: errores } = await ctx.sb.from('app_events').select('id', { count: 'exact', head: true })
    .eq('event', 'error_js').gte('created_at', haceHora)
  const { data: envios } = await ctx.sb.from('notif_envios').select('tipo, total, failed')
    .gte('created_at', haceHora).gte('total', 10)
  const malos = (envios || []).filter((e: Row) => e.failed / e.total > 0.3)
  const partes = [
    (errores || 0) > 20 && `${errores} errores en la app en la última hora`,
    malos.length && `fallos de envío en: ${malos.map((m: Row) => m.tipo).join(', ')}`,
  ].filter(Boolean)
  if (!partes.length && !ctx.forzar) return []
  const hora = madrid(ctx.now).toISOString().slice(0, 13)
  const ids = await equipo(ctx.sb, null)
  return [{
    tipo: 'adm_errores', clave: `adm_errores:${hora}`, url: 'admin.html?tab=analytics', esAdmin: true,
    destinatarios: ids.map(user_id => ({
      user_id, titulo: '⚠️ Problema técnico en la app', cuerpo: partes.length ? `${partes.join('; ')}.` : 'Ejemplo de alerta técnica.',
    })),
  }]
}

const GENERADORES: Record<string, Generador> = {
  evento_48h: evento48h, evento_hoy: eventoHoy,
  cumple, cumple_hijo: cumpleHijo, cumple_hebreo: cumpleHebreo,
  mikve_recordatorio: mikveRecordatorio,
  shabat, jag, ayuno, rosh_jodesh: roshJodesh, 'janucá': janucaNoche, omer,
  resumen_semanal: resumenSemanal, reactivacion,
  adm_resumen_diario: admResumenDiario, adm_cumple_equipo: admCumpleEquipo, adm_errores: admErrores,
}

/* ═════════════════════════════════════════════
   COLA: retenidos por Shabat / silencio / ráfagas
═════════════════════════════════════════════ */

const PLURAL: Record<string, string> = {
  adm_registro: 'solicitudes de registro', adm_mikve: 'cambios en reservas', adm_cita: 'citas con el Rav',
  adm_pregunta_rav: 'preguntas al Rav', adm_servicio: 'solicitudes de servicios', adm_donacion: 'donaciones',
  adm_donacion_intento: 'intenciones de donar', adm_evento_lleno: 'avisos de eventos', adm_moderacion: 'altas en Jconnect',
  adm_voluntariado: 'inscripciones de voluntariado', adm_baja: 'bajas', adm_galeria: 'subidas de fotos',
}

async function vaciarCola(ctx: Ctx) {
  const { data: filas } = await ctx.sb.from('notif_cola').select('id, tipo, payload')
    .is('enviado_at', null).lte('enviar_desde', ctx.now.toISOString()).order('id').limit(200)
  if (!filas?.length) return []
  await ctx.sb.from('notif_cola').update({ enviado_at: ctx.now.toISOString() }).in('id', filas.map((f: Row) => f.id))

  const vigentes = filas.filter((f: Row) => !f.payload.caduca || new Date(f.payload.caduca) > ctx.now)
  const internos = vigentes.filter((f: Row) => f.payload.esAdmin)
  const resto = vigentes.filter((f: Row) => !f.payload.esAdmin)
  const res = []

  // Avisos internos: uno a uno si son pocos; si no, un resumen por persona
  if (internos.length <= 3) {
    for (const f of internos) res.push(await notificar(ctx.sb, f.payload as Aviso, { desdeCola: true }))
  } else {
    const porPersona = new Map<string, Map<string, number>>()
    internos.forEach((f: Row) => (f.payload.destinatarios as Destino[]).forEach(d => {
      const m = porPersona.get(d.user_id) || new Map<string, number>()
      m.set(f.tipo, (m.get(f.tipo) || 0) + 1)
      porPersona.set(d.user_id, m)
    }))
    const destinatarios: Destino[] = [...porPersona].map(([user_id, m]) => ({
      user_id, titulo: `${[...m.values()].reduce((a, b) => a + b, 0)} avisos pendientes`,
      cuerpo: [...m].map(([t, n]) => `${n} ${PLURAL[t] || t}`).join(', '),
    }))
    res.push(await notificar(ctx.sb, {
      tipo: 'adm_resumen_diario', clave: `cola-resumen:${ctx.now.toISOString().slice(0, 16)}`,
      url: 'admin.html', esAdmin: true, destinatarios,
    }, { desdeCola: true }))
  }
  for (const f of resto) res.push(await notificar(ctx.sb, f.payload as Aviso, { desdeCola: true }))
  return res
}

/* ═════════════════════════════════════════════
   HANDLER
═════════════════════════════════════════════ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date()

  try {
    const body = await req.json().catch(() => ({}))
    const programado = !!req.headers.get('x-notif-secret')
    const admin = programado ? null : await adminLlamante(sb, req)
    if (programado ? !(await secretoValido(sb, req)) : !admin) return json({ error: 'No autorizado' }, 401)

    /* ── Prueba: un ejemplo de un tipo, solo al admin que llama ── */
    if (admin && body.test) {
      const gen = GENERADORES[body.test]
      if (!gen) return json({ error: `Tipo programado desconocido: ${body.test}` }, 400)
      const ctx: Ctx = { sb, now, hoy: hoyMadrid(now), forzar: true, dryRun: true }
      const avisos = (await gen(ctx)).filter(a => a.destinatarios.length)
      if (!avisos.length) return json({ tipo: body.test, estado: 'sin_datos', motivo: 'No hay datos reales para este ejemplo ahora mismo' })
      const a = avisos[0]
      return json(await notificar(sb, { ...a, destinatarios: [a.destinatarios[0]] }, { soloUsuario: admin }))
    }

    /* ── Simulación: qué se enviaría ahora (o con forzar, todo lo posible) ── */
    if (admin && body.dry_run) {
      const ctx: Ctx = { sb, now, hoy: hoyMadrid(now), forzar: !!body.forzar, dryRun: true }
      const shabatAhora = await esShabatOYomTov(now)
      const informe = []
      for (const [tipo, gen] of Object.entries(GENERADORES)) {
        try {
          for (const a of await gen(ctx)) {
            if (a.destinatarios.length) informe.push(await notificar(sb, a, { dryRun: true }))
          }
        } catch (e) { informe.push({ tipo, estado: 'error', motivo: String(e) }) }
      }
      return json({ shabat: shabatAhora, informe })
    }

    /* ── Pasada programada ── */
    if (await esShabatOYomTov(now)) return json({ skipped: 'shabat/yom tov' })

    const ctx: Ctx = { sb, now, hoy: hoyMadrid(now), forzar: false, dryRun: false }
    const cola = await vaciarCola(ctx)
    const resultados = []
    for (const [tipo, gen] of Object.entries(GENERADORES)) {
      try {
        for (const a of await gen(ctx)) {
          if (a.destinatarios.length) resultados.push(await notificar(sb, a))
        }
      } catch (e) {
        console.error('notif-cron', tipo, e)
        resultados.push({ tipo, estado: 'error', motivo: String(e) })
      }
    }
    return json({ cola, resultados: resultados.filter(r => r.estado !== 'duplicado') })
  } catch (err) {
    console.error('notif-cron', err)
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
