/**
 * Edge Function: notify-mikve
 *
 * Se invoca desde mikve.html justo después de guardar una reserva en
 * `mikve_reservas`. Avisa al encargado del mikve por DOS canales:
 *
 *   1. Email (Resend)  → siempre.
 *   2. Push (APNs/FCM) → si esa cuenta tiene la app instalada y tokens
 *                        registrados en `push_tokens`.
 *
 * El destinatario está fijado abajo en RECIPIENT_EMAIL.
 *
 * Cualquier usuario autenticado puede llamarla (quien reserva es un
 * miembro normal, no un admin). Solo se comprueba que el token sea válido
 * para evitar llamadas anónimas.
 *
 * Secrets que ya existen en el proyecto (no hay que añadir ninguno):
 *   RESEND_API_KEY
 *   APNS_KEY_ID · APNS_TEAM_ID · APNS_PRIVATE_KEY · APNS_BUNDLE_ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON · FIREBASE_PROJECT_ID   (opcionales)
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Destinatario de los avisos del mikve (secreto de la función: MIKVE_NOTIFY_EMAIL).
const RECIPIENT_EMAIL = Deno.env.get('MIKVE_NOTIFY_EMAIL') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/* ───────────────────────── APNs (iOS) ───────────────────────── */

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlStr = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function importApnsKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
    c => c.charCodeAt(0),
  )
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )
}

async function makeApnsJwt(keyId: string, teamId: string, key: CryptoKey, iat: number): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const payload = b64urlStr(JSON.stringify({ iss: teamId, iat }))
  const signingInput = `${header}.${payload}`
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key, new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${b64url(sig)}`
}

async function sendAPNs(
  jwt: string, bundleId: string, token: string,
  title: string, body: string, data: Record<string, string>,
): Promise<boolean> {
  const payload = JSON.stringify({
    aps: { alert: { title, body }, sound: 'default', badge: 1 },
    ...data,
  })
  const headers = {
    'authorization': `bearer ${jwt}`,
    'apns-topic': bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }
  const post = (host: string) =>
    fetch(`https://${host}/3/device/${token}`, { method: 'POST', headers, body: payload })

  let res = await post('api.push.apple.com')
  if (res.status === 400) {
    const reason = await res.clone().json().then(j => j.reason).catch(() => '')
    if (reason === 'BadDeviceToken') res = await post('api.sandbox.push.apple.com')
  }
  return res.ok
}

/* ───────────────────────── FCM (Android/Web) ───────────────────────── */

async function getGoogleAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }
  const enc = new TextEncoder()
  const sigInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`
  const pemKey = serviceAccount.private_key.replace(/\\n/g, '\n')
  const keyDer = Uint8Array.from(atob(pemKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyDer.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(sigInput))
  const jwt = `${sigInput}.${b64url(signature)}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  return (await res.json()).access_token as string
}

async function sendFCM(accessToken: string, projectId: string, token: string, title: string, body: string, data: Record<string, string> = {}) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token, notification: { title, body }, data,
        android: { priority: 'high', notification: { sound: 'default', channel_id: 'kehila_general' } },
      },
    }),
  })
  return res.ok
}

/* ───────────────────────── Email (Resend) ───────────────────────── */

async function sendEmail(rows: Array<[string, string]>, resumen: string) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return false
  const filas = rows.map(([k, v]) =>
    `<tr>
       <td style="padding:8px 14px;color:#6B7280;font-size:13px;white-space:nowrap;">${k}</td>
       <td style="padding:8px 14px;color:#1A1A2E;font-size:14px;font-weight:600;">${v || '—'}</td>
     </tr>`,
  ).join('')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mikve Barcelona <donativos@jabadbarcelona.com>',
      to: RECIPIENT_EMAIL,
      subject: `Nueva reserva de mikve — ${resumen}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B2E5E;">
          <h2 style="color:#B8820A;margin:0 0 4px;">Nueva reserva de mikve</h2>
          <p style="font-size:14px;color:#6B7280;margin:0 0 20px;">Alguien acaba de reservar una cita. Datos:</p>
          <table style="width:100%;border-collapse:collapse;background:#FAF5EE;border-radius:10px;overflow:hidden;">
            ${filas}
          </table>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
          <p style="font-size:12px;color:#9CA3AF;">Aviso automático · Kehilá Jabad Barcelona</p>
        </div>
      `,
    }),
  })
  return res.ok
}

/* ───────────────────────── Handler ───────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    const b = await req.json()

    // Completar nombre/email/teléfono desde el perfil de quien reserva.
    const { data: perfil } = await supabase
      .from('profiles').select('name, email, telefono').eq('id', user.id).maybeSingle()

    const nombre    = String(b.nombre || perfil?.name  || 'Miembro').slice(0, 120)
    const email     = String(b.email  || perfil?.email || user.email || '').slice(0, 160)
    const telefono  = String(b.telefono || perfil?.telefono || '').slice(0, 40)
    const fecha     = String(b.fecha     || '').slice(0, 40)
    const hora      = String(b.hora      || '').slice(0, 20)
    const servicio  = String(b.servicio  || '').slice(0, 160)
    const precio    = Number(b.precio    || 0)
    const donacion  = Number(b.donacion  || 0)
    const total     = Number(b.total     || 0)
    const notas     = String(b.notas     || '').slice(0, 500)

    const resumen = `${nombre} · ${fecha} ${hora}`.trim()
    const pushBody = `${nombre} — ${fecha} a las ${hora}. ${servicio}`.trim()

    // ── Email ──────────────────────────────────────────
    const emailOk = await sendEmail([
      ['Nombre',    nombre],
      ['Email',     email],
      ['Teléfono',  telefono],
      ['Fecha',     fecha],
      ['Hora',      hora],
      ['Servicio',  servicio],
      ['Precio',    `€${precio.toFixed(2)}`],
      ['Donación',  `€${donacion.toFixed(2)}`],
      ['Total',     `€${total.toFixed(2)}`],
      ['Notas',     notas],
    ], resumen).catch(() => false)

    // ── Push ───────────────────────────────────────────
    let pushSent = 0, pushFailed = 0
    const { data: dest } = await supabase
      .from('profiles').select('id').eq('email', RECIPIENT_EMAIL).maybeSingle()

    if (dest?.id) {
      const { data: tokens } = await supabase
        .from('push_tokens').select('token, platform').eq('user_id', dest.id)

      const iosTokens = (tokens || []).filter((t: { platform: string }) => t.platform === 'ios')
      const fcmTokens = (tokens || []).filter((t: { platform: string }) => t.platform !== 'ios')
      const title = 'Nueva reserva de mikve'
      const pushData: Record<string, string> = { tipo: 'comunidad' }
      const results: boolean[] = []

      if (iosTokens.length) {
        const keyId = Deno.env.get('APNS_KEY_ID')
        const teamId = Deno.env.get('APNS_TEAM_ID')
        const pem = Deno.env.get('APNS_PRIVATE_KEY')
        const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.bcnkehila'
        if (keyId && teamId && pem) {
          const key = await importApnsKey(pem)
          const jwt = await makeApnsJwt(keyId, teamId, key, Math.floor(Date.now() / 1000))
          const r = await Promise.allSettled(
            iosTokens.map((t: { token: string }) => sendAPNs(jwt, bundleId, t.token, title, pushBody, pushData)),
          )
          r.forEach(x => results.push(x.status === 'fulfilled' && x.value))
        }
      }

      if (fcmTokens.length) {
        const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
        const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
        if (saJson && projectId) {
          const accessToken = await getGoogleAccessToken(JSON.parse(saJson))
          const r = await Promise.allSettled(
            fcmTokens.map((t: { token: string }) => sendFCM(accessToken, projectId, t.token, title, pushBody, pushData)),
          )
          r.forEach(x => results.push(x.status === 'fulfilled' && x.value))
        }
      }

      pushSent = results.filter(Boolean).length
      pushFailed = results.length - pushSent
    }

    return json({ ok: true, email: emailOk, pushSent, pushFailed })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})
