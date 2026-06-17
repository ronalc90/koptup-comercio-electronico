-- ============================================================================
-- 006_audit_log.sql — Bitácora de operaciones sensibles (T16)
-- ============================================================================
-- Idempotente. Registra acciones de dinero/seguridad: pagos, cambios de plan,
-- alta/edición de usuarios, creación/estado de negocios. Solo service-role
-- (RLS deny-anon); se consulta vía endpoints server-side acotados por tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  -- Negocio afectado por la acción (NULL para acciones de plataforma sin tenant).
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id    INTEGER,                 -- usuario que ejecutó (users.id)
  actor_name  VARCHAR(120),
  actor_role  VARCHAR(20),
  action      VARCHAR(50) NOT NULL,    -- payment_recorded | plan_changed | tenant_created | tenant_status_changed | user_created | user_updated
  entity      VARCHAR(50),             -- tenant | user | charge
  entity_id   INTEGER,
  detail      JSONB,                   -- valores relevantes (antes/después, montos…)
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON audit_log;
-- (sin CREATE POLICY ⇒ anon denegado; service role omite RLS)
