/* =============================================
   KEHILÁ — media.js
   Subida de imágenes a Supabase Storage
   ============================================= */

/**
 * Redimensiona/comprime una imagen en el navegador antes de subirla, para
 * no mandar fotos de cámara sin tocar (varios MB) que luego tardan en
 * cargar en las tarjetas. Si no es una imagen redimensionable (gif, ya
 * pequeña, o falla el proceso) devuelve el archivo original tal cual.
 * @param {File} file
 * @param {number} maxDim - Lado máximo en píxeles
 * @param {number} quality - Calidad JPEG 0-1
 * @returns {Promise<File>}
 */
async function resizeImageFile(file, maxDim = 1400, quality = 0.85) {
  if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width <= maxDim && height <= maxDim) { bitmap.close?.(); return file; }
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (e) { return file; }
}

async function uploadMedia(file, folder) {
  const sb = getSupabase();
  if (!sb || !file) return null;
  const upFile = await resizeImageFile(file);
  const ext = upFile.name.split('.').pop().toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  // cacheControl: el nombre de archivo es único y nunca se sobrescribe, así
  // que el móvil puede guardar la foto una semana sin volver a preguntar.
  const { error } = await sb.storage.from('community media').upload(path, upFile, { upsert: true, contentType: upFile.type || undefined, cacheControl: '604800' });
  if (error) { console.warn('upload error:', error.message); return null; }
  const { data } = sb.storage.from('community media').getPublicUrl(path);
  return data.publicUrl;
}

// Caché de URLs firmadas en localStorage, para no volver a pedir una nueva
// "entrada" a Supabase en cada recarga si la anterior todavía es válida.
// Clave: "bucket/ruta" -> { url, expiresAt (ms epoch) }. Guardar la URL
// firmada aquí no es distinto de que ya viaje en el propio <img src> del
// HTML — solo evita repetir la llamada de red mientras siga vigente.
// Validez de 7 días: reutilizar la MISMA URL varios días permite que el
// móvil sirva la foto desde su caché HTTP en vez de volver a bajarla (con
// una URL nueva cada hora la caché nunca acertaba). Se renueva cuando le
// quedan menos de 3 días: así cualquier URL entregada sigue valiendo al menos
// 3 días más, y las instantáneas del home (que guardan URLs) pueden pintarse
// sin riesgo hasta MEDIA_URL_MIN_VALIDITY_MS después de guardarse.
const MEDIA_URL_CACHE_KEY = 'kehila_signed_url_cache';
const MEDIA_SIGNED_URL_TTL_S = 7 * 24 * 3600;
const MEDIA_URL_CACHE_MARGIN_MS = 3 * 24 * 3600 * 1000;
const MEDIA_URL_MIN_VALIDITY_MS = MEDIA_URL_CACHE_MARGIN_MS;

function _readMediaUrlCache() {
  try { return JSON.parse(localStorage.getItem(MEDIA_URL_CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}

function _writeMediaUrlCacheEntry(key, url, expiresAt) {
  try {
    const cache = _readMediaUrlCache();
    // Limpieza de paso: fuera las entradas ya caducadas, para que esto no
    // crezca sin límite con fotos viejas que ya no se vuelven a pedir.
    const now = Date.now();
    Object.keys(cache).forEach((k) => { if (!cache[k] || cache[k].expiresAt <= now) delete cache[k]; });
    cache[key] = { url, expiresAt };
    localStorage.setItem(MEDIA_URL_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* localStorage lleno o no disponible: sin caché, sin romper nada */ }
}

/**
 * Convierte una referencia guardada (URL pública antigua o ruta relativa)
 * en una URL firmada de corta duración, ahora que los buckets de fotos
 * (banners, community media, negocios) son privados. El bucket real se
 * extrae de la propia URL guardada (decodificando %20 etc.) en vez de
 * fiarse del `bucket` que pasa el llamador — así funciona igual si una
 * fila antigua apunta a un bucket distinto del esperado. `bucket` solo se
 * usa como último recurso cuando el valor guardado ya es una ruta relativa
 * sin bucket embebido. Deja pasar sin tocar las URLs que no son de
 * Storage (YouTube, blob:, data:), para no romper enlaces externos ni
 * previsualizaciones locales.
 * @param {string} bucket
 * @param {string} urlOrPath
 * @param {number} [expiresIn] segundos de validez (por defecto 7 días)
 * @returns {Promise<string|null>}
 */
async function resolveMediaUrl(bucket, urlOrPath, expiresIn = MEDIA_SIGNED_URL_TTL_S) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return urlOrPath || null;
  if (urlOrPath.startsWith('blob:') || urlOrPath.startsWith('data:')) return urlOrPath;
  const m = urlOrPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  let actualBucket, path;
  if (m) {
    actualBucket = decodeURIComponent(m[1]);
    path = decodeURIComponent(m[2]);
  } else if (/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath; // URL externa (YouTube, etc.) u de otro origen: no tocar.
  } else {
    actualBucket = bucket; // ya es una ruta relativa: no hay bucket que extraer.
    path = urlOrPath;
  }

  const cacheKey = actualBucket + '/' + path;
  const cached = _readMediaUrlCache()[cacheKey];
  if (cached && cached.expiresAt > Date.now() + MEDIA_URL_CACHE_MARGIN_MS) {
    return cached.url;
  }
  return _queueSignedUrl(actualBucket, path, expiresIn);
}

// Firmado por lotes: todas las fotos que se piden en el mismo "tick" (p. ej.
// las ~20 del home) salen en UNA petición createSignedUrls por bucket, en vez
// de una petición por foto. Antes eran 21 peticiones encadenadas (~2,6 s)
// antes de que pudiera empezar a bajar ninguna imagen.
const _signQueue = new Map();    // bucket -> Map(path -> [{resolve}])
const _signInFlight = new Map(); // "bucket/path" -> Promise<string|null>
let _signFlushTimer = null;

function _queueSignedUrl(bucket, path, expiresIn) {
  const key = bucket + '/' + path;
  if (_signInFlight.has(key)) return _signInFlight.get(key);
  const p = new Promise((resolve) => {
    if (!_signQueue.has(bucket)) _signQueue.set(bucket, new Map());
    const byPath = _signQueue.get(bucket);
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push({ resolve, expiresIn });
  });
  _signInFlight.set(key, p);
  if (!_signFlushTimer) _signFlushTimer = setTimeout(_flushSignQueue, 0);
  return p;
}

async function _flushSignQueue() {
  _signFlushTimer = null;
  const batches = [..._signQueue.entries()];
  _signQueue.clear();
  const sb = getSupabase();
  await Promise.all(batches.map(async ([bucket, byPath]) => {
    const paths = [...byPath.keys()];
    const expiresIn = Math.max(...paths.map(p => byPath.get(p)[0].expiresIn));
    const results = new Map();
    try {
      if (sb) {
        const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, expiresIn);
        if (!error && Array.isArray(data)) {
          // La respuesta viene en el mismo orden que `paths`
          data.forEach((d, i) => { if (d && d.signedUrl && !d.error) results.set(d.path || paths[i], d.signedUrl); });
        }
      }
    } catch (e) { /* red caída: cada foto resuelve a null y se queda sin pintar, como antes */ }
    const expiresAt = Date.now() + expiresIn * 1000;
    paths.forEach((path) => {
      const url = results.get(path) || null;
      if (url) _writeMediaUrlCacheEntry(bucket + '/' + path, url, expiresAt);
      byPath.get(path).forEach(w => w.resolve(url));
      _signInFlight.delete(bucket + '/' + path);
    });
  }));
}

/**
 * Resuelve en paralelo uno o varios campos de tipo URL en un array de filas
 * ya cargadas desde Supabase. Guarda el resultado en un campo nuevo con
 * sufijo "_signed" (ej. imagen_url -> imagen_url_signed) SIN tocar el
 * original: si algún formulario de edición precarga el campo original y
 * lo vuelve a guardar sin cambiar la foto, debe seguir guardando la
 * referencia permanente, no la URL firmada temporal. Usar el campo
 * "_signed" solo para pintar la imagen; el original sigue sirviendo para
 * formularios y guardado.
 * @param {Array<object>} rows
 * @param {Array<{bucket: string, field: string, isArray?: boolean}>} fields
 * @returns {Promise<Array<object>>}
 */
async function resolveMediaFields(rows, fields) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  // Todas las llamadas se lanzan a la vez (sin await intermedio) para que
  // caigan en el mismo lote de _flushSignQueue().
  const jobs = [];
  rows.forEach((row) => {
    fields.forEach((f) => {
      const val = row[f.field];
      const outKey = f.field + '_signed';
      if (f.isArray && Array.isArray(val)) {
        jobs.push(Promise.all(val.map((v) => resolveMediaUrl(f.bucket, v))).then((urls) => { row[outKey] = urls; }));
      } else if (val) {
        jobs.push(resolveMediaUrl(f.bucket, val).then((url) => { row[outKey] = url; }));
      }
    });
  });
  await Promise.all(jobs);
  return rows;
}

function initImagePicker(fileInputId, previewImgId, placeholderId) {
  const input = document.getElementById(fileInputId);
  if (!input) return;
  input.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById(previewImgId);
      const ph = document.getElementById(placeholderId);
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      if (ph) ph.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}
