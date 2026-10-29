-- Kehila · Citas con el Rav: solicitudes reales por email · 15-10-2026
-- Ejecutar TODO el archivo en Supabase → SQL Editor (rol postgres).
-- La tabla citas está vacía en producción (0 filas), no se pierde nada.
--
-- Ya no hay calendario de huecos: el miembro envía una SOLICITUD (tipo de
-- consulta, motivo, su disponibilidad, modalidad y teléfono) y la oficina
-- del Rav (Carol) la gestiona por email. La Edge Function notify-cita manda
-- el email; cancelar también pasa por ella (los miembros no tienen UPDATE).
--
-- - Nuevas columnas: telefono, disponibilidad, aviso_enviado_at.
-- - Las solicitudes nacen 'pendiente'. Miembros: solo ven y crean las SUYAS.
-- Idempotente: se puede volver a ejecutar.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS disponibilidad text;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS aviso_enviado_at timestamptz;
ALTER TABLE public.citas ALTER COLUMN estado SET DEFAULT 'pendiente';

ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_estado_check;
ALTER TABLE public.citas ADD CONSTRAINT citas_estado_check
  CHECK (estado IN ('pendiente','confirmada','cancelada','realizada'));
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_campos_check;
ALTER TABLE public.citas ADD CONSTRAINT citas_campos_check CHECK (
  char_length(coalesce(notas, '')) <= 1500
  AND char_length(coalesce(disponibilidad, '')) <= 600
  AND char_length(coalesce(telefono, '')) <= 40
);

CREATE INDEX IF NOT EXISTS citas_usuario_idx ON public.citas (usuario_id, created_at DESC);

-- Políticas: se borran las permisivas existentes y se crean explícitas
-- (las RESTRICTIVE, como kehila_active_session, se mantienen)
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'citas' AND permissive = 'PERMISSIVE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.citas', p.policyname);
  END LOOP;
END $$;

CREATE POLICY citas_select_own ON public.citas
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());

CREATE POLICY citas_insert_own ON public.citas
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() AND estado = 'pendiente' AND aviso_enviado_at IS NULL);

CREATE POLICY citas_admin_update ON public.citas
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY citas_admin_delete ON public.citas
  FOR DELETE TO authenticated USING (public.is_admin());

REVOKE ALL ON public.citas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.citas TO authenticated; -- filtrado por las políticas

COMMIT;

-- Comprobación: columnas y políticas finales de citas
SELECT
  (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'citas') AS columnas,
  (SELECT string_agg(policyname || ' (' || permissive || ', ' || cmd || ')', '; ')
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'citas') AS politicas;
