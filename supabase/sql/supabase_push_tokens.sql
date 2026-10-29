-- ══════════════════════════════════════════════════════════
--  Push Notifications
--  Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════

-- 1. Tabla de tokens de dispositivo
CREATE TABLE IF NOT EXISTS push_tokens (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token        text        NOT NULL,
  platform     text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, platform)
);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- El usuario solo puede gestionar sus propios tokens
CREATE POLICY "push_tokens_own_read" ON push_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_own_insert" ON push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_own_update" ON push_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_own_delete" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Index para búsqueda rápida por user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens (user_id);

-- ──────────────────────────────────────────────────────────

-- 2. Tabla de historial de notificaciones enviadas (push_log)
CREATE TABLE IF NOT EXISTS push_log (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  title        text        NOT NULL,
  body         text        NOT NULL,
  tipo         text        DEFAULT 'comunidad',
  subgrupo_id  uuid        REFERENCES subgrupos(id) ON DELETE SET NULL,
  total_tokens integer     DEFAULT 0,
  sent         integer     DEFAULT 0,
  failed       integer     DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer el historial
CREATE POLICY "push_log_admin_read" ON push_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Solo la service_role key (Edge Function) puede insertar
-- (nada que crear: service_role bypasses RLS)

CREATE INDEX IF NOT EXISTS idx_push_log_created_at ON push_log (created_at DESC);

-- ──────────────────────────────────────────────────────────

-- 3. Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_push_token_timestamp();

-- ──────────────────────────────────────────────────────────

-- 4. (Opcional) Webhook Supabase para notificar automáticamente
--    cuando se crea un nuevo evento.
--    Configurar en Supabase Dashboard → Database → Webhooks:
--
--    Nombre:  notify_new_evento
--    Table:   eventos
--    Events:  INSERT
--    Method:  POST
--    URL:     https://<PROJECT_REF>.supabase.co/functions/v1/send-push
--    Headers: Authorization: Bearer <SUPABASE_ANON_KEY>
--    Payload: {"title": "{{record.titulo}}", "body": "{{record.descripcion}}", "tipo": "evento", "id": "{{record.id}}"}
--
--    NOTA: El webhook no puede verificar que el emisor sea admin.
--    La Edge Function acepta peticiones del service_role sin verificar rol
--    cuando viene de un DB webhook (usar header especial o IP allowlist).
--    Para simplificar, activar solo si se acepta este trade-off.
