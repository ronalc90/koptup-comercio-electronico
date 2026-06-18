-- ============================================================================
-- 007_alerts.sql — Alertas persistentes de los agentes IA (T19)
-- ============================================================================
-- Idempotente. Un job (cron) corre los agentes por negocio y guarda las alertas
-- accionables acá. Solo service-role (RLS deny-anon); se consultan vía endpoints
-- server-side acotados por tenant. `alert_key` deduplica (no recrea una alerta
-- que ya está abierta).
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_key   VARCHAR(80) NOT NULL,
  kind        VARCHAR(20),
  severity    VARCHAR(20),
  title       TEXT,
  message     TEXT,
  source      VARCHAR(20),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(tenant_id, resolved_at);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON alerts;
-- (sin CREATE POLICY ⇒ anon denegado; service role omite RLS)
