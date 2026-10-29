/**
 * Edge Function: notify-cita
 *
 * Se invoca desde citas-rabino.html. Dos acciones:
 *
 * No hay calendario en la app: el miembro envía una SOLICITUD (tipo de
 * consulta, motivo, su disponibilidad, modalidad, teléfono) y la oficina del
 * Rav (Carol, OFFICE_EMAIL) acuerda día y hora con él por email.
 *
 *   { accion: 'nueva',    cita_id }  → justo después de crear la solicitud.
 *       1. Email a la oficina con todos los datos y Reply-To = email del
 *          miembro: Carol responde y le llega directamente a él.
 *       2. Email de acuse al miembro ("hemos recibido tu solicitud").
 *   { accion: 'cancelar', cita_id }  → el miembro la retira: se marca
 *       'cancelada' (service role; los miembros no tienen UPDATE en citas) y
 *       se avisa a la oficina.
 *
 * Seguridad: solo usuarios autenticados, y solo sobre SUS propias citas. Los
 * datos del email se leen de la base de datos, no del cuerpo de la petición,
 * así la función no sirve para mandar emails arbitrarios. Cada cita avisa a
 * la oficina una sola vez (columna aviso_enviado_at).
 *
 * Secrets usados (ya existen en el proyecto):
 *   RESEND_API_KEY · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Se configuran como secretos de la función (supabase secrets set ...).
const OFFICE_EMAIL = Deno.env.get('OFFICE_EMAIL') || ''
const FROM = Deno.env.get('EMAIL_FROM_CITAS') || 'Citas con el Rav <onboarding@resend.dev>'
const DIRECCION = Deno.env.get('COMUNIDAD_DIRECCION') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function layout(titulo: string, intro: string, filas: Array<[string, string]>, pie = '') {
  const rows = filas.map(([k, v]) => `
    <tr>
      <td style="padding:9px 14px;color:#6B7280;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
      <td style="padding:9px 14px;color:#1A1A2E;font-size:14px;font-weight:600;white-space:pre-wrap;">${esc(v || '—')}</td>
    </tr>`).join('')
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B2E5E;">
      <h2 style="color:#B8820A;margin:0 0 6px;">${esc(titulo)}</h2>
      <p style="font-size:14px;color:#4B5563;margin:0 0 20px;line-height:1.5;">${intro}</p>
      <table style="width:100%;border-collapse:collapse;background:#FAF5EE;border-radius:10px;overflow:hidden;">${rows}</table>
      ${pie}
      <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
      <p style="font-size:12px;color:#9CA3AF;">Aviso automático · App Kehilá Jabad Barcelona</p>
    </div>`
}

async function sendEmail(payload: Record<string, unknown>) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'RESEND_API_KEY no configurada' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, ...payload }),
  })
  return res.ok ? { ok: true } : { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)

    const { accion, cita_id } = await req.json().catch(() => ({}))
    if (!cita_id || !['nueva', 'cancelar'].includes(accion)) return json({ error: 'Petición inválida' }, 400)

    const { data: cita } = await supabase.from('citas').select('*').eq('id', cita_id).maybeSingle()
    if (!cita || cita.usuario_id !== user.id) return json({ error: 'Cita no encontrada' }, 404)

    const { data: perfil } = await supabase
      .from('profiles').select('name, email, telefono').eq('id', user.id).maybeSingle()
    const nombre = perfil?.name || cita.usuario_nombre || 'Miembro'
    const email = perfil?.email || cita.usuario_email || user.email || ''
    const telefono = cita.telefono || perfil?.telefono || ''
    const modalidad = cita.modalidad === 'Videollamada' ? 'Videollamada (enviarle el enlace)' : `Presencial — ${DIRECCION}`

    if (accion === 'nueva') {
      if (cita.aviso_enviado_at) return json({ ok: true, yaAvisada: true })

      const oficina = await sendEmail({
        to: OFFICE_EMAIL,
        reply_to: email || undefined,
        subject: `Solicitud de cita con el Rav — ${nombre} · ${cita.tipo_cita}`,
        html: layout(
          'Nueva solicitud de cita con el Rav',
          `${esc(nombre)} ha pedido una cita con el Rav desde la app. <strong>Responde a este email para acordar día y hora</strong>: la respuesta le llega directamente a ${esc(email || 'la persona')}.`,
          [
            ['Nombre', nombre], ['Email', email], ['Teléfono', telefono],
            ['Tipo de consulta', cita.tipo_cita], ['Motivo', cita.notas],
            ['Disponibilidad', cita.disponibilidad], ['Modalidad', modalidad],
          ],
        ),
      })
      if (!oficina.ok) return json({ ok: false, error: oficina.error }, 502)

      await supabase.from('citas').update({ aviso_enviado_at: new Date().toISOString() }).eq('id', cita.id)

      // Acuse al miembro (si falla, la solicitud ya llegó a la oficina)
      let acuse = { ok: false } as { ok: boolean }
      if (email) {
        acuse = await sendEmail({
          to: email,
          reply_to: OFFICE_EMAIL,
          subject: 'Hemos recibido tu solicitud de cita con el Rav',
          html: layout(
            'Solicitud de cita recibida',
            `Hola ${esc(nombre.split(' ')[0])}, hemos recibido tu solicitud. La oficina del Rav te escribirá a este email para <strong>acordar el día y la hora</strong>. Si quieres añadir algo, responde a este mensaje.`,
            [['Tipo de consulta', cita.tipo_cita], ['Motivo', cita.notas], ['Tu disponibilidad', cita.disponibilidad], ['Modalidad', modalidad]],
          ),
        }).catch(() => ({ ok: false }))
      }
      return json({ ok: true, oficina: true, acuse: acuse.ok })
    }

    // accion === 'cancelar'
    if (cita.estado === 'cancelada') return json({ ok: true })
    if (!['pendiente', 'confirmada'].includes(cita.estado)) return json({ error: 'Esta solicitud ya no se puede cancelar' }, 409)
    const { error: upErr } = await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', cita.id)
    if (upErr) return json({ error: upErr.message }, 500)

    const aviso = await sendEmail({
      to: OFFICE_EMAIL,
      reply_to: email || undefined,
      subject: `Solicitud de cita cancelada — ${nombre} · ${cita.tipo_cita}`,
      html: layout('Solicitud de cita cancelada', `${esc(nombre)} ha cancelado desde la app su solicitud de cita con el Rav.`, [
        ['Nombre', nombre], ['Email', email], ['Teléfono', telefono],
        ['Tipo de consulta', cita.tipo_cita], ['Motivo', cita.notas], ['Disponibilidad', cita.disponibilidad],
      ]),
    }).catch(() => ({ ok: false }))
    return json({ ok: true, oficina: aviso.ok })
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
