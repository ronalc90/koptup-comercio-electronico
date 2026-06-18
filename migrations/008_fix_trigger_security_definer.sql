-- ============================================================================
-- 008_fix_trigger_security_definer.sql — Arregla el trigger de tope con RLS 003
-- ============================================================================
-- Con la RLS estricta (003) activa, el trigger enforce_product_limit corría como
-- el usuario autenticado, que NO puede leer `tenants` (cerrada a service-role).
-- Resultado: no veía el plan real → asumía 'free' (50) → bloqueaba a Meraki
-- (198 productos > 50). Lo recreamos con SECURITY DEFINER para que lea el plan
-- con privilegios del owner (bypass RLS), con search_path fijo por seguridad.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_product_limit() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE lim int; cnt int; tplan text;
BEGIN
  SELECT plan INTO tplan FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;
  lim := CASE tplan
           WHEN 'enterprise' THEN 2147483647
           WHEN 'pro' THEN 500
           ELSE 50
         END;
  SELECT count(*) INTO cnt FROM public.products WHERE tenant_id = NEW.tenant_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT: límite de productos del plan % alcanzado (%/%).', COALESCE(tplan, 'free'), cnt, lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
