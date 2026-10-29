/**
 * Edge Function: send-push
 *
 * Envía notificaciones push a todos los miembros activos (o a un subgrupo).
 * Solo accesible por admins autenticados.
 *
 * Enruta por plataforma:
 *   - platform 'ios'          → Apple APNs (con clave .p8)   [activo]
 *   - platform 'android'/'web'→ Firebase FCM                 [para más adelante]
 *
 * Cada ruta solo se activa si hay tokens de ese tipo, así que funciona
 * con solo la configuración de Apple (sin Firebase todavía).
 *
 * Requiere en Supabase Secrets:
 *   --- Apple (iOS) ---
 *   APNS_KEY_ID       ← Key ID de la clave APNs (ej: 549XP6HK75)
 *   APNS_TEAM_ID      ← Apple Team ID (ej: 576932K276)
 *   APNS_PRIVATE_KEY  ← contenido completo del archivo .p8 (incl. BEGIN/END)
 *   APNS_BUNDLE_ID    ← bundle id de la app (ej: com.bcnkehila)
 *   --- Firebase (Android/Web, opcional por ahora) ---
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   FIREBASE_PROJECT_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/* ─────────────────────────────────────────────
   APPLE APNs
───────────────────────────────────────────── */

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlStr = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Importa la clave privada .p8 (PKCS8, EC P-256) para firmar. */
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

/** Genera el JWT (ES256) que autentica ante APNs. Válido ~1h. */
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

/**
 * Envía un push a un token APNs. Prueba producción y, si el token es de
 * desarrollo (BadDeviceToken), reintenta en sandbox. Así funcionan tanto
 * los builds de la App Store como los de prueba desde Xcode.
 */
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

/* ─────────────────────────────────────────────
   FIREBASE FCM (Android / Web) — sin cambios
───────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────
   HANDLER
───────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    // 2. Admin check
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return json({ error: 'Acceso denegado — solo admins' }, 403)
    }

    // 3. Body
    const { title, body, tipo, subgrupo_id, id } = await req.json()
    if (!title || !body) return json({ error: 'title y body son obligatorios' }, 400)

    // 4. Tokens (todos o de un subgrupo)
    let tokensQuery = supabase.from('push_tokens').select('token, platform, user_id')
    if (subgrupo_id) {
      const { data: miembros } = await supabase
        .from('subgrupo_miembros').select('user_id').eq('subgrupo_id', subgrupo_id)
      const userIds = (miembros || []).map((m: { user_id: string }) => m.user_id)
      if (!userIds.length) return json({ sent: 0, failed: 0, total: 0 })
      tokensQuery = tokensQuery.in('user_id', userIds)
    }
    const { data: tokens, error: tokensErr } = await tokensQuery
    if (tokensErr || !tokens?.length) return json({ error: 'Sin tokens registrados', sent: 0, failed: 0, total: 0 })

    const iosTokens = tokens.filter((t: { platform: string }) => t.platform === 'ios')
    const fcmTokens = tokens.filter((t: { platform: string }) => t.platform !== 'ios')

    const pushData: Record<string, string> = { tipo: tipo || 'comunidad' }
    if (id) pushData.id = String(id)

    const results: boolean[] = []

    // 5a. iOS → APNs
    if (iosTokens.length) {
      const keyId = Deno.env.get('APNS_KEY_ID')
      const teamId = Deno.env.get('APNS_TEAM_ID')
      const pem = Deno.env.get('APNS_PRIVATE_KEY')
      const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.bcnkehila'
      if (!keyId || !teamId || !pem) {
        return json({ error: 'Faltan secretos APNs (APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY)' }, 500)
      }
      const key = await importApnsKey(pem)
      const jwt = await makeApnsJwt(keyId, teamId, key, Math.floor(Date.now() / 1000))
      const apnsResults = await Promise.allSettled(
        iosTokens.map((t: { token: string }) => sendAPNs(jwt, bundleId, t.token, title, body, pushData)),
      )
      apnsResults.forEach(r => results.push(r.status === 'fulfilled' && r.value))
    }

    // 5b. Android/Web → FCM
    if (fcmTokens.length) {
      const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
      const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
      if (saJson && projectId) {
        const accessToken = await getGoogleAccessToken(JSON.parse(saJson))
        const fcmResults = await Promise.allSettled(
          fcmTokens.map((t: { token: string }) => sendFCM(accessToken, projectId, t.token, title, body, pushData)),
        )
        fcmResults.forEach(r => results.push(r.status === 'fulfilled' && r.value))
      } else {
        fcmTokens.forEach(() => results.push(false)) // FCM no configurado todavía
      }
    }

    const sent = results.filter(Boolean).length
    const failed = results.length - sent

    // 6. Log
    await supabase.from('push_log').insert({
      admin_id: user.id, title, body,
      tipo: tipo || 'comunidad',
      subgrupo_id: subgrupo_id || null,
      total_tokens: tokens.length, sent, failed,
    })

    return json({ sent, failed, total: tokens.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})
