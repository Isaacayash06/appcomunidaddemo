/**
 * Edge Function: notify-info-request
 *
 * Se invoca desde admin.html (botón "Info" sobre un usuario pendiente).
 * El admin escribe qué le falta a la solicitud y se le manda por email.
 *
 * Solo admins pueden invocarla (se verifica el rol del caller). Mismo
 * patrón de auth que notify-approval — reutiliza los secrets ya
 * configurados en el proyecto, no hace falta añadir nada.
 *
 * Secrets que ya existen en el proyecto:
 *   RESEND_API_KEY
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendInfoRequestEmail(email: string, firstName: string, mensaje: string): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurado en los secrets de Supabase' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Jabad Barcelona <kehila@bcnkehila.com>',
      to: email,
      subject: 'Necesitamos algo más para completar tu solicitud',
      html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F4EF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F4EF;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#1B2E5E;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;margin-bottom:6px;">✡</div>
              <div style="color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:0.5px;">Jabad Barcelona</div>
              <div style="color:#B8C4D8;font-size:13px;margin-top:4px;">Kehilá · קהילה</div>
            </td>
          </tr>
          <tr><td style="height:4px;background:linear-gradient(90deg,#B8820A,#C8791A,#B8820A);"></td></tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Solicitud en revisión</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1B2E5E;line-height:1.3;">
                Hola ${firstName}, necesitamos algo más
              </h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#374151;">
                Estamos revisando tu solicitud para unirte a la comunidad de <strong>Jabad Barcelona</strong>,
                y nos falta lo siguiente para poder completarla:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#FFFBEB;border-left:4px solid #C8791A;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <div style="font-size:15px;color:#374151;white-space:pre-wrap;">${mensaje}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#6B7280;">
                Puedes responder directamente a este email, o escribirnos a
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
                Has recibido este email porque solicitaste unirte a nuestra comunidad.
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
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !caller) return json({ error: 'Token inválido' }, 401)

    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Acceso denegado — solo admins' }, 403)
    }

    const { userId, mensaje } = await req.json()
    if (!userId) return json({ error: 'userId es obligatorio' }, 400)
    const trimmed = String(mensaje || '').trim().slice(0, 2000)
    if (!trimmed) return json({ error: 'mensaje es obligatorio' }, 400)

    const { data: target, error: targetErr } = await supabase
      .from('profiles').select('name, email').eq('id', userId).single()
    if (targetErr || !target) return json({ error: 'Usuario no encontrado' }, 404)
    if (!target.email) return json({ ok: true, email: false, emailError: 'El usuario no tiene email en su perfil' })

    const firstName = (target.name || '').split(' ')[0] || 'Shalom'
    const result = await sendInfoRequestEmail(target.email, firstName, trimmed).catch((e: Error) => ({ ok: false, error: e.message }))

    return json({ ok: true, email: result.ok, emailError: result.error })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})
