-- 010_constraints_followup.sql
-- Cierra dos huecos detectados en la revisión de la 009:
--   1) La 009 dejó fuera `payment_cash_bogo` del CHECK de montos no-negativos de
--      orders. Un cliente que escriba directo por PostgREST aún podría setearlo
--      negativo y corromper el cálculo de recaudo/liquidación.
--   2) `charges.amount` no tenía CHECK: un monto <= 0 no tiene sentido de negocio.
-- Idempotente: se puede correr varias veces sin error.

-- 1) Recrear el CHECK de montos de orders incluyendo payment_cash_bogo.
DO $$ BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_money_nonneg;
  ALTER TABLE orders ADD CONSTRAINT chk_orders_money_nonneg CHECK (
    COALESCE(value_to_collect, 0) >= 0 AND
    COALESCE(product_cost, 0) >= 0 AND
    COALESCE(operating_cost, 0) >= 0 AND
    COALESCE(prepaid_amount, 0) >= 0 AND
    COALESCE(payment_cash, 0) >= 0 AND
    COALESCE(payment_cash_bogo, 0) >= 0 AND
    COALESCE(payment_transfer, 0) >= 0
  );
END $$;

-- 2) charges.amount debe ser un entero positivo.
DO $$ BEGIN
  ALTER TABLE charges ADD CONSTRAINT chk_charges_amount_positive CHECK (amount > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
