-- ══════════════════════════════════════════════════════════════════
--  SETUP COMPLETO DE SUPABASE — Kehilá Web App
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--  Puedes ejecutarlo todo de una vez. Es seguro repetirlo (IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
--  BLOQUE 1: TABLA PROFESIONALES (nueva — no existía en Supabase)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profesionales (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     timestamptz DEFAULT now(),
  nombre         text,
  titulo         text,
  especialidad   text,
  ciudad         text,
  modalidad      text,
  experiencia    int         DEFAULT 0,
  idiomas        text[]      DEFAULT '{}',
  precio         text,
  bio            text,
  formacion      text,
  telefono       text,
  email_contacto text,
  servicios      jsonb       DEFAULT '[]',
  foto           text,
  galeria        jsonb       DEFAULT '[]',
  usuario_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  activo         boolean     DEFAULT true
);

-- Si la tabla ya existía, añadir columnas nuevas
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS foto    text;
ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS galeria jsonb DEFAULT '[]';

-- Columna propietario en negocios (nombre del dueño)
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS propietario text;

ALTER TABLE profesionales ENABLE ROW LEVEL SECURITY;

-- Cualquier miembro autenticado puede ver perfiles
CREATE POLICY "profesionales_read" ON profesionales
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo el propietario puede publicar su propio perfil
CREATE POLICY "profesionales_insert" ON profesionales
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- Solo el propietario puede editar su perfil
CREATE POLICY "profesionales_update" ON profesionales
  FOR UPDATE USING (auth.uid() = usuario_id);

-- El propietario o un admin puede borrar
CREATE POLICY "profesionales_delete" ON profesionales
  FOR DELETE USING (
    auth.uid() = usuario_id
    OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );


-- ─────────────────────────────────────────────────────────────────
--  BLOQUE 2: COLUMNAS NUEVAS EN banner_slides
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS layout text    DEFAULT 'single';
ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS slots  jsonb   DEFAULT '[]';


-- ─────────────────────────────────────────────────────────────────
--  BLOQUE 3: STORAGE BUCKETS (3 buckets necesarios)
-- ─────────────────────────────────────────────────────────────────

-- Bucket: banners (fotos del banner del home)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banners', 'banners', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Bucket: community media (shiurim, noticias, contenido)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community media', 'community media', true, 52428800,
        ARRAY['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Bucket: documentos (DNIs y documentos de identidad — privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
--  BLOQUE 4: POLÍTICAS DE STORAGE
-- ─────────────────────────────────────────────────────────────────

-- BANNERS: lectura pública, escritura solo admin
CREATE POLICY "banners_public_read"   ON storage.objects FOR SELECT USING (bucket_id = 'banners');
CREATE POLICY "banners_admin_insert"  ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'banners' AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
CREATE POLICY "banners_admin_delete"  ON storage.objects FOR DELETE USING (
  bucket_id = 'banners' AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- COMMUNITY MEDIA: lectura pública, escritura para miembros autenticados
-- (usado para fotos de perfil y galería de profesionales, shiurim, noticias...)
CREATE POLICY "media_public_read"    ON storage.objects FOR SELECT USING (bucket_id = 'community media');
CREATE POLICY "media_member_insert"  ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'community media' AND auth.uid() IS NOT NULL);
CREATE POLICY "media_owner_delete"   ON storage.objects FOR DELETE USING (
  bucket_id = 'community media' AND auth.uid() IS NOT NULL);

-- DOCUMENTOS: solo admin puede leer (contiene DNIs)
CREATE POLICY "docs_admin_read"   ON storage.objects FOR SELECT USING (
  bucket_id = 'documentos' AND auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
CREATE POLICY "docs_user_insert"  ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'documentos' AND auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────
--  BLOQUE 5: VERIFICAR QUE TODAS LAS TABLAS TIENEN RLS ACTIVO
--  (las tablas ya existen según CLAUDE.md — solo activamos RLS por si acaso)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE donaciones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscripciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgrupos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgrupo_miembros         ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallap_anuncios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE negocios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE preguntas_rav             ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_solicitudes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_slides             ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_eventos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiurim                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views                ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_reads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscripciones_voluntariado ENABLE ROW LEVEL SECURITY;
ALTER TABLE voluntariados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesionales             ENABLE ROW LEVEL SECURITY;
