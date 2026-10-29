import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders });
    }

    // Verify JWT and get user identity from DB (not from request body)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: corsHeaders });
    }

    // Read profile from DB — never trust client-sent name/email
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('name, email, status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Perfil no encontrado' }), { status: 404, headers: corsHeaders });
    }

    if (profile.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Perfil no está en estado pendiente' }), { status: 400, headers: corsHeaders });
    }

    const firstName = (profile.name || '').split(' ')[0] || 'Shalom';
    const email = profile.email || user.email;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jabad Barcelona <kehila@bcnkehila.com>',
        to: email,
        subject: 'Tu solicitud de membresía ha sido recibida ✡',
        html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F5F4EF;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F4EF;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1B2E5E;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;margin-bottom:6px;">✡</div>
              <div style="color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:0.5px;">Jabad Barcelona</div>
              <div style="color:#B8C4D8;font-size:13px;margin-top:4px;">Kehilá · קהילה</div>
            </td>
          </tr>

          <!-- Gold divider -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#B8820A,#C8791A,#B8820A);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Solicitud recibida</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1B2E5E;line-height:1.3;">
                ¡Brujim habaím, ${firstName}!
              </h1>

              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">
                Hemos recibido tu solicitud para unirte a la comunidad de <strong>Jabad Barcelona</strong>.
                Estamos muy contentos de que quieras formar parte de nuestra kehilá.
              </p>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151;">
                Nuestro equipo revisará tu solicitud y recibirás una respuesta en
                <strong style="color:#1B2E5E;">menos de 24 horas</strong>.
              </p>

              <!-- Status box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#F0F4FF;border-left:4px solid #1B2E5E;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <div style="font-size:13px;font-weight:700;color:#1B2E5E;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Estado de tu solicitud</div>
                    <div style="font-size:15px;color:#374151;">
                      <span style="display:inline-block;width:8px;height:8px;background:#F59E0B;border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
                      En revisión — pendiente de aprobación
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#6B7280;">
                Una vez aprobada tu membresía, recibirás otro email de confirmación y podrás acceder a todos los servicios de la plataforma.
              </p>

              <p style="margin:0;font-size:15px;line-height:1.7;color:#6B7280;">
                Si tienes alguna pregunta, puedes escribirnos a
                <a href="mailto:info@jabadbarcelona.com" style="color:#B8820A;text-decoration:none;font-weight:600;">info@jabadbarcelona.com</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
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
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend error: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
