-- ============================================================================
-- 009_business_constraints.sql — Reglas de negocio en la BD (pentest #2)
-- ============================================================================
-- El navegador escribe directo a PostgREST con el token del usuario, así que la
-- validación de la UI es evitable. Movemos las reglas críticas a la base: no
-- permitir montos negativos, no duplicar código de producto por negocio, y
-- limitar delivery_status a valores válidos. RLS ya aísla entre negocios; esto
-- evita que un usuario corrompa los datos de SU PROPIO negocio.
-- Idempotente (cada ADD CONSTRAINT atrapa duplicate_object). Verificado: los
-- datos actuales no violan ninguno.
-- ============================================================================

-- Productos: costo no negativo + código único por negocio.
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_cost_nonneg CHECK (cost >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_code ON products(tenant_id, code);

-- Pedidos: montos no negativos.
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_money_nonneg CHECK (
    COALESCE(value_to_collect, 0) >= 0 AND COALESCE(product_cost, 0) >= 0 AND
    COALESCE(operating_cost, 0) >= 0 AND COALESCE(prepaid_amount, 0) >= 0 AND
    COALESCE(payment_cash, 0) >= 0 AND COALESCE(payment_transfer, 0) >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pedidos: estado dentro del conjunto válido (NULL permitido).
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (
    delivery_status IS NULL OR delivery_status IN
      ('Confirmado', 'Enviado', 'Entregado', 'Pagado', 'Devolucion', 'Cancelado')
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inventario: cantidad no negativa.
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT chk_inventory_qty_nonneg CHECK (COALESCE(quantity, 0) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
