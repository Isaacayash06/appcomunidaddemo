/**
 * Núcleo del sistema de notificaciones automáticas.
 *
 * notificar() recibe un aviso con sus destinatarios ya personalizados y aplica,
 * en este orden:
 *   1. interruptor del tipo (notif_config.activo) y etapa (prueba → solo
 *      dispositivos de prueba; todos → todos)
 *   2. usuarios activos (pending/banned/suspended fuera, salvo tipos de cuenta)
 *   3. preferencias del usuario (y avisos de área silenciados por staff/admin)
 *   4. tope de 1 aviso "comunitario" al día por persona
 *   5. Shabat / Yom Tov y horario de silencio (9:00–21:30) → a la cola
 *   6. anti-duplicados (notif_envios.clave)
 *   7. buzón en la app + push a iOS/Android + push_log
 */

import { enviarPush, type Mensaje, type Token } from './push.ts'
import { esShabatOYomTov, hoyMadrid, madrid, instanteMadrid } from './tiempo.ts'

// deno-lint-ignore no-explicit-any
export type SB = any

export type Preferencia = 'eventos' | 'novedades' | 'tora' | 'cumple' | 'shabat' | 'jaguim' | 'omer' | 'resumen'

export type Destino = { user_id: string; titulo: string; cuerpo: string; url?: string }

export interface Aviso {
  tipo: string                    // clave en notif_config
  clave: string                   // anti-duplicados (única por envío lógico)
  ref_id?: string
  url: string                     // página a la que lleva al tocar (relativa)
  destinatarios: Destino[]
  preferencia?: Preferencia | null  // null/undefined = no se puede desactivar
  comunitaria?: boolean           // tope diario + horario de silencio
  permitirPendientes?: boolean    // cuenta_aprobada / info_solicitada
  ignorarShabat?: boolean         // solo para el modo prueba
  esAdmin?: boolean               // aviso interno al equipo
  caduca?: string                 // ISO: si sigue en cola después, se descarta
}

export type Resultado = {
  tipo: string
  estado: 'enviado' | 'desactivado' | 'sin_destinatarios' | 'duplicado' | 'en_cola' | 'simulado'
  destinatarios: number
  push?: { total: number; sent: number; failed: number; dead: number }
  muestra?: { user_id: string; titulo: string; cuerpo: string }[]
  motivo?: string
}

export type Opciones = {
  dryRun?: boolean        // no envía ni escribe nada; devuelve qué haría
  soloUsuario?: string    // modo prueba manual: solo este usuario, sin filtros
  desdeCola?: boolean     // ya pasó por la cola: no volver a encolar
}

const PRUEBA_EMAILS = (Deno.env.get('NOTIF_PRUEBA_EMAILS') || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

const TIPOS_CUENTA = new Set(['cuenta_aprobada', 'info_solicitada'])

/* ───────── Destinatarios habituales ───────── */

/** Usuarios activos (opcionalmente solo un subgrupo). */
export async function usuariosActivos(sb: SB, subgrupoId?: string | null): Promise<{ id: string; name: string }[]> {
  let ids: string[] | null = null
  if (subgrupoId) {
    const { data } = await sb.from('subgrupo_miembros').select('user_id').eq('subgrupo_id', subgrupoId)
    ids = (data || []).map((r: { user_id: string }) => r.user_id)
    if (!ids!.length) return []
  }
  let q = sb.from('profiles').select('id, name, status').limit(5000)
  if (ids) q = q.in('id', ids)
  const { data } = await q
  return (data || []).filter((p: { status?: string }) => (p.status || 'active') === 'active')
}

/**
 * Equipo que debe recibir un aviso interno: TODOS los super_admin, siempre.
 * Si el aviso tiene área, también los admin (todas las áreas) y el staff con esa área.
 */
export async function equipo(sb: SB, area?: string | null, excluir?: string | null): Promise<string[]> {
  const ids = new Set<string>()
  const { data: admins } = await sb.from('profiles').select('id, role').in('role', area ? ['super_admin', 'admin'] : ['super_admin'])
  ;(admins || []).forEach((p: { id: string }) => ids.add(p.id))
  if (area) {
    const { data: staff } = await sb.from('staff_permisos').select('user_id').eq('area', area)
    ;(staff || []).forEach((s: { user_id: string }) => ids.add(s.user_id))
  }
  if (excluir) ids.delete(excluir)   // nadie recibe aviso de lo que ha hecho él mismo
  return [...ids]
}

/* ───────── Núcleo ───────── */

async function idsPrueba(sb: SB): Promise<Set<string>> {
  const { data } = await sb.from('profiles').select('id, email').in('email', PRUEBA_EMAILS)
  return new Set((data || []).map((p: { id: string }) => p.id))
}

function enSilencio(now: Date): boolean {
  const l = madrid(now)
  const min = l.getUTCHours() * 60 + l.getUTCMinutes()
  return min < 9 * 60 || min >= 21 * 60 + 30
}

/** Próximas 9:00 de Barcelona. */
function proximas9(now: Date): Date {
  const hoy = hoyMadrid(now)
  const t = instanteMadrid(hoy, '09:00')
  return t > now ? t : instanteMadrid(new Date(t.getTime() + 86400000).toISOString().slice(0, 10), '09:00')
}

export async function notificar(sb: SB, aviso: Aviso, op: Opciones = {}): Promise<Resultado> {
  const now = new Date()
  const base = { tipo: aviso.tipo, destinatarios: 0 }

  // Destinatarios únicos
  const porUsuario = new Map<string, Destino>()
  aviso.destinatarios.forEach(d => { if (d.user_id && !porUsuario.has(d.user_id)) porUsuario.set(d.user_id, d) })

  /* ── Modo prueba manual: solo quien lo pide, sin filtros ni registro ── */
  if (op.soloUsuario) {
    const d = porUsuario.get(op.soloUsuario) || [...porUsuario.values()][0]
    if (!d) return { ...base, estado: 'sin_destinatarios', motivo: 'no hay datos de ejemplo' }
    const yo = { ...d, user_id: op.soloUsuario, titulo: `[Prueba] ${d.titulo}` }
    return entregar(sb, aviso, [yo], `prueba-manual:${aviso.clave}:${now.getTime()}`, op)
  }

  /* 1. Interruptor y etapa */
  const { data: cfg } = await sb.from('notif_config').select('activo, etapa').eq('tipo', aviso.tipo).maybeSingle()
  if (cfg && !cfg.activo) return { ...base, estado: 'desactivado' }
  const etapa = cfg?.etapa || 'prueba'
  let ids = [...porUsuario.keys()]
  if (etapa === 'prueba') {
    const prueba = await idsPrueba(sb)
    ids = ids.filter(id => prueba.has(id))
  }
  if (!ids.length) return { ...base, estado: 'sin_destinatarios', motivo: etapa === 'prueba' ? 'etapa prueba' : '' }

  /* 2. Usuarios activos */
  const { data: perfiles } = await sb.from('profiles').select('id, status, role').in('id', ids)
  const perfil = new Map<string, { status?: string; role?: string }>((perfiles || []).map((p: { id: string }) => [p.id, p]))
  ids = ids.filter(id => {
    const st = perfil.get(id)?.status || 'active'
    if (st === 'banned' || st === 'suspended') return false
    return st === 'active' || (aviso.permitirPendientes && TIPOS_CUENTA.has(aviso.tipo))
  })

  /* 3. Preferencias */
  if (ids.length && (aviso.preferencia || aviso.esAdmin)) {
    const { data: prefs } = await sb.from('notif_preferencias').select('*').in('user_id', ids)
    const pref = new Map<string, Record<string, unknown>>((prefs || []).map((p: { user_id: string }) => [p.user_id, p]))
    ids = ids.filter(id => {
      const p = pref.get(id)
      if (aviso.esAdmin) {
        if (perfil.get(id)?.role === 'super_admin') return true   // los super_admin lo reciben todo
        return !((p?.admin_silenciados as string[] | undefined) || []).includes(aviso.tipo)
      }
      if (!p) return aviso.preferencia !== 'omer'                   // Omer es opt-in
      return p[aviso.preferencia!] !== false
    })
  }

  /* 4. Tope diario de avisos comunitarios */
  if (ids.length && aviso.comunitaria && !op.desdeCola) {
    const inicioDia = instanteMadrid(hoyMadrid(now), '00:00').toISOString()
    const { data: hoy } = await sb.from('notif_buzon').select('user_id')
      .in('user_id', ids).eq('comunitaria', true).gte('created_at', inicioDia)
    const ya = new Set((hoy || []).map((r: { user_id: string }) => r.user_id))
    ids = ids.filter(id => !ya.has(id))
  }

  if (!ids.length) return { ...base, estado: 'sin_destinatarios' }
  const destinos = ids.map(id => porUsuario.get(id)!)
  const clave = etapa === 'prueba' ? `prueba:${aviso.clave}` : aviso.clave

  /* 5. Shabat / horario de silencio → cola */
  if (!aviso.ignorarShabat && !op.desdeCola && !op.dryRun) {
    const shabat = await esShabatOYomTov(now)
    const silencio = aviso.comunitaria && enSilencio(now)
    if (shabat || silencio) {
      // Un mismo aviso solo entra una vez en la cola (el cron lo recalcula cada 15 min)
      const { error: yaEnCola } = await sb.from('notif_envios')
        .insert({ clave: `cola:${clave}`, tipo: aviso.tipo, ref_id: aviso.ref_id || null })
      if (yaEnCola) return { ...base, destinatarios: destinos.length, estado: 'en_cola', motivo: 'ya en cola' }
      await sb.from('notif_cola').insert({
        tipo: aviso.tipo,
        payload: { ...aviso, destinatarios: destinos },
        enviar_desde: silencio && !shabat ? proximas9(now).toISOString() : now.toISOString(),
      })
      return { ...base, destinatarios: destinos.length, estado: 'en_cola', motivo: shabat ? 'shabat' : 'horario' }
    }
  }

  return entregar(sb, aviso, destinos, clave, op)
}

/** Pasos 6-7: anti-duplicados, buzón, push y registro. */
async function entregar(sb: SB, aviso: Aviso, destinos: Destino[], clave: string, op: Opciones): Promise<Resultado> {
  const base = { tipo: aviso.tipo, destinatarios: destinos.length }
  const muestra = destinos.slice(0, 3).map(d => ({ user_id: d.user_id, titulo: d.titulo, cuerpo: d.cuerpo }))

  if (op.dryRun) {
    const { data: ya } = await sb.from('notif_envios').select('id').eq('clave', clave).maybeSingle()
    return { ...base, estado: ya ? 'duplicado' : 'simulado', muestra }
  }

  /* 6. Reservar la clave ANTES de enviar */
  const { error: dup } = await sb.from('notif_envios').insert({ clave, tipo: aviso.tipo, ref_id: aviso.ref_id || null })
  if (dup) return { ...base, estado: 'duplicado' }

  /* 7a. Buzón (aunque no tenga la app o tenga el push desactivado) */
  const filas = destinos.map(d => ({
    user_id: d.user_id, tipo: aviso.tipo, titulo: d.titulo, cuerpo: d.cuerpo,
    url: d.url || aviso.url, comunitaria: !!aviso.comunitaria && !op.soloUsuario,
  }))
  for (let i = 0; i < filas.length; i += 500) await sb.from('notif_buzon').insert(filas.slice(i, i + 500))

  /* 7b. Push */
  const ids = destinos.map(d => d.user_id)
  const tokens: Token[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('push_tokens').select('token, platform, user_id').in('user_id', ids.slice(i, i + 300))
    tokens.push(...(data || []))
  }
  const porUsuario = new Map(destinos.map(d => [d.user_id, d]))
  const push = await enviarPush(sb, tokens, (uid): Mensaje | null => {
    const d = porUsuario.get(uid)
    return d ? { title: d.titulo, body: d.cuerpo, data: { tipo: aviso.tipo, url: d.url || aviso.url } } : null
  })

  /* 7c. Registro */
  await sb.from('notif_envios').update({
    total: push.total, sent: push.sent, failed: push.failed, buzon: filas.length,
  }).eq('clave', clave)
  if (!op.soloUsuario) {
    await sb.from('push_log').insert({
      admin_id: null, title: `[auto] ${aviso.tipo}: ${destinos[0].titulo}`.slice(0, 200),
      body: destinos[0].cuerpo.slice(0, 500), tipo: aviso.tipo,
      total_tokens: push.total, sent: push.sent, failed: push.failed,
    })
  }
  return { ...base, estado: 'enviado', push, muestra }
}

/** Comprueba la cabecera secreta de los disparadores / cron. */
export async function secretoValido(sb: SB, req: Request): Promise<boolean> {
  const s = req.headers.get('x-notif-secret')
  if (!s) return false
  const { data } = await sb.rpc('notif_secret_ok', { p_secret: s })
  return data === true
}

/** Usuario admin que llama con su JWT (modo prueba / simulación desde el panel). */
export async function adminLlamante(sb: SB, req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return null
  const { data: { user } } = await sb.auth.getUser(jwt)
  if (!user) return null
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  return p && ['admin', 'super_admin'].includes(p.role) ? user.id : null
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notif-secret',
}

export const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
