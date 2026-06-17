-- ============================================================================
-- 005_fix_product_limit_race.sql — Corrige la race condition del tope de plan
-- ============================================================================
-- Idempotente. El trigger enforce_product_limit (004) leía COUNT(*) sin lock:
-- dos INSERT concurrentes del MISMO tenant podían leer ambos cnt<lim y superar
-- el tope (overbilling). Aquí serializamos los inserts por tenant tomando un
-- lock de la fila del tenant (FOR UPDATE) ANTES de contar. Tenants distintos no
-- se bloquean entre sí (filas distintas). El trigger trg_product_limit ya existe
-- y apunta a esta función; solo reemplazamos el cuerpo.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_product_limit() RETURNS trigger AS $$
DECLARE lim int; cnt int; tplan text;
BEGIN
  -- Lock de la fila del tenant: serializa los INSERT concurrentes del mismo
  -- tenant, de modo que el segundo cuente DESPUÉS del primero (sin race).
  SELECT plan INTO tplan FROM tenants WHERE id = NEW.tenant_id FOR UPDATE;
  lim := CASE tplan
           WHEN 'enterprise' THEN 2147483647
           WHEN 'pro' THEN 500
           ELSE 50            -- free / desconocido
         END;
  SELECT count(*) INTO cnt FROM products WHERE tenant_id = NEW.tenant_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT: límite de productos del plan % alcanzado (%/%).', COALESCE(tplan, 'free'), cnt, lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback (volver a la versión sin lock — NO recomendado):
--   reaplicar 004_billing.sql (sección del trigger).
