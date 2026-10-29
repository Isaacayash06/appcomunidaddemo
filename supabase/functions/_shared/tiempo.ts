/**
 * Hora de Barcelona, formato de fechas en español y calendario judío (Hebcal).
 */

export const TZ = 'Europe/Madrid'
const GEONAME_BCN = 3128760

/** Minutos que Madrid va por delante de UTC en ese instante (60 ó 120). */
export function offsetMadrid(d: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).map(x => [x.type, x.value]))
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 60000)
}

/** Fecha/hora "de pared" en Barcelona como objeto con campos UTC (getUTC*). */
export function madrid(d: Date = new Date()): Date {
  return new Date(d.getTime() + offsetMadrid(d) * 60000)
}

/** 'YYYY-MM-DD' de hoy (o de d) en Barcelona. */
export function hoyMadrid(d: Date = new Date()): string {
  return madrid(d).toISOString().slice(0, 10)
}

/** fecha 'YYYY-MM-DD' + hora 'HH:MM[:SS]' de Barcelona → instante real. */
export function instanteMadrid(fecha: string, hora?: string | null): Date {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [hh, mm] = (hora || '00:00').split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  let t = naive - offsetMadrid(new Date(naive)) * 60000
  t = naive - offsetMadrid(new Date(t)) * 60000  // segunda pasada: cambio de hora
  return new Date(t)
}

/** Suma días a 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const horaCorta = (hora?: string | null) => (hora || '').slice(0, 5)

/** "el jueves 17 de octubre a las 19:00" */
export function cuandoTexto(fecha: string, hora?: string | null): string {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `el ${dia} ${d} de ${MESES[m - 1]}${hora ? ` a las ${horaCorta(hora)}` : ''}`
}

/** "17 oct" */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1].slice(0, 3)}`
}

/** "19:42" a partir de un ISO con zona */
export function horaDeIso(iso: string): string {
  const d = madrid(new Date(iso))
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/* ───────── Hebcal ───────── */

export type HebItem = {
  title: string; date: string; category: string; subcat?: string
  hebrew?: string; memo?: string; yomtov?: boolean; title_orig?: string
}

const cache = new Map<string, unknown>()
async function getJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Hebcal ${res.status}`)
  const j = await res.json()
  cache.set(url, j)
  return j as T
}

/** Calendario de Barcelona entre dos fechas: velas, havdalá, fiestas, ayunos, Rosh Jodesh, Omer, parashá. */
export async function hebcal(desde: string, hasta: string): Promise<HebItem[]> {
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&lg=es&maj=on&min=on&mod=on&nx=on&ss=on&mf=on`
    + `&c=on&s=on&o=on&M=on&geonameid=${GEONAME_BCN}&start=${desde}&end=${hasta}`
  const j = await getJson<{ items: HebItem[] }>(url)
  return j.items || []
}

/**
 * ¿Es ahora Shabat o Yom Tov en Barcelona? (encendido de velas → havdalá)
 * Si Hebcal no responde: viernes 15:00 → sábado 23:00, para no arriesgar.
 */
export async function esShabatOYomTov(now: Date = new Date()): Promise<boolean> {
  try {
    const hoy = hoyMadrid(now)
    const marcas = (await hebcal(sumarDias(hoy, -3), sumarDias(hoy, 3)))
      .filter(i => i.category === 'candles' || i.category === 'havdalah')
      .map(i => ({ tipo: i.category, t: new Date(i.date).getTime() }))
      .sort((a, b) => a.t - b.t)
    const pasadas = marcas.filter(x => x.t <= now.getTime())
    if (!pasadas.length) return false
    return pasadas[pasadas.length - 1].tipo === 'candles'
  } catch {
    const l = madrid(now)
    const dia = l.getUTCDay(), h = l.getUTCHours()
    return (dia === 5 && h >= 15) || (dia === 6 && h < 23)
  }
}

/* ───────── Fechas hebreas ───────── */

export type FechaHebrea = { hy: number; hm: string; hd: number; hebrew?: string }

/** Gregoriano → hebreo. Si nació después de la puesta de sol, es el día hebreo siguiente. */
export async function aHebreo(fecha: string, trasPuesta = false): Promise<FechaHebrea> {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const j = await getJson<FechaHebrea>(
    `https://www.hebcal.com/converter?cfg=json&g2h=1&gy=${y}&gm=${m}&gd=${d}${trasPuesta ? '&gs=on' : ''}`)
  return { hy: j.hy, hm: j.hm, hd: j.hd, hebrew: j.hebrew }
}

/** Hebreo → gregoriano 'YYYY-MM-DD'. */
export async function aGregoriano(hy: number, hm: string, hd: number): Promise<string> {
  const j = await getJson<{ gy: number; gm: number; gd: number }>(
    `https://www.hebcal.com/converter?cfg=json&h2g=1&hy=${hy}&hm=${encodeURIComponent(hm)}&hd=${hd}`)
  return `${j.gy}-${String(j.gm).padStart(2, '0')}-${String(j.gd).padStart(2, '0')}`
}

/** Año hebreo bisiesto (13 meses): ciclo metónico de 19 años. */
export const esBisiestoHebreo = (hy: number) => ((7 * hy + 1) % 19) < 7

/** Meses de 29 ó 30 días variables: Jeshván y Kislev pueden no tener día 30. */
async function existeDia(hy: number, hm: string, hd: number): Promise<boolean> {
  if (hd < 30) return true
  try {
    const g = await aGregoriano(hy, hm, hd)
    const back = await aHebreo(g)
    return back.hm === hm && back.hd === hd
  } catch { return false }
}

/**
 * Fecha gregoriana del cumpleaños hebreo en el año hebreo `hy`, siguiendo la
 * costumbre (Jabad):
 *   · nacido en Adar de año normal → en año bisiesto se celebra en Adar II;
 *   · nacido en Adar I / Adar II → en año normal, en Adar;
 *   · día 30 que ese año no existe (Jeshván, Kislev, Adar I → Adar) → 1 del mes siguiente.
 */
export async function cumpleHebreoEn(nac: { hm: string; hd: number }, hy: number): Promise<string> {
  let hm = nac.hm
  const bis = esBisiestoHebreo(hy)
  if (hm === 'Adar' && bis) hm = 'Adar II'
  if ((hm === 'Adar I' || hm === 'Adar II') && !bis) hm = 'Adar'

  let hd = nac.hd
  if (!(await existeDia(hy, hm, hd))) {
    // día 30 inexistente → día 1 del mes siguiente = día 29 + 1 día
    const g29 = await aGregoriano(hy, hm, 29)
    return sumarDias(g29, 1)
  }
  return aGregoriano(hy, hm, hd)
}
