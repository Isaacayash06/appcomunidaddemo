-- =============================================
-- Kehilá — Donativos: tabla don_areas
-- Ejecutar en Supabase Dashboard → SQL Editor
-- =============================================

-- Tabla para configuracion de areas de donativo (admin editable)
CREATE TABLE IF NOT EXISTS don_areas (
  id           TEXT PRIMARY KEY,         -- 'educativo' | 'religioso' | 'social' | 'chai'
  titulo       TEXT,
  descripcion  TEXT,
  desc_larga   TEXT,
  imagen_url   TEXT,
  meta         NUMERIC,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE don_areas ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer
CREATE POLICY "don_areas_read" ON don_areas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo admin puede escribir
CREATE POLICY "don_areas_admin_write" ON don_areas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Datos iniciales
INSERT INTO don_areas (id, titulo) VALUES
  ('educativo', 'Area Educativo'),
  ('religioso',  'Area Religioso'),
  ('social',     'Area Ayuda Social'),
  ('chai',       'Chai Club')
ON CONFLICT (id) DO NOTHING;

-- Tabla para foto del hero (clave/valor simple)
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_read" ON app_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "app_config_admin_write" ON app_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Valor inicial del hero
INSERT INTO app_config (key, value) VALUES ('don_hero_img', NULL)
ON CONFLICT (key) DO NOTHING;
