/**
 * Edge Function: upload-document
 *
 * Cifra el escaneo del DNI/NIE/Pasaporte ANTES de guardarlo en el bucket
 * 'documentos', para que nadie con acceso al panel de Supabase o a una URL
 * del bucket pueda verlo en claro — solo se puede descifrar desde el
 * servidor, con la clave guardada en los secrets del proyecto (nunca en
 * el cliente ni en la base de datos).
 *
 * Reemplaza la subida directa desde el cliente (sb.storage.from('documentos')
 * .upload(...)) en registro.js y en completePendingDocUpload (auth.js).
 *
 * Solo el propio usuario puede subir su documento (se verifica que el
 * userId del body coincide con el uid del JWT recibido).
 *
 * Secret nuevo que hay que configurar en el proyecto:
 *   DOC_ENCRYPTION_KEY  (32 bytes en base64, generar con:
 *     openssl rand -base64 32)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('DOC_ENCRYPTION_KEY')
  if (!raw) throw new Error('Falta el secret DOC_ENCRYPTION_KEY')
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
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

    const { userId, fileBase64, fileExt } = await req.json()
    if (!userId || !fileBase64 || !fileExt) return json({ error: 'Faltan datos' }, 400)

    // Solo puedes subir tu propio documento.
    if (userId !== caller.id) return json({ error: 'Acceso denegado' }, 403)

    const plainBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
    const key = await getKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes)

    // Guardamos IV + texto cifrado juntos en el mismo objeto.
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(ciphertext), iv.length)

    const ext = String(fileExt).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
    const path = `${userId}/doc.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('documentos')
      .upload(path, combined, { upsert: true, contentType: 'application/octet-stream' })
    if (uploadErr) return json({ error: uploadErr.message }, 500)

    const { error: updateErr } = await supabase.from('profiles').update({ doc_url: path }).eq('id', userId)
    if (updateErr) return json({ error: updateErr.message }, 500)

    return json({ ok: true, path })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
