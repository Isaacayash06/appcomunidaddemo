/**
 * Envío de push a iOS (APNs directo con clave .p8) y Android (FCM v1).
 *
 * Secrets: APNS_KEY_ID · APNS_TEAM_ID · APNS_PRIVATE_KEY · APNS_BUNDLE_ID
 *          FIREBASE_SERVICE_ACCOUNT_JSON · FIREBASE_PROJECT_ID (opcionales)
 *
 * Los tokens 'web' se ignoran (no hay VAPID): esos usuarios lo ven en el buzón.
 */

// deno-lint-ignore no-explicit-any
type SB = any

export type Token = { token: string; platform: string; user_id: string }
export type Mensaje = { title: string; body: string; data: Record<string, string> }
export type Estado = 'ok' | 'dead' | 'fail'

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s))

const pemToDer = (pem: string) =>
  Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0))

/* ───────── APNs ───────── */

async function makeApnsJwt(): Promise<string> {
  const keyId = Deno.env.get('APNS_KEY_ID')
  const teamId = Deno.env.get('APNS_TEAM_ID')
  const pem = Deno.env.get('APNS_PRIVATE_KEY')
  if (!keyId || !teamId || !pem) throw new Error('Faltan secretos APNs')
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(pem).buffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const input = `${b64urlStr(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${
    b64urlStr(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }))}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  return `${input}.${b64url(sig)}`
}

/** Producción y, si el token es de un build de Xcode (BadDeviceToken), sandbox. */
async function sendAPNs(jwt: string, token: string, m: Mensaje): Promise<Estado> {
  const headers = {
    'authorization': `bearer ${jwt}`,
    'apns-topic': Deno.env.get('APNS_BUNDLE_ID') || 'com.bcnkehila',
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }
  const payload = JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, ...m.data })
  const post = (host: string) =>
    fetch(`https://${host}/3/device/${token}`, { method: 'POST', headers, body: payload })

  let res = await post('api.push.apple.com')
  if (res.status === 400) {
    const reason = await res.clone().json().then(j => j.reason).catch(() => '')
    if (reason === 'BadDeviceToken') res = await post('api.sandbox.push.apple.com')
  }
  if (res.ok) return 'ok'
  return res.status === 410 ? 'dead' : 'fail'
}

/* ───────── FCM ───────── */

type Google = { accessToken: string; projectId: string }

async function getGoogle(): Promise<Google | null> {
  const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  if (!saJson || !projectId) return null
  const sa = JSON.parse(saJson)
  const now = Math.floor(Date.now() / 1000)
  const input = `${b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlStr(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key.replace(/\\n/g, '\n')).buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${input}.${b64url(sig)}`,
  })
  const accessToken = (await res.json()).access_token
  return accessToken ? { accessToken, projectId } : null
}

async function sendFCM(g: Google, token: string, m: Mensaje): Promise<Estado> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${g.projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${g.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token, notification: { title: m.title, body: m.body }, data: m.data,
        android: { priority: 'high', notification: { sound: 'default', channel_id: 'kehila_general' } },
      },
    }),
  })
  if (res.ok) return 'ok'
  return res.status === 404 ? 'dead' : 'fail'
}

/* ───────── API ───────── */

export type ResultadoPush = { total: number; sent: number; failed: number; dead: number }

/**
 * Envía a cada token el mensaje de su usuario (mensajes personalizados).
 * Borra de push_tokens los que Apple/Google dicen que ya no existen.
 */
export async function enviarPush(
  sb: SB, tokens: Token[], mensajeDe: (userId: string) => Mensaje | null,
): Promise<ResultadoPush> {
  const validos = tokens.filter(t => (t.platform === 'ios' || t.platform === 'android') && mensajeDe(t.user_id))
  if (!validos.length) return { total: 0, sent: 0, failed: 0, dead: 0 }

  const jwt = validos.some(t => t.platform === 'ios') ? await makeApnsJwt().catch(() => '') : ''
  const google = validos.some(t => t.platform === 'android') ? await getGoogle().catch(() => null) : null

  const estados: Estado[] = []
  // En tandas de 50 para no abrir cientos de conexiones a la vez
  for (let i = 0; i < validos.length; i += 50) {
    const tanda = validos.slice(i, i + 50)
    const res = await Promise.allSettled(tanda.map(t => {
      const m = mensajeDe(t.user_id)!
      if (t.platform === 'ios') return jwt ? sendAPNs(jwt, t.token, m) : Promise.resolve<Estado>('fail')
      return google ? sendFCM(google, t.token, m) : Promise.resolve<Estado>('fail')
    }))
    res.forEach(r => estados.push(r.status === 'fulfilled' ? r.value : 'fail'))
  }

  const muertos = validos.filter((_, i) => estados[i] === 'dead').map(t => t.token)
  if (muertos.length) await sb.from('push_tokens').delete().in('token', muertos)

  return {
    total: validos.length,
    sent: estados.filter(e => e === 'ok').length,
    failed: estados.filter(e => e !== 'ok').length,
    dead: muertos.length,
  }
}
