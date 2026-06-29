-- ============================================================================
-- 017_user_registration.sql — Auto-registro de usuarios/negocios con aprobación
-- ============================================================================
-- Habilita dos flujos de registro, ambos en estado PENDIENTE hasta aprobación:
--   A) NEGOCIO nuevo: crea un tenant prospecto (active=false, source='self_signup')
--      + su usuario admin (status='pending'). Lo aprueba el SUPERADMIN.
--   B) EMPLEADO a un negocio existente: vía invite_code del tenant, crea un
--      usuario (status='pending', role='member') en ese tenant. Lo aprueba el
--      ADMIN de ese negocio.
--
-- ADITIVA e IDEMPOTENTE. NO rompe lo existente:
--   - Todos los usuarios actuales quedan status='approved' (login intacto).
--   - Todos los tenants actuales quedan source='manual' (no se purgan).
-- El borrado automático de rechazados (30 días) lo hace un cron aparte.
-- Siguiente número de migración tras esta: 018.
-- ============================================================================

-- 1) Estado de aprobación en users -------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS status      VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Retrocompatibilidad: todo lo preexistente queda aprobado.
UPDATE users SET status = 'approved' WHERE status IS NULL OR status = '';

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_status
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invariante: rejected_at se llena EXACTAMENTE cuando el estado es 'rejected'.
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_users_rejected_at
    CHECK ((status = 'rejected') = (rejected_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_rejected_at ON users(rejected_at) WHERE rejected_at IS NOT NULL;

-- 2) Origen del tenant (para listar/purgar solo los de auto-registro) ----------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';
UPDATE tenants SET source = 'manual' WHERE source IS NULL OR source = '';

DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT chk_tenants_source
    CHECK (source IN ('manual', 'self_signup'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Código de invitación del tenant (modo B: empleados se unen) ---------------
-- Token único y opcional; el admin del negocio lo genera/regenera. Un registro
-- con un invite_code válido crea un usuario pendiente en ESE tenant.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_invite_code
  ON tenants(invite_code) WHERE invite_code IS NOT NULL;
