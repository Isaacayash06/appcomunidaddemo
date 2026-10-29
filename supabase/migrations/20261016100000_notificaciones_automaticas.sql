-- ══════════════════════════════════════════════════════════════════════
--  Notificaciones automáticas
--
--  · Configuración por tipo (activo / etapa prueba|todos)
--  · Registro anti-duplicados, cola (Shabat / horario de silencio) y buzón
--    en la app con TODO lo que se notifica a cada usuario
--  · Preferencias por usuario
--  · Lista de espera real de eventos y público (subgrupo) por evento
--  · Disparadores → Edge Function notif-instant (vía pg_net)
--  · pg_cron → Edge Function notif-cron cada 15 min
--
--  Idempotente: se puede ejecutar varias veces sin romper nada.
--  El secreto compartido se genera solo y vive en Supabase Vault.
-- ══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- La migración de ayer (evento_recordatorios) nunca se aplicó; por si acaso.
DROP TABLE IF EXISTS public.evento_recordatorios;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Configuración por tipo de notificación
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notif_config (
  tipo        text PRIMARY KEY,
  activo      boolean     NOT NULL DEFAULT true,
  etapa       text        NOT NULL DEFAULT 'prueba' CHECK (etapa IN ('prueba', 'todos')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notif_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_config_admin_all ON public.notif_config;
CREATE POLICY notif_config_admin_all ON public.notif_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- Avisos al equipo: directamente a todos los super_admins.
-- Avisos a miembros: empiezan en 'prueba' (solo dispositivos de prueba) y se
-- pasan a 'todos' desde admin.html → Notificaciones cuando superan la prueba.
INSERT INTO public.notif_config (tipo, etapa) VALUES
  ('adm_registro','todos'), ('adm_mikve','todos'), ('adm_cita','todos'),
  ('adm_pregunta_rav','todos'), ('adm_servicio','todos'), ('adm_donacion','todos'),
  ('adm_donacion_intento','todos'), ('adm_evento_lleno','todos'), ('adm_moderacion','todos'),
  ('adm_voluntariado','todos'), ('adm_baja','todos'), ('adm_errores','todos'),
  ('adm_resumen_diario','todos'), ('adm_galeria','todos'), ('adm_cumple_equipo','todos'),
  ('evento_48h','prueba'), ('evento_hoy','prueba'), ('evento_nuevo','prueba'),
  ('evento_cambio','prueba'), ('plaza_libre','prueba'), ('cuenta_aprobada','prueba'),
  ('rav_respondio','prueba'), ('cita_confirmada','prueba'), ('mikve_estado','prueba'), ('mikve_recordatorio','prueba'),
  ('info_solicitada','prueba'), ('sg_mensaje','prueba'), ('sg_alta','prueba'),
  ('noticia_nueva','prueba'), ('shiur_nuevo','prueba'), ('galeria_nueva','prueba'),
  ('cumple','prueba'), ('cumple_hebreo','prueba'), ('cumple_hijo','prueba'),
  ('shabat','prueba'), ('jag','prueba'), ('ayuno','prueba'), ('rosh_jodesh','prueba'),
  ('janucá','prueba'), ('omer','prueba'), ('resumen_semanal','prueba'), ('reactivacion','prueba')
ON CONFLICT (tipo) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Anti-duplicados: se reserva la clave ANTES de enviar
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notif_envios (
  id          bigserial   PRIMARY KEY,
  clave       text        NOT NULL UNIQUE,
  tipo        text        NOT NULL,
  ref_id      text,
  total       integer     NOT NULL DEFAULT 0,
  sent        integer     NOT NULL DEFAULT 0,
  failed      integer     NOT NULL DEFAULT 0,
  buzon       integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_envios_created ON public.notif_envios (created_at DESC);
ALTER TABLE public.notif_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_envios_admin_read ON public.notif_envios;
CREATE POLICY notif_envios_admin_read ON public.notif_envios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- ──────────────────────────────────────────────────────────────────────
-- 3. Cola: lo que no se puede enviar ahora (Shabat / horario de silencio)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notif_cola (
  id            bigserial   PRIMARY KEY,
  tipo          text        NOT NULL,
  payload       jsonb       NOT NULL,
  enviar_desde  timestamptz NOT NULL DEFAULT now(),
  enviado_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_cola_pendiente ON public.notif_cola (enviar_desde) WHERE enviado_at IS NULL;
ALTER TABLE public.notif_cola ENABLE ROW LEVEL SECURITY;  -- solo service role

-- ──────────────────────────────────────────────────────────────────────
-- 4. Buzón en la app: copia de TODO lo que se notifica a cada usuario
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notif_buzon (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo         text        NOT NULL,
  titulo       text        NOT NULL,
  cuerpo       text        NOT NULL DEFAULT '',
  url          text,
  comunitaria  boolean     NOT NULL DEFAULT false,
  leida        boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_buzon_user ON public.notif_buzon (user_id, created_at DESC);
ALTER TABLE public.notif_buzon ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_buzon_own_read ON public.notif_buzon;
CREATE POLICY notif_buzon_own_read ON public.notif_buzon
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notif_buzon_own_update ON public.notif_buzon;
CREATE POLICY notif_buzon_own_update ON public.notif_buzon
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notif_buzon_own_delete ON public.notif_buzon;
CREATE POLICY notif_buzon_own_delete ON public.notif_buzon
  FOR DELETE USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 5. Preferencias por usuario (fila ausente = todo activado salvo Omer)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notif_preferencias (
  user_id            uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  eventos            boolean     NOT NULL DEFAULT true,
  novedades          boolean     NOT NULL DEFAULT true,
  tora               boolean     NOT NULL DEFAULT true,
  cumple             boolean     NOT NULL DEFAULT true,
  shabat             boolean     NOT NULL DEFAULT true,
  jaguim             boolean     NOT NULL DEFAULT true,
  omer               boolean     NOT NULL DEFAULT false,
  resumen            boolean     NOT NULL DEFAULT true,
  admin_silenciados  text[]      NOT NULL DEFAULT '{}',
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notif_preferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_pref_own_all ON public.notif_preferencias;
CREATE POLICY notif_pref_own_all ON public.notif_preferencias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 6. Cumpleaños hebreo fiable: datos extra en el perfil
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nacimiento_puesta_sol text
  CHECK (nacimiento_puesta_sol IN ('antes', 'despues', 'nose'));
-- Corrección manual de la fecha hebrea (día 1-30 + mes en formato Hebcal, p. ej. 'Cheshvan', 'Adar II')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cumple_hebreo_dia int CHECK (cumple_hebreo_dia BETWEEN 1 AND 30);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cumple_hebreo_mes text;

-- ──────────────────────────────────────────────────────────────────────
-- 7. Eventos: público (subgrupo) + lista de espera real
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS subgrupo_id uuid REFERENCES public.subgrupos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.lista_espera (
  id          bigserial   PRIMARY KEY,
  evento_id   text        NOT NULL,
  usuario_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  avisado_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, usuario_id)
);
ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lista_espera_own ON public.lista_espera;
CREATE POLICY lista_espera_own ON public.lista_espera
  FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
DROP POLICY IF EXISTS lista_espera_admin_read ON public.lista_espera;
CREATE POLICY lista_espera_admin_read ON public.lista_espera
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'staff'))
  );

-- ──────────────────────────────────────────────────────────────────────
-- 8. Secreto compartido BD ↔ Edge Functions (Vault, se genera solo)
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notif_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notif_secret',
                                'Autentica disparadores y cron ante notif-instant / notif-cron');
  END IF;
END $$;

-- La Edge Function comprueba la cabecera con esta función (solo service role).
CREATE OR REPLACE FUNCTION public.notif_secret_ok(p_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'notif_secret' AND decrypted_secret = p_secret
  );
$$;
REVOKE ALL ON FUNCTION public.notif_secret_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notif_secret_ok(text) TO service_role;

-- Llamada HTTP a una Edge Function con el secreto. Nunca rompe la operación original.
CREATE OR REPLACE FUNCTION public.notif_llamar(p_funcion text, p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notif_secret';
  PERFORM net.http_post(
    -- EDITAR antes de ejecutar: URL del proyecto Supabase de ESTA comunidad.
    url     := 'https://TU-PROYECTO.supabase.co/functions/v1/' || p_funcion,
    body    := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notif-secret', v_secret),
    timeout_milliseconds := 10000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notif_llamar(%): %', p_funcion, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.notif_llamar(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 9. Disparadores → notif-instant
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extra jsonb := '{}'::jsonb;
BEGIN
  -- Al borrar un evento, las inscripciones pueden desaparecer en cascada antes
  -- de que la Edge Function las lea: se envían ya en el payload.
  IF TG_TABLE_NAME = 'eventos' AND TG_OP = 'DELETE' THEN
    SELECT jsonb_build_object('inscritos', coalesce(jsonb_agg(DISTINCT usuario_id), '[]'::jsonb))
      INTO v_extra
      FROM public.inscripciones WHERE evento_id = OLD.id::text;
  END IF;

  PERFORM public.notif_llamar('notif-instant', jsonb_build_object(
    'tabla',  TG_TABLE_NAME,
    'op',     TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old',    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'extra',  v_extra,
    'actor',  auth.uid()          -- quién hizo el cambio (NULL si fue el sistema)
  ));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notif_trigger(%): %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$;

-- Crea un disparador solo si la tabla existe (no todas existen en todos los entornos).
CREATE OR REPLACE FUNCTION pg_temp.notif_crear_trigger(p_tabla text, p_nombre text, p_cuando text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('public.' || p_tabla) IS NULL THEN
    RAISE NOTICE 'Tabla % no existe: se omite %', p_tabla, p_nombre;
    RETURN;
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', p_nombre, p_tabla);
  EXECUTE format('CREATE TRIGGER %I %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.notif_trigger()',
                 p_nombre, p_cuando, p_tabla);
END $$;

SELECT pg_temp.notif_crear_trigger('profiles',          'notif_profiles_ins',  'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('profiles',          'notif_profiles_upd',  'AFTER UPDATE OF status, role');
SELECT pg_temp.notif_crear_trigger('profiles',          'notif_profiles_del',  'AFTER DELETE');
SELECT pg_temp.notif_crear_trigger('mikve_reservas',    'notif_mikve_ins',     'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('mikve_reservas',    'notif_mikve_upd',     'AFTER UPDATE OF estado, fecha, hora');
SELECT pg_temp.notif_crear_trigger('citas',             'notif_citas_ins',     'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('citas',             'notif_citas_upd',     'AFTER UPDATE OF estado');
SELECT pg_temp.notif_crear_trigger('preguntas_rav',     'notif_preguntas_ins', 'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('preguntas_rav',     'notif_preguntas_upd', 'AFTER UPDATE OF respuesta');
SELECT pg_temp.notif_crear_trigger('servicios_solicitudes', 'notif_servicios_ins', 'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('donaciones',        'notif_donaciones_ins','AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('eventos',           'notif_eventos_ins',   'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('eventos',           'notif_eventos_upd',   'AFTER UPDATE OF fecha, hora, lugar');
SELECT pg_temp.notif_crear_trigger('eventos',           'notif_eventos_del',   'BEFORE DELETE');
SELECT pg_temp.notif_crear_trigger('inscripciones',     'notif_inscr_ins',     'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('inscripciones',     'notif_inscr_del',     'AFTER DELETE');
SELECT pg_temp.notif_crear_trigger('lista_espera',      'notif_espera_ins',    'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('noticias',          'notif_noticias_ins',  'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('shiurim',           'notif_shiurim_ins',   'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('fotos',             'notif_fotos_ins',     'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('negocios',          'notif_negocios_ins',  'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('profesionales',     'notif_profesionales_ins', 'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('inscripciones_voluntariado', 'notif_voluntariado_ins', 'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('subgrupo_miembros', 'notif_sgm_ins',       'AFTER INSERT');
SELECT pg_temp.notif_crear_trigger('notificaciones',    'notif_sgmsg_ins',     'AFTER INSERT');

-- app_events: solo los eventos que interesan (el resto, ni se mira)
DROP TRIGGER IF EXISTS notif_app_events_ins ON public.app_events;
CREATE TRIGGER notif_app_events_ins AFTER INSERT ON public.app_events
  FOR EACH ROW WHEN (NEW.event = 'donacion_click')
  EXECUTE FUNCTION public.notif_trigger();

-- Envíos manuales desde admin (send-push) → también al buzón de cada destinatario
CREATE OR REPLACE FUNCTION public.notif_buzon_desde_push_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_id IS NULL THEN RETURN NULL; END IF;  -- los automáticos ya escriben su buzón
  INSERT INTO public.notif_buzon (user_id, tipo, titulo, cuerpo, url)
  SELECT p.id, 'manual', NEW.title, NEW.body, NULL
    FROM public.profiles p
   WHERE coalesce(p.status, 'active') = 'active'
     AND (NEW.subgrupo_id IS NULL
          OR p.id IN (SELECT user_id FROM public.subgrupo_miembros WHERE subgrupo_id = NEW.subgrupo_id));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notif_buzon_desde_push_log: %', SQLERRM;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notif_push_log_buzon ON public.push_log;
CREATE TRIGGER notif_push_log_buzon AFTER INSERT ON public.push_log
  FOR EACH ROW EXECUTE FUNCTION public.notif_buzon_desde_push_log();

-- ──────────────────────────────────────────────────────────────────────
-- 10. Reloj: notif-cron cada 15 minutos
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('notif-cron') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-cron');
  PERFORM cron.schedule('notif-cron', '*/15 * * * *',
    $cron$ SELECT public.notif_llamar('notif-cron', '{}'::jsonb) $cron$);
END $$;

-- Limpieza: buzón > 180 días y registros técnicos > 90 días (cada día a las 4:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('notif-limpieza') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-limpieza');
  PERFORM cron.schedule('notif-limpieza', '0 4 * * *', $cron$
    DELETE FROM public.notif_buzon  WHERE created_at < now() - interval '180 days';
    DELETE FROM public.notif_envios WHERE created_at < now() - interval '90 days';
    DELETE FROM public.notif_cola   WHERE enviado_at IS NOT NULL AND enviado_at < now() - interval '30 days';
  $cron$);
END $$;
