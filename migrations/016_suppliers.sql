-- ============================================================================
-- 016_suppliers.sql — Módulo de proveedores (consumo, cuentas por pagar, rotación)
-- ============================================================================
-- "Bodega Compralo Colombia" vende productos de MUCHOS proveedores y factura un
-- solo recibo al cliente, pero necesita el desglose INTERNO por proveedor de lo
-- ya vendido/despachado: consumo (unidades y $ a costo), cuentas por pagar
-- (cruzadas con día de corte + plazo) y rotación.
--
-- Esta migración es ADITIVA e IDEMPOTENTE y NO modifica datos existentes:
--   - Crea la tabla `suppliers` con tenant_id + RLS idéntico al patrón de 003.
--   - Agrega `supplier_id` (nullable = "sin asignar") a `products` y a `orders`.
--     Los registros existentes quedan en NULL (no se reasigna nada).
--   - El proveedor y el costo unitario quedan CONGELADOS en la fila del pedido
--     al vender (orders.product_cost ya existía; orders.supplier_id se resuelve
--     desde el producto en el momento de la venta).
--
-- Prerrequisitos: 002 (tenants + tenant_id), 003 (RLS jwt_tenant_id()),
-- 009/010 (estilo de constraints de negocio).
-- Siguiente número de migración tras esta: 017.
-- ============================================================================

-- 1) Tabla de proveedores -----------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  contact     TEXT,
  phone       VARCHAR(30),
  -- Plazo de pago en días desde el corte (ej. 30).
  plazo_dias  INTEGER NOT NULL DEFAULT 30,
  -- Día del mes en que cierra el corte del proveedor (1..31).
  dia_corte   INTEGER NOT NULL DEFAULT 1,
  active      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- Constraints de negocio (estilo 009/010): plazo no negativo y corte válido.
DO $$ BEGIN
  ALTER TABLE suppliers ADD CONSTRAINT chk_suppliers_plazo_nonneg
    CHECK (COALESCE(plazo_dias, 0) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE suppliers ADD CONSTRAINT chk_suppliers_dia_corte
    CHECK (dia_corte BETWEEN 1 AND 31);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nombre único por tenant (case-insensitive) para evitar duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_tenant_name
  ON suppliers(tenant_id, lower(name));

-- RLS: aislamiento por tenant idéntico al patrón de 003_strict_rls.sql, más el
-- DROP de la policy anon por defensa en profundidad.
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON suppliers;
DROP POLICY IF EXISTS tenant_isolation ON suppliers;
CREATE POLICY tenant_isolation ON suppliers FOR ALL
  USING (tenant_id = jwt_tenant_id())
  WITH CHECK (tenant_id = jwt_tenant_id());

-- 2) supplier_id en products (catálogo) — nullable = "sin asignar" ------------
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER
    REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- 3) supplier_id en orders (línea = fila) — congelado al vender ----------------
DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER
    REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);
