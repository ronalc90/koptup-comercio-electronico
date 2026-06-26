-- ============================================================================
-- 015_charges_idempotency.sql — Idempotencia de pagos Stripe
-- ============================================================================
-- Stripe puede REENVIAR el mismo evento de webhook (lo dice su doc). Sin defensa,
-- cada reenvío de `invoice.paid` registraría otro cargo y EXTENDERÍA la licencia
-- otra vez (doble cobro). Guardamos el id del evento en el cargo con índice único
-- parcial: el segundo insert choca (23505) y el webhook lo trata como ya
-- procesado, sin volver a cobrar ni extender. Aditivo e idempotente; los pagos
-- manuales del superadmin dejan la columna en NULL (no afectados).
-- ============================================================================

ALTER TABLE charges ADD COLUMN IF NOT EXISTS stripe_event_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_charges_stripe_event
  ON charges(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
