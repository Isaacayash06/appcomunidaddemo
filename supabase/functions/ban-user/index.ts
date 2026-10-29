/**
 * Edge Function: ban-user
 *
 * Revoca (o restaura) el acceso de un usuario a nivel de Supabase Auth,
 * no solo el estado que ya guarda profiles.status. Solo cambiar
 * profiles.status ('banned'/'suspended') no cierra ninguna sesión ya
 * abierta: esa columna solo se comprueba al iniciar sesión de nuevo o al
 * entrar al panel de admin, nunca en el resto de páginas con una sesión ya
 * activa (verificado con una cuenta de prueba: un token ya emitido sigue
 * leyendo datos reales aunque profiles.status cambie).
 *
 * Esta función llama a auth.admin.updateUserById() con ban_duration, que
 * SÍ actúa a nivel de servidor de autenticación: bloquea al instante
 * cualquier inicio de sesión nuevo y cualquier renovación de token — así
 * que una sesión ya abierta deja de poder renovarse en cuanto el access
 * token en curso caduque (máximo 1h, ver Auth > Sessions). No es un
 * corte instantáneo del token ya emitido (Supabase no lo ofrece: las
 * llamadas normales a /rest/v1 no vuelven a preguntarle a Auth), pero es
 * lo más cerca que hay de un "kill switch" real sin re-arquitecturar el
 * cliente para revalidar en cada petición.
 *
 * Solo admin/super_admin/staff pueden invocarla — mismo conjunto de roles
 * que ya protege el resto de acciones de moderación en admin.html
 * (ver verifyAdminRealtime en auth.js).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Supabase no tiene un valor "permanente" real para ban_duration (es un
// texto de duración tipo "24h"); 100 años es la convención habitual para
// un baneo que en la práctica no caduca nunca.
const PERMANENT_BAN = '876000h'

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
    if (!callerProfile || !['admin', 'super_admin', 'staff'].includes(callerProfile.role)) {
      return json({ error: 'Acceso denegado — solo admin/super_admin/staff' }, 403)
    }

    const { targetUserId, banned } = await req.json()
    if (!targetUserId || typeof banned !== 'boolean') {
      return json({ error: 'targetUserId (string) y banned (boolean) son obligatorios' }, 400)
    }
    if (targetUserId === caller.id) {
      return json({ error: 'No puedes banearte a ti mismo' }, 400)
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: banned ? PERMANENT_BAN : 'none',
    })
    if (updateErr) return json({ error: updateErr.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
