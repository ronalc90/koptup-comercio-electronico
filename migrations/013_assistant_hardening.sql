-- ============================================================================
-- 013_assistant_hardening.sql — Endurecimiento del chat (núcleo AI-first)
-- ============================================================================
-- El chat es el corazón del producto y escribe a la BD vía el navegador
-- (PostgREST con el token del tenant). Por eso las reglas críticas viven AQUÍ:
-- valen igual para la UI, el asistente y la API directa. Nadie cuela una
-- barbaridad por una redacción astuta si la base la rechaza.
--
--   1) orders.quantity: cantidad del pedido. Permite restaurar el stock EXACTO
--      en una devolución (antes se asumía 1 fijo). Default 1 → filas viejas ok.
--   2) order_code único por negocio: cierra la carrera que generaba códigos
--      duplicados al crear dos pedidos el mismo día (el cliente reintenta con el
--      siguiente secuencial ante el 23505).
--   3) expenses.amount >= 0: la 009 cubrió products/orders/inventory pero dejó
--      fuera los gastos.
--
-- Idempotente. Requiere haber corrido 002 (tenant_id) y 009/010 (constraints).
-- ============================================================================

-- 1) Cantidad del pedido --------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT chk_orders_quantity_pos CHECK (COALESCE(quantity, 1) >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) order_code único por negocio ----------------------------------------------
-- Se crea sobre (tenant_id, order_code) si existe tenant_id (migración 002), o
-- sobre (order_code) si todavía no. Índice PARCIAL: ignora order_code NULL.
-- Si ya hay códigos duplicados en los datos, la creación del índice fallaría;
-- lo envolvemos para NO abortar la migración: el admin de-duplica y re-corre.
DO $$
DECLARE has_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'tenant_id'
  ) INTO has_tenant;

  BEGIN
    IF has_tenant THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_code
        ON orders(tenant_id, order_code) WHERE order_code IS NOT NULL;
    ELSE
      CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_code
        ON orders(order_code) WHERE order_code IS NOT NULL;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'uq_orders_tenant_code NO creado: hay order_code duplicados. De-duplica y re-corre 013.';
  END;
END $$;

-- 3) Gastos no negativos --------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_nonneg CHECK (COALESCE(amount, 0) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
