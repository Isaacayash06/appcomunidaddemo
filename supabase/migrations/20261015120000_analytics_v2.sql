-- Kehila · Analytics v2 · 15-10-2026
-- Ejecutar TODO el archivo en Supabase → SQL Editor (rol postgres).
-- Solo AÑADE: tabla app_events, columnas nuevas, approved_at + trigger,
-- y la función analytics_dashboard(). No borra ni modifica registros existentes.
-- La última sentencia devuelve el informe de los últimos 30 días como prueba.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. app_events: acciones dentro de la app ─────────────────────
-- page_views sigue registrando qué sección se abre; app_events registra
-- lo que el usuario HACE (empezar/terminar una reserva, inscribirse,
-- errores de JS...). Solo admins pueden leer.
CREATE TABLE IF NOT EXISTS public.app_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  text CHECK (char_length(session_id) <= 64),
  event       text NOT NULL CHECK (event ~ '^[a-z0-9_]{1,64}$'),
  page        text CHECK (char_length(page) <= 64),
  props       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(props) <= 2048),
  platform    text CHECK (platform IN ('ios','android','web','pwa')),
  app_version text CHECK (char_length(app_version) <= 32)
);

CREATE INDEX IF NOT EXISTS idx_app_events_created    ON public.app_events (created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_event_time ON public.app_events (event, created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_user_time  ON public.app_events (user_id, created_at);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ae_insert_own  ON public.app_events;
DROP POLICY IF EXISTS ae_insert_anon ON public.app_events;
DROP POLICY IF EXISTS ae_select      ON public.app_events;

-- Usuario con sesión: solo puede escribir eventos a su propio nombre.
CREATE POLICY ae_insert_own ON public.app_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
-- Sin sesión (formulario de registro, login): solo eventos anónimos de
-- registro/login/error, para medir el embudo antes de que exista la cuenta.
CREATE POLICY ae_insert_anon ON public.app_events
  FOR INSERT TO anon WITH CHECK (user_id IS NULL AND event ~ '^(registro|login|error)_');
CREATE POLICY ae_select ON public.app_events
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.app_events FROM anon, authenticated;
GRANT INSERT ON public.app_events TO anon, authenticated;
GRANT SELECT ON public.app_events TO authenticated;

-- ── 2. page_views: plataforma y sesión ───────────────────────────
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS platform   text;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS idx_page_views_user_time ON public.page_views (user_id, created_at);

-- ── 3. profiles.approved_at: para medir el tiempo de aprobación ──
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE OR REPLACE FUNCTION public.kehila_set_approved_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_set_approved_at ON public.profiles;
CREATE TRIGGER profiles_set_approved_at
  BEFORE UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.kehila_set_approved_at();

-- ── 4. analytics_dashboard(desde, hasta) ─────────────────────────
-- Todo se calcula en la base de datos: sin límite de 1000 filas y sin
-- mandar datos personales al navegador (solo agregados).
-- Excluye de las métricas de uso a admins/staff y cuentas baneadas.
CREATE OR REPLACE FUNCTION public.analytics_dashboard(p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_len   interval := p_hasta - p_desde;
  v_pdesde timestamptz := p_desde - (p_hasta - p_desde);
  v_tz    text := 'Europe/Madrid';
  r       jsonb := '{}'::jsonb;
BEGIN
  -- Admin vía API, o conexión directa a la BD (SQL Editor: sin JWT)
  IF NOT (public.is_admin() OR COALESCE(current_setting('request.jwt.claims', true), '') = '') THEN
    RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501';
  END IF;
  IF p_hasta <= p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  -- Miembros que cuentan para métricas (sin admins/staff/baneados)
  DROP TABLE IF EXISTS pg_temp._an_members;
  CREATE TEMP TABLE pg_temp._an_members ON COMMIT DROP AS
    SELECT p.id, p.status, p.created_at, p.approved_at, p.genero, p.ciudad, p.practica, p.como_conocio,
           COALESCE(p.fecha_nacimiento,
                    CASE WHEN p.fecha_nac ~ '^\d{4}-\d{2}-\d{2}$' THEN p.fecha_nac::date END) AS nac
    FROM public.profiles p
    WHERE COALESCE(p.role, 'miembro') NOT IN ('admin','super_admin','staff')
      AND COALESCE(p.status, '') <> 'banned'
      AND COALESCE(p.is_child, false) = false;

  -- Actividad = abrir una sección (page_views) o hacer algo (app_events)
  DROP TABLE IF EXISTS pg_temp._an_activity;
  CREATE TEMP TABLE pg_temp._an_activity ON COMMIT DROP AS
    SELECT v.user_id, v.created_at, v.platform FROM public.page_views v
    JOIN pg_temp._an_members m ON m.id = v.user_id
    UNION ALL
    SELECT e.user_id, e.created_at, e.platform FROM public.app_events e
    JOIN pg_temp._an_members m ON m.id = e.user_id;
  CREATE INDEX ON pg_temp._an_activity (user_id, created_at);

  -- KPIs del periodo y del periodo anterior (misma duración)
  r := r || jsonb_build_object('periodo', jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'generado', now()));

  r := r || jsonb_build_object('kpis', jsonb_build_object(
    'nuevos',            (SELECT count(*) FROM pg_temp._an_members WHERE created_at >= p_desde AND created_at < p_hasta),
    'nuevos_prev',       (SELECT count(*) FROM pg_temp._an_members WHERE created_at >= v_pdesde AND created_at < p_desde),
    'activos',           (SELECT count(DISTINCT user_id) FROM pg_temp._an_activity WHERE created_at >= p_desde AND created_at < p_hasta),
    'activos_prev',      (SELECT count(DISTINCT user_id) FROM pg_temp._an_activity WHERE created_at >= v_pdesde AND created_at < p_desde),
    'activos_7d',        (SELECT count(DISTINCT user_id) FROM pg_temp._an_activity WHERE created_at >= p_hasta - interval '7 days' AND created_at < p_hasta),
    'activos_30d',       (SELECT count(DISTINCT user_id) FROM pg_temp._an_activity WHERE created_at >= p_hasta - interval '30 days' AND created_at < p_hasta),
    'miembros_activos',  (SELECT count(*) FROM pg_temp._an_members WHERE status = 'active'),
    'miembros_total',    (SELECT count(*) FROM pg_temp._an_members),
    'pendientes',        (SELECT count(*) FROM pg_temp._an_members WHERE status = 'pending'),
    'pendientes_dias_media', (SELECT round(avg(extract(epoch FROM now() - created_at) / 86400)::numeric, 1)
                              FROM pg_temp._an_members WHERE status = 'pending'),
    'pendientes_mas_7d', (SELECT count(*) FROM pg_temp._an_members WHERE status = 'pending' AND created_at < now() - interval '7 days'),
    'aprobacion_horas_media', (SELECT round(avg(extract(epoch FROM approved_at - created_at) / 3600)::numeric, 1)
                               FROM pg_temp._an_members WHERE approved_at >= p_desde AND approved_at < p_hasta),
    'nunca_abrieron',    (SELECT count(*) FROM pg_temp._an_members m WHERE m.status = 'active'
                            AND NOT EXISTS (SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id)),
    'acciones',          (SELECT count(*) FROM public.app_events WHERE created_at >= p_desde AND created_at < p_hasta
                            AND event NOT LIKE 'error%'),
    'visitas',           (SELECT count(*) FROM public.page_views WHERE created_at >= p_desde AND created_at < p_hasta)
  ));

  -- Serie semanal (semanas de lunes, hora de Madrid)
  r := r || jsonb_build_object('semanal', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('semana', s.semana, 'nuevos', s.nuevos, 'aprobados', s.aprobados,
                                        'activos', s.activos, 'visitas', s.visitas) ORDER BY s.semana)
    FROM (
      SELECT w.semana::date AS semana,
        (SELECT count(*) FROM pg_temp._an_members m
           WHERE date_trunc('week', m.created_at AT TIME ZONE v_tz) = w.semana) AS nuevos,
        (SELECT count(*) FROM pg_temp._an_members m
           WHERE date_trunc('week', m.approved_at AT TIME ZONE v_tz) = w.semana) AS aprobados,
        (SELECT count(DISTINCT a.user_id) FROM pg_temp._an_activity a
           WHERE date_trunc('week', a.created_at AT TIME ZONE v_tz) = w.semana) AS activos,
        (SELECT count(*) FROM public.page_views v
           WHERE date_trunc('week', v.created_at AT TIME ZONE v_tz) = w.semana) AS visitas
      FROM generate_series(date_trunc('week', p_desde AT TIME ZONE v_tz),
                           date_trunc('week', p_hasta AT TIME ZONE v_tz),
                           interval '1 week') AS w(semana)
    ) s), '[]'::jsonb));

  -- Retención por cohorte de registro: % con actividad en la semana N tras registrarse
  r := r || jsonb_build_object('cohortes', COALESCE((
    SELECT jsonb_agg(c ORDER BY c->>'semana') FROM (
      SELECT jsonb_build_object(
        'semana', date_trunc('week', m.created_at AT TIME ZONE v_tz)::date,
        'tamano', count(*),
        's1', CASE WHEN max(m.created_at) + interval '2 weeks' <= now() THEN count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id
                  AND a.created_at >= m.created_at + interval '1 week' AND a.created_at < m.created_at + interval '2 weeks')) END,
        's2', CASE WHEN max(m.created_at) + interval '3 weeks' <= now() THEN count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id
                  AND a.created_at >= m.created_at + interval '2 weeks' AND a.created_at < m.created_at + interval '3 weeks')) END,
        's4', CASE WHEN max(m.created_at) + interval '5 weeks' <= now() THEN count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id
                  AND a.created_at >= m.created_at + interval '4 weeks' AND a.created_at < m.created_at + interval '5 weeks')) END,
        's8', CASE WHEN max(m.created_at) + interval '9 weeks' <= now() THEN count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id
                  AND a.created_at >= m.created_at + interval '8 weeks' AND a.created_at < m.created_at + interval '9 weeks')) END
      ) AS c
      FROM pg_temp._an_members m
      WHERE m.created_at >= p_desde AND m.created_at < p_hasta
      GROUP BY date_trunc('week', m.created_at AT TIME ZONE v_tz)
    ) x), '[]'::jsonb));

  -- Secciones: visitas y usuarios únicos (solo miembros)
  r := r || jsonb_build_object('secciones', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('page', s.page, 'visitas', s.visitas, 'usuarios', s.usuarios) ORDER BY s.visitas DESC)
    FROM (SELECT v.page, count(*) AS visitas, count(DISTINCT v.user_id) AS usuarios
          FROM public.page_views v JOIN pg_temp._an_members m ON m.id = v.user_id
          WHERE v.created_at >= p_desde AND v.created_at < p_hasta
          GROUP BY v.page) s), '[]'::jsonb));

  -- Plataformas: por actividad registrada y por tokens push (histórico)
  r := r || jsonb_build_object('plataformas', jsonb_build_object(
    'actividad', COALESCE((SELECT jsonb_object_agg(pl, n) FROM (
        SELECT COALESCE(platform, 'sin_dato') AS pl, count(DISTINCT user_id) AS n FROM pg_temp._an_activity
        WHERE created_at >= p_desde AND created_at < p_hasta GROUP BY 1) t), '{}'::jsonb),
    'push', COALESCE((SELECT jsonb_object_agg(pl, n) FROM (
        SELECT COALESCE(t.platform, 'sin_dato') AS pl, count(DISTINCT t.user_id) AS n
        FROM public.push_tokens t JOIN pg_temp._an_members m ON m.id = t.user_id GROUP BY 1) t), '{}'::jsonb)));

  -- Mapa de calor: día de la semana (1=lunes) × hora, hora de Madrid
  r := r || jsonb_build_object('heatmap', COALESCE((
    SELECT jsonb_agg(jsonb_build_array(d, h, n)) FROM (
      SELECT extract(isodow FROM a.created_at AT TIME ZONE v_tz)::int AS d,
             extract(hour   FROM a.created_at AT TIME ZONE v_tz)::int AS h, count(*) AS n
      FROM pg_temp._an_activity a WHERE a.created_at >= p_desde AND a.created_at < p_hasta
      GROUP BY 1, 2) t), '[]'::jsonb));

  -- Acciones de la comunidad (tablas de negocio) en el periodo
  r := r || jsonb_build_object('acciones', jsonb_build_object(
    'inscripciones_eventos', (SELECT count(*) FROM public.inscripciones WHERE created_at >= p_desde AND created_at < p_hasta),
    'inscritos_unicos',      (SELECT count(DISTINCT usuario_id) FROM public.inscripciones WHERE created_at >= p_desde AND created_at < p_hasta),
    'mikve_reservas',        (SELECT count(*) FROM public.mikve_reservas WHERE created_at >= p_desde AND created_at < p_hasta),
    'citas_rav',             (SELECT count(*) FROM public.citas WHERE created_at >= p_desde AND created_at < p_hasta),
    'preguntas_rav',         (SELECT count(*) FROM public.preguntas_rav WHERE created_at >= p_desde AND created_at < p_hasta),
    'donaciones',            (SELECT count(*) FROM public.donaciones WHERE created_at >= p_desde AND created_at < p_hasta),
    'donaciones_eur',        (SELECT COALESCE(sum(cantidad), 0) FROM public.donaciones WHERE created_at >= p_desde AND created_at < p_hasta),
    'noticias_leidas',       (SELECT count(*) FROM public.news_reads WHERE created_at >= p_desde AND created_at < p_hasta),
    'voluntariado',          (SELECT count(*) FROM public.inscripciones_voluntariado WHERE created_at >= p_desde AND created_at < p_hasta),
    'servicios_solicitudes', (SELECT count(*) FROM public.servicios_solicitudes WHERE created_at >= p_desde AND created_at < p_hasta),
    'anuncios',              (SELECT count(*) FROM public.anuncios WHERE created_at >= p_desde AND created_at < p_hasta),
    'negocios',              (SELECT count(*) FROM public.negocios WHERE created_at >= p_desde AND created_at < p_hasta),
    'shiurim_vistas_total',  (SELECT COALESCE(sum(vistas), 0) FROM public.shiurim)
  ));

  -- Eventos con sus inscritos (los del periodo y los próximos)
  r := r || jsonb_build_object('eventos', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('titulo', e.titulo, 'fecha', e.fecha, 'aforo', e.aforo,
                                        'inscritos', (SELECT count(*) FROM public.inscripciones i WHERE i.evento_id = e.id::text))
                     ORDER BY e.fecha DESC)
    FROM public.eventos e
    WHERE e.fecha >= (p_desde AT TIME ZONE v_tz)::date), '[]'::jsonb));

  -- Eventos de app_events agrupados (embudos: *_inicio, *_paso, *_ok)
  r := r || jsonb_build_object('app_events', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('event', t.event, 'paso', t.paso, 'veces', t.veces, 'usuarios', t.usuarios, 'sesiones', t.sesiones)
                     ORDER BY t.event, t.paso)
    FROM (SELECT event, props->>'paso' AS paso, count(*) AS veces,
                 count(DISTINCT user_id) AS usuarios, count(DISTINCT session_id) AS sesiones
          FROM public.app_events
          WHERE created_at >= p_desde AND created_at < p_hasta AND event NOT LIKE 'error%'
          GROUP BY event, props->>'paso') t), '[]'::jsonb));

  -- Audiencia: franjas de edad (miembros vs. activos en el periodo), género, ciudad, práctica, cómo nos conoció
  r := r || jsonb_build_object('audiencia', jsonb_build_object(
    'edades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('franja', f.franja, 'miembros', f.miembros, 'activos', f.activos) ORDER BY f.orden)
      FROM (SELECT
              CASE WHEN nac IS NULL THEN 'Sin dato'
                   WHEN age(nac) < interval '18 years' THEN '<18'
                   WHEN age(nac) < interval '26 years' THEN '18-25'
                   WHEN age(nac) < interval '36 years' THEN '26-35'
                   WHEN age(nac) < interval '51 years' THEN '36-50'
                   WHEN age(nac) < interval '66 years' THEN '51-65'
                   ELSE '65+' END AS franja,
              min(CASE WHEN nac IS NULL THEN 9 ELSE extract(year FROM age(nac))::int END) AS orden,
              count(*) AS miembros,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM pg_temp._an_activity a WHERE a.user_id = m.id
                                              AND a.created_at >= p_desde AND a.created_at < p_hasta)) AS activos
            FROM pg_temp._an_members m WHERE m.status = 'active'
            GROUP BY 1) f), '[]'::jsonb),
    'genero',    COALESCE((SELECT jsonb_object_agg(k, n) FROM (SELECT COALESCE(NULLIF(genero, ''), 'Sin dato') k, count(*) n
                   FROM pg_temp._an_members WHERE status = 'active' GROUP BY 1) t), '{}'::jsonb),
    'ciudad',    COALESCE((SELECT jsonb_agg(jsonb_build_array(k, n) ORDER BY n DESC) FROM (
                   SELECT COALESCE(NULLIF(initcap(trim(ciudad)), ''), 'Sin dato') k, count(*) n
                   FROM pg_temp._an_members WHERE status = 'active' GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t), '[]'::jsonb),
    'practica',  COALESCE((SELECT jsonb_object_agg(k, n) FROM (SELECT COALESCE(NULLIF(practica, ''), 'Sin dato') k, count(*) n
                   FROM pg_temp._an_members WHERE status = 'active' GROUP BY 1) t), '{}'::jsonb),
    'como_conocio', COALESCE((SELECT jsonb_object_agg(k, n) FROM (SELECT COALESCE(NULLIF(como_conocio, ''), 'Sin dato') k, count(*) n
                   FROM pg_temp._an_members GROUP BY 1) t), '{}'::jsonb)
  ));

  -- Calidad técnica: errores JS más frecuentes y entregas push
  r := r || jsonb_build_object('calidad', jsonb_build_object(
    'errores_total',   (SELECT count(*) FROM public.app_events WHERE event LIKE 'error%' AND created_at >= p_desde AND created_at < p_hasta),
    'errores_usuarios',(SELECT count(DISTINCT COALESCE(user_id::text, session_id)) FROM public.app_events
                         WHERE event LIKE 'error%' AND created_at >= p_desde AND created_at < p_hasta),
    'errores_top', COALESCE((SELECT jsonb_agg(jsonb_build_object('msg', msg, 'page', page, 'veces', n, 'ultima', ultima) ORDER BY n DESC)
                   FROM (SELECT left(props->>'msg', 160) AS msg, page, count(*) AS n, max(created_at) AS ultima
                         FROM public.app_events WHERE event LIKE 'error%' AND created_at >= p_desde AND created_at < p_hasta
                         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15) t), '[]'::jsonb),
    'push_envios',    (SELECT count(*) FROM public.push_log WHERE created_at >= p_desde AND created_at < p_hasta),
    'push_enviados',  (SELECT COALESCE(sum(sent), 0) FROM public.push_log WHERE created_at >= p_desde AND created_at < p_hasta),
    'push_fallidos',  (SELECT COALESCE(sum(failed), 0) FROM public.push_log WHERE created_at >= p_desde AND created_at < p_hasta),
    'versiones', COALESCE((SELECT jsonb_object_agg(k, n) FROM (
                   SELECT COALESCE(platform, '?') || ' ' || app_version AS k, count(DISTINCT user_id) AS n
                   FROM public.app_events WHERE app_version IS NOT NULL AND created_at >= p_desde AND created_at < p_hasta
                   GROUP BY 1) t), '{}'::jsonb)
  ));

  RETURN r;
END $$;

ALTER FUNCTION public.analytics_dashboard(timestamptz, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.analytics_dashboard(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_dashboard(timestamptz, timestamptz) TO authenticated;

COMMIT;

-- Prueba: informe de los últimos 30 días + modo de las políticas de page_views
SELECT
  (SELECT jsonb_agg(jsonb_build_object('policy', policyname, 'permissive', permissive))
     FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('page_views','news_reads')) AS politicas,
  public.analytics_dashboard(now() - interval '30 days', now()) AS informe;
