/**
 * Edge Function: notify-approval
 *
 * Se invoca desde admin.html justo después de marcar a un usuario
 * pending → active. Avisa al usuario aprobado por DOS canales:
 *
 *   1. Email (Resend)  → siempre, si tiene email.
 *   2. Push (APNs/FCM) → si tiene la app instalada y tokens en `push_tokens`.
 *
 * Solo admins pueden invocarla (se verifica el rol del caller antes de
 * hacer nada). Mismo patrón que send-push e notify-mikve — reutiliza los
 * mismos secrets ya configurados en el proyecto, no hace falta añadir nada.
 *
 * Secrets que ya existen en el proyecto:
 *   RESEND_API_KEY
 *   APNS_KEY_ID · APNS_TEAM_ID · APNS_PRIVATE_KEY · APNS_BUNDLE_ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON · FIREBASE_PROJECT_ID   (opcionales)
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function sendApprovalEmail(email: string, firstName: string): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurado en los secrets de Supabase' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Jabad Barcelona <kehila@bcnkehila.com>',
      to: email,
      subject: '¡Tu membresía ha sido aprobada! ✡',
      html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F4EF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F4EF;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td>
              <img src="https://www.bcnkehila.com/img/marketing/approval-poster.png" alt="Jabad Barcelona — Tu comunidad, en una sola app" width="600" style="display:block;width:100%;max-width:600px;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Solicitud aprobada</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1B2E5E;line-height:1.3;">
                ¡Mazal tov, ${firstName}!
              </h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
                Tu solicitud para unirte a la comunidad de <strong>Jabad Barcelona</strong> ha sido aprobada.
                Ya puedes acceder a todos los servicios de la plataforma: eventos, calendario hebreo,
                consultas al rabino, directorio de negocios y mucho más.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#F0FFF4;border-left:4px solid #16A34A;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Estado de tu solicitud</div>
                    <div style="font-size:15px;color:#374151;">
                      <span style="display:inline-block;width:8px;height:8px;background:#16A34A;border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
                      Aprobada — ¡ya eres miembro!
                    </div>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="https://www.bcnkehila.com/descarga" style="display:inline-block;background:#1B2E5E;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:40px;">
                      Descargar la app ↗
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:13px;text-align:center;color:#9CA3AF;">
                O entra desde el navegador en
                <a href="https://www.bcnkehila.com/" style="color:#B8820A;text-decoration:none;font-weight:600;">bcnkehila.com</a>
              </p>
              <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#6B7280;">
                Si tienes alguna pregunta, puedes escribirnos a
                <a href="mailto:info@jabadbarcelona.com" style="color:#B8820A;text-decoration:none;font-weight:600;">info@jabadbarcelona.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#F9F9F7;border-top:1px solid #E5E7EB;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">
                © ${new Date().getFullYear()} Jabad Barcelona — Todos los derechos reservados
              </p>
              <p style="margin:0;font-size:12px;color:#C4C9D4;">
                Has recibido este email porque tu membresía en nuestra comunidad fue aprobada.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { ok: false, error: `Resend ${res.status}: ${errText}` }
  }
  return { ok: true }
}

/* ───────────────────────── Handler ───────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    // 1. Auth — el caller debe ser un admin autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !caller) return json({ error: 'Token inválido' }, 401)

    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Acceso denegado — solo admins' }, 403)
    }

    // 2. Body
    const { userId } = await req.json()
    if (!userId) return json({ error: 'userId es obligatorio' }, 400)

    const { data: target, error: targetErr } = await supabase
      .from('profiles').select('name, email').eq('id', userId).single()
    if (targetErr || !target) return json({ error: 'Usuario no encontrado' }, 404)

    const firstName = (target.name || '').split(' ')[0] || 'Shalom'

    // ── Email ──────────────────────────────────────────
    let emailOk = false
    let emailError: string | undefined
    if (target.email) {
      const result = await sendApprovalEmail(target.email, firstName).catch((e: Error) => ({ ok: false, error: e.message }))
      emailOk = result.ok
      emailError = result.error
    } else {
      emailError = 'El usuario no tiene email en su perfil'
    }

    // ── Push ───────────────────────────────────────────
    let pushSent = 0, pushFailed = 0
    const { data: tokens } = await supabase
      .from('push_tokens').select('token, platform').eq('user_id', userId)

    if (tokens?.length) {
      const iosTokens = tokens.filter((t: { platform: string }) => t.platform === 'ios')
      const fcmTokens = tokens.filter((t: { platform: string }) => t.platform !== 'ios')
      const title = '¡Bienvenido a la Kehilá!'
      const pushBody = 'Tu membresía ha sido aprobada. Ya puedes acceder a todos los servicios.'
      const pushData: Record<string, string> = { tipo: 'aprobacion' }
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

    return json({ ok: true, email: emailOk, emailError, pushSent, pushFailed })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})
