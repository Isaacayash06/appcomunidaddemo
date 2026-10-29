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
    if (!authHeader) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: corsHeaders });

    // Client with user's JWT to verify identity
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: corsHeaders });

    const userId = user.id;

    // Admin client with service role to delete data
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Borrar el escaneo del DNI/NIE/pasaporte del bucket 'documentos' antes de
    // borrar el perfil (ya no queda ninguna fila que apunte a el).
    const { data: profileRow } = await adminClient.from('profiles').select('doc_url').eq('id', userId).single();
    if (profileRow?.doc_url) {
      const docPath = profileRow.doc_url.includes('/documentos/') ? profileRow.doc_url.split('/documentos/')[1] : profileRow.doc_url;
      await adminClient.storage.from('documentos').remove([docPath]);
    }

    // documento_accesos.admin_id y target_user_id son NOT NULL con FK sin
    // cascade: si este usuario aparece en cualquiera de las dos columnas
    // (su propio documento fue visto, o vio el de otra persona como admin),
    // el borrado de profiles más abajo fallaba entero con un error de base
    // de datos y la cuenta se quedaba sin eliminar. Hay que vaciar esto
    // primero, sea cual sea el motivo por el que aparezca.
    await adminClient.from('documento_accesos').delete().eq('target_user_id', userId);
    await adminClient.from('documento_accesos').delete().eq('admin_id', userId);

    // staff_permisos.granted_by sí admite NULL: si este usuario concedió
    // permisos a otro miembro del staff, se anonimiza en vez de borrar la
    // fila entera (borrarla eliminaría el permiso real de otra persona).
    await adminClient.from('staff_permisos').update({ granted_by: null }).eq('granted_by', userId);

    // Delete user data from all tables
    await adminClient.from('mikve_reservas').delete().eq('usuario_id', userId);
    await adminClient.from('donaciones').delete().eq('usuario_id', userId);
    await adminClient.from('inscripciones').delete().eq('usuario_id', userId);
    await adminClient.from('inscripciones_voluntariado').delete().eq('usuario_id', userId);
    await adminClient.from('preguntas_rav').delete().eq('usuario_id', userId);
    await adminClient.from('citas').delete().eq('usuario_id', userId);
    await adminClient.from('anuncios').delete().eq('usuario_id', userId);
    await adminClient.from('wallap_anuncios').delete().eq('usuario_id', userId);
    await adminClient.from('negocios').delete().eq('usuario_id', userId);
    await adminClient.from('subgrupo_miembros').delete().eq('usuario_id', userId);
    await adminClient.from('profiles').delete().eq('id', userId);

    // Delete auth user (permanently removes login)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
