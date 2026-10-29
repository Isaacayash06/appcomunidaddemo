-- Kehila, 16-09-2026. Ejecutar como postgres en SQL Editor.
--
-- El parche de permisos criticos (20260916230000) restringio el UPDATE de
-- shiurim a admin/staff del area shiurim (kehila_shiurim_update_guard).
-- Eso rompio los contadores de vistas/likes que shiurim.html actualizaba
-- con un UPDATE directo desde el navegador de cualquier miembro.
--
-- Esta migracion no reabre esa politica. En su lugar anade dos funciones
-- SECURITY DEFINER de alcance minimo (solo tocan vistas/likes, nada mas de
-- la fila) que cualquier miembro activo puede ejecutar. Ademas corrigen un
-- bug preexistente: el codigo anterior calculaba el nuevo valor en el
-- cliente (cur + 1) y lo enviaba de vuelta, lo que pierde incrementos con
-- dos personas viendo el mismo shiur a la vez. Aqui el incremento es
-- atomico en la propia fila.
BEGIN;

CREATE OR REPLACE FUNCTION public.shiurim_increment_vistas(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nuevas_vistas integer;
BEGIN
  IF NOT public.kehila_active_member() THEN
    RAISE EXCEPTION 'Cuenta no activa' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shiurim
     SET vistas = coalesce(vistas, 0) + 1
   WHERE id = p_id
  RETURNING vistas INTO nuevas_vistas;

  IF nuevas_vistas IS NULL THEN
    RAISE EXCEPTION 'Shiur no encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN nuevas_vistas;
END;
$$;

CREATE OR REPLACE FUNCTION public.shiurim_toggle_like(p_id uuid, p_add boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nuevos_likes integer;
BEGIN
  IF NOT public.kehila_active_member() THEN
    RAISE EXCEPTION 'Cuenta no activa' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shiurim
     SET likes = GREATEST(0, coalesce(likes, 0) + (CASE WHEN p_add THEN 1 ELSE -1 END))
   WHERE id = p_id
  RETURNING likes INTO nuevos_likes;

  IF nuevos_likes IS NULL THEN
    RAISE EXCEPTION 'Shiur no encontrado' USING ERRCODE = 'P0002';
  END IF;

  RETURN nuevos_likes;
END;
$$;

ALTER FUNCTION public.shiurim_increment_vistas(uuid) OWNER TO postgres;
ALTER FUNCTION public.shiurim_toggle_like(uuid, boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.shiurim_increment_vistas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shiurim_toggle_like(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shiurim_increment_vistas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shiurim_toggle_like(uuid, boolean) TO authenticated;

COMMIT;
