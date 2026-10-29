/**
 * Edge Function: view-document
 *
 * Descifra el escaneo del DNI/NIE/Pasaporte para mostrarlo en el panel de
 * admin. Solo admins/super_admins pueden invocarla. El objeto en el bucket
 * 'documentos' está cifrado (ver upload-document) y la clave de descifrado
 * vive únicamente en los secrets del proyecto — nunca llega al cliente.
 *
 * Reemplaza la generación de signed URL directa en admin.html (esa
 * apuntaba al objeto cifrado en claro, que ya no es una imagen válida).
 *
 * Devuelve el documento como data URL para pintarlo directamente en un
 * <img>, sin exponer ninguna URL descargable del objeto real.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', pdf: 'application/pdf',
}

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('DOC_ENCRYPTION_KEY')
  if (!raw) throw new Error('Falta el secret DOC_ENCRYPTION_KEY')
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
}

function toBase64(bytes: Uint8Array): string {
  let str = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(str)
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

    const { docPath } = await req.json()
    if (!docPath) return json({ error: 'docPath es obligatorio' }, 400)

    const { data: blob, error: downloadErr } = await supabase.storage.from('documentos').download(docPath)
    if (downloadErr || !blob) return json({ error: downloadErr?.message || 'No encontrado' }, 404)

    const combined = new Uint8Array(await blob.arrayBuffer())
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    const key = await getKey()
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)

    const ext = (docPath.split('.').pop() || 'jpg').toLowerCase()
    const contentType = MIME[ext] || 'application/octet-stream'
    const base64 = toBase64(new Uint8Array(plainBuf))

    // Registro de auditoria: quien ha visto este documento y cuando.
    // No bloquea la respuesta si falla el insert (mejor mostrar el
    // documento igual que perder el registro por un fallo puntual).
    const targetUserId = docPath.split('/')[0]
    supabase.from('documento_accesos').insert({ admin_id: caller.id, target_user_id: targetUserId })
      .then(({ error }) => { if (error) console.error('Error registrando acceso:', error.message) })

    return json({ dataUrl: `data:${contentType};base64,${base64}` })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
