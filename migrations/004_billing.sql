-- ============================================================================
-- 004_billing.sql — Licencias y facturación (Fase 5, planes por productos)
-- ============================================================================
-- Idempotente. Cada negocio (tenant) tiene un plan (por cantidad de productos),
-- un estado de licencia y un historial de pagos. El tope de productos se enforza
-- con un trigger (no se puede saltar desde el cliente). Los datos existentes
-- NUNCA se borran: al llegar al tope solo se impide AGREGAR más productos.
-- ============================================================================

-- 1) Campos de licencia en tenants.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS license_until DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'trial';
  -- billing_status: 'trial' | 'active' | 'suspended' | 'cancelled'

-- 2) Historial de cargos/pagos (cuánto ha pagado cada negocio).
CREATE TABLE IF NOT EXISTS charges (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL DEFAULT 0,   -- COP
  concept      TEXT,
  period_start DATE,
  period_end   DATE,
  paid_at      TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charges_tenant ON charges(tenant_id);

-- RLS: solo service role (lo gestionan endpoints server-side). La anon key NO
-- debe ver la facturación de nadie.
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON charges;
-- (sin política para anon ⇒ denegado; service role omite RLS)

-- 3) Plan inicial coherente con los datos:
--    Meraki es el negocio insignia (198 productos) → enterprise/activo, así el
--    trigger nunca lo bloquea. PrimeraMayo arranca en free/trial.
UPDATE tenants SET plan = 'enterprise', billing_status = 'active', license_until = DATE '2099-12-31'
  WHERE slug = 'meraki';
UPDATE tenants SET plan = COALESCE(NULLIF(plan, ''), 'free'), billing_status = COALESCE(billing_status, 'trial')
  WHERE slug = 'primeramayo';

-- 4) Enforce del tope de productos por plan (debe coincidir con src/lib/plans.ts).
CREATE OR REPLACE FUNCTION enforce_product_limit() RETURNS trigger AS $$
DECLARE lim int; cnt int; tplan text;
BEGIN
  SELECT plan INTO tplan FROM tenants WHERE id = NEW.tenant_id;
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

DROP TRIGGER IF EXISTS trg_product_limit ON products;
CREATE TRIGGER trg_product_limit BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_limit();
