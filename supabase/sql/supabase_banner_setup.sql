-- ═══════════════════════════════════════════════════════════
--  BANNER SETUP — ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Añadir columnas nuevas a banner_slides
ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS layout text DEFAULT 'single';
ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS slots  jsonb;

-- 2. Crear bucket de Storage para imágenes del banner (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banners', 'banners', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 3. Política: lectura pública del bucket
CREATE POLICY "Banners public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'banners');

-- 4. Política: solo admin puede subir/borrar imágenes del banner
CREATE POLICY "Banners admin insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'banners'
    AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Banners admin delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'banners'
    AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

-- ═══════════════════════════════════════════════════════════
--  POLÍTICAS RLS PARA TABLA banner_slides
--  (sin estas, los INSERT/UPDATE/DELETE fallan → van a localStorage)
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "banner_slides_public_read" ON banner_slides
  FOR SELECT USING (activo = true);

CREATE POLICY "banner_slides_admin_insert" ON banner_slides
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "banner_slides_admin_update" ON banner_slides
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "banner_slides_admin_delete" ON banner_slides
  FOR DELETE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );
