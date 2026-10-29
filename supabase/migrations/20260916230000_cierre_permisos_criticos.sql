-- Kehila, 16-09-2026. Ejecutar TODO el archivo como postgres en SQL Editor.
-- Modifica funciones/politicas y anade una restriccion; no borra registros.
-- Cierra las vias de privilegios auditadas. NO corrige pagos ni XSS del frontend.
-- Efectos: staff sin area usuarios no lee todos los perfiles; no hay cambios
-- de rol/estado propios; contadores shiurim dejan de aceptar UPDATE de miembros.
-- Un error anterior a COMMIT revierte el bloque completo.
--
-- Ya aplicado manualmente en producción el 16-09-2026 (ver
-- outputs/TRASPASO-AGENTE-KEHILA.md). Esta migración solo lo versiona;
-- NO reejecutar por rutina ni restaurar políticas antiguas desde scripts
-- historicos del repo.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Ejecuta el archivo con el rol postgres en SQL Editor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE role = 'super_admin' AND status = 'active') THEN
    RAISE EXCEPTION 'No existe super_admin activo. No se aplico el parche';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.profiles'::regclass
                   AND tgname = 'profiles_protect_role_status'
                   AND tgenabled = 'O'
                   AND tgfoid = 'public.prevent_role_self_escalation()'::regprocedure) THEN
    RAISE EXCEPTION 'El trigger de perfiles difiere de la auditoria; revisar antes';
  END IF;
END $$;

-- Los helpers leen la identidad real, con estado activo y nombres cualificados.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role IN ('admin','super_admin') AND status = 'active') $$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT public.is_admin() $$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role IN ('admin','super_admin','staff') AND status = 'active') $$;

CREATE OR REPLACE FUNCTION public.has_staff_area(area_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.staff_permisos s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE p.id = auth.uid() AND p.role = 'staff'
    AND p.status = 'active' AND s.area = area_name) $$;

CREATE OR REPLACE FUNCTION public.kehila_active_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND status = 'active') $$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;
ALTER FUNCTION public.is_admin_user() OWNER TO postgres;
ALTER FUNCTION public.is_staff_or_admin() OWNER TO postgres;
ALTER FUNCTION public.has_staff_area(text) OWNER TO postgres;
ALTER FUNCTION public.kehila_active_member() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin(), public.is_admin_user(),
  public.is_staff_or_admin(), public.has_staff_area(text),
  public.kehila_active_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_admin_user(),
  public.is_staff_or_admin(), public.has_staff_area(text),
  public.kehila_active_member() TO authenticated, service_role;

-- Solo super_admin activo puede asignar admin/super_admin a OTRA cuenta.
-- Admin puede gestionar miembro/staff; staff usuarios solo estados de miembros.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor_role text;
  actor_status text;
BEGIN
  -- Altas Auth, SQL Editor y service_role no llevan identidad de miembro.
  -- El rol authenticated sin UUID nunca se trata como servidor.
  IF auth.uid() IS NULL THEN
    IF coalesce(current_setting('role', true), 'none') IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'Identidad de usuario requerida' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.is_child IS DISTINCT FROM OLD.is_child THEN
    RAISE EXCEPTION 'Identidad y relaciones del perfil protegidas' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT p.role, p.status INTO actor_role, actor_status
  FROM public.profiles p WHERE p.id = auth.uid();

  IF actor_status IS DISTINCT FROM 'active' OR OLD.id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes cambiar tu rol/estado ni actuar estando inactivo'
      USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'super_admin'
     AND NEW.role IN ('miembro','staff','admin','super_admin') THEN
    RETURN NEW;
  END IF;
  IF actor_role = 'admin'
     AND OLD.role IN ('miembro','staff') AND NEW.role IN ('miembro','staff') THEN
    RETURN NEW;
  END IF;
  IF actor_role = 'staff' AND public.has_staff_area('usuarios')
     AND OLD.role = 'miembro' AND NEW.role = 'miembro' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cambio de privilegios no autorizado' USING ERRCODE = '42501';
END $$;
ALTER FUNCTION public.prevent_role_self_escalation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;

-- La app auditada utiliza children para familiares, no perfiles Auth ficticios.
DROP POLICY IF EXISTS parent_insert_children ON public.profiles;
DROP POLICY IF EXISTS parent_update_children ON public.profiles;
DROP POLICY IF EXISTS parent_delete_children ON public.profiles;
DROP POLICY IF EXISTS parent_read_children ON public.profiles;

-- Restrictivas: ninguna politica permisiva puede saltarse estos limites.
DROP POLICY IF EXISTS kehila_profile_insert_guard ON public.profiles;
CREATE POLICY kehila_profile_insert_guard ON public.profiles
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND role = 'miembro' AND status = 'pending'
            AND parent_id IS NULL AND coalesce(is_child, false) = false);

DROP POLICY IF EXISTS kehila_profile_delete_guard ON public.profiles;
CREATE POLICY kehila_profile_delete_guard ON public.profiles
AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

ALTER POLICY profiles_admin_read_all ON public.profiles
USING (id = auth.uid() OR public.is_admin_user() OR public.has_staff_area('usuarios'));

DROP POLICY IF EXISTS kehila_profile_read_guard ON public.profiles;
CREATE POLICY kehila_profile_read_guard ON public.profiles
AS RESTRICTIVE FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin_user() OR public.has_staff_area('usuarios'));

-- Ruta propia solamente, tanto en filas antiguas como en futuras escrituras.
-- Admite las dos formas usadas por el codigo: UUID/doc.ext y URL publica completa.
-- No modifica ni elimina referencias/documentos. Si alguna no cumple, aborta TODO.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS kehila_document_owned_path;
ALTER TABLE public.profiles ADD CONSTRAINT kehila_document_owned_path CHECK (
  doc_url IS NULL OR doc_url = '' OR
  doc_url ~ ('^' || id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$') OR
  doc_url ~ ('^https://[^/?#]+/storage/v1/object/(public|authenticated)/documentos/'
              || id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT kehila_document_owned_path;

-- Impide que pendientes/suspendidos con JWT valido pasen por reglas auth.uid != null.
-- Profiles se excluye: el alta pendiente necesita leer/completar su propio perfil.
-- Se aplica solo a las tablas public con RLS presentes al ejecutar el parche.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND c.relrowsecurity AND c.relname <> 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS kehila_active_session ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY kehila_active_session ON public.%I AS RESTRICTIVE
      FOR ALL TO authenticated USING ((SELECT public.kehila_active_member()))
      WITH CHECK ((SELECT public.kehila_active_member()))', t.relname);
  END LOOP;
END $$;

-- Staff solo opera en su area. Se conservan las reglas administrativas existentes.
ALTER POLICY sp_admin_all ON public.staff_permisos
USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
ALTER POLICY subgrupos_admin_write ON public.subgrupos
USING (public.is_admin_user() OR public.has_staff_area('comunidad') OR public.has_staff_area('subgrupos'))
WITH CHECK (public.is_admin_user() OR public.has_staff_area('comunidad') OR public.has_staff_area('subgrupos'));
ALTER POLICY sgm_admin_write ON public.subgrupo_miembros
USING (public.is_admin_user() OR public.has_staff_area('comunidad') OR public.has_staff_area('subgrupos'))
WITH CHECK (public.is_admin_user() OR public.has_staff_area('comunidad') OR public.has_staff_area('subgrupos'));
ALTER POLICY notif_admin_delete ON public.notificaciones
USING (public.is_admin_user() OR public.has_staff_area('comunidad'));
ALTER POLICY notif_admin_write ON public.notificaciones
WITH CHECK (public.is_admin_user() OR public.has_staff_area('comunidad'));
ALTER POLICY admin_select_mikve ON public.mikve_reservas
USING (public.is_admin_user());
ALTER POLICY admin_update_mikve ON public.mikve_reservas
USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
-- El panel actual no define un area mikve. Su gestion global queda en admin/super_admin.

-- No permitir editar contenido aprovechando la politica de estadisticas.
DROP POLICY IF EXISTS shiurim_stats_update ON public.shiurim;
DROP POLICY IF EXISTS kehila_shiurim_update_guard ON public.shiurim;
CREATE POLICY kehila_shiurim_update_guard ON public.shiurim
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.is_admin_user() OR public.has_staff_area('shiurim'))
WITH CHECK (public.is_admin_user() OR public.has_staff_area('shiurim'));

-- Un miembro solo puede atribuirse sus propias publicaciones/solicitudes.
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['negocios','profesionales','servicios_solicitudes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS kehila_insert_identity ON public.%I', tab);
    EXECUTE format('CREATE POLICY kehila_insert_identity ON public.%I AS RESTRICTIVE
      FOR INSERT TO authenticated WITH CHECK
      (usuario_id = (SELECT auth.uid()) OR (SELECT public.is_admin_user()))', tab);
  END LOOP;
END $$;

-- Storage: propietario autentico del objeto, no el nombre de la politica.
-- Los archivos sin owner_id quedan administrables por admin/super_admin activos.
-- Una cuenta pendiente solo conserva su carpeta documental para completar el alta.
DROP POLICY IF EXISTS kehila_storage_session_guard ON storage.objects;
CREATE POLICY kehila_storage_session_guard ON storage.objects
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.kehila_active_member() OR
  (bucket_id = 'documentos' AND (storage.foldername(name))[1] = auth.uid()::text
   AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'pending')))
WITH CHECK (public.kehila_active_member() OR
  (bucket_id = 'documentos' AND (storage.foldername(name))[1] = auth.uid()::text
   AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'pending')));

ALTER POLICY media_owner_delete ON storage.objects
USING (bucket_id = 'community media' AND public.kehila_active_member()
       AND (owner_id = auth.uid()::text OR public.is_admin_user()));
ALTER POLICY negocios_auth_delete ON storage.objects
USING (bucket_id = 'negocios' AND public.kehila_active_member()
       AND (owner_id = auth.uid()::text OR public.is_admin_user()));
DROP POLICY IF EXISTS kehila_storage_delete_guard ON storage.objects;
CREATE POLICY kehila_storage_delete_guard ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.kehila_active_member() AND
  (bucket_id NOT IN ('community media','negocios')
   OR owner_id = auth.uid()::text OR public.is_admin_user()));

COMMIT;
SELECT 'PARCHE DE PERMISOS APLICADO. Pagos y frontend siguen pendientes.' AS resultado;
