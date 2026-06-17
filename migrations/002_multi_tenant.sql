-- ============================================================================
-- 002_multi_tenant.sql — Plataforma multi-tenant (Fase 1)
-- ============================================================================
-- Convierte Meraki en una plataforma capaz de servir varios negocios desde
-- una sola instalación. Ejecutar en Supabase → SQL Editor.
--
-- GARANTÍAS DE SEGURIDAD DE DATOS:
--   * Es IDEMPOTENTE: se puede correr varias veces sin romper nada.
--   * Es RETROCOMPATIBLE: la app sigue funcionando ANTES y DESPUÉS de correrlo
--     (la app detecta en runtime si existe la columna `tenant_id`).
--   * Todos los datos existentes quedan asignados al tenant 1 = "meraki".
--   * NO endurece RLS de forma que rompa el cliente actual (anon key). El
--     aislamiento estricto adicional queda documentado al final como ruta de
--     hardening (mover lecturas al servidor / firmar JWT de Supabase).
-- ============================================================================

-- 1) Tabla de tenants ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        VARCHAR(50) UNIQUE NOT NULL,
  logo        TEXT,                       -- emoji, URL o data-uri
  industry    VARCHAR(50),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2) Seed de tenants iniciales -----------------------------------------------
--    El tenant 1 (meraki) es el destino del backfill de todos los datos viejos.
INSERT INTO tenants (id, name, slug, logo, industry)
VALUES (1, 'Tu Tienda Meraki', 'meraki', '🩴', 'calzado')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenants (name, slug, logo, industry)
VALUES ('PrimeraMayo', 'primeramayo', '🏍️', 'motos')
ON CONFLICT (slug) DO NOTHING;

-- Mantener el serial sincronizado tras insertar id=1 explícitamente.
SELECT setval(
  pg_get_serial_sequence('tenants', 'id'),
  GREATEST((SELECT MAX(id) FROM tenants), 1)
);

-- 3) Tabla de usuarios (reemplaza el mapa hardcodeado USERS) ------------------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id) ON DELETE CASCADE,
  -- email es único POR tenant (no global): dos negocios pueden tener el mismo
  -- correo de admin sin colisionar al hacer onboarding.
  email          VARCHAR(120) NOT NULL,
  username       VARCHAR(50),
  password_hash  TEXT NOT NULL,
  role           VARCHAR(20) NOT NULL DEFAULT 'member', -- 'admin' | 'member' | 'viewer'
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users(tenant_id, email);

-- Seed de usuarios existentes (password actual "1234", hash bcrypt real).
-- paola/ronald → admin del tenant meraki; lizeth → member.
INSERT INTO users (tenant_id, email, username, password_hash, role) VALUES
  (1, 'paola@meraki.app',  'paola',  '$2b$10$E8SsViC20Ool9j8wP9.stu4SYl9WtyukRqyeCjwx72jnUKcLR.rki', 'admin'),
  (1, 'ronald@meraki.app', 'ronald', '$2b$10$E8SsViC20Ool9j8wP9.stu4SYl9WtyukRqyeCjwx72jnUKcLR.rki', 'admin'),
  (1, 'lizeth@meraki.app', 'lizeth', '$2b$10$E8SsViC20Ool9j8wP9.stu4SYl9WtyukRqyeCjwx72jnUKcLR.rki', 'member')
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Usuario admin inicial de PrimeraMayo (mismo password "1234" por defecto).
INSERT INTO users (tenant_id, email, username, password_hash, role)
SELECT t.id, 'admin@primeramayo.app', 'primeramayo',
       '$2b$10$E8SsViC20Ool9j8wP9.stu4SYl9WtyukRqyeCjwx72jnUKcLR.rki', 'admin'
FROM tenants t WHERE t.slug = 'primeramayo'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- 4) tenant_id en cada tabla de negocio + backfill a meraki (id=1) ------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products','orders','inventory','settings','expenses'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 1', tbl);
    EXECUTE format('UPDATE %I SET tenant_id = 1 WHERE tenant_id IS NULL', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I(tenant_id)', tbl, tbl);
    -- FK suave: no forzamos ON DELETE para no arrastrar borrados accidentales.
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT fk_%s_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN NULL; -- ya existe
    END;
  END LOOP;
END $$;

-- 5) settings: la clave debe ser única POR tenant, no global -----------------
--    (antes: UNIQUE(key) global; ahora: UNIQUE(tenant_id, key)).
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key;
DROP INDEX IF EXISTS settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_tenant_key ON settings(tenant_id, key);

-- 6) RLS de tenants/users: SOLO service role -------------------------------
--    La anon key (que viaja al navegador) NUNCA debe poder leer `users`
--    (contiene password_hash) ni listar `tenants`. El login y la resolución de
--    tenant usan el service client, que omite RLS. Al habilitar RLS sin crear
--    políticas para anon, el default-deny bloquea a la anon key por completo.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON tenants;
DROP POLICY IF EXISTS "Allow all for anon" ON users;
-- (Sin CREATE POLICY ⇒ anon denegado; service role pasa.)

-- 7) Helper para la ruta de hardening (enforcement en el servidor) -----------
--    Permite a un endpoint server-side fijar el tenant de la sesión con:
--        SELECT set_tenant(<id>);  -- antes de las consultas
--    Las políticas estrictas comentadas abajo lo usan.
CREATE OR REPLACE FUNCTION set_tenant(p_tenant_id integer)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.current_tenant', p_tenant_id::text, true);
$$;

CREATE OR REPLACE FUNCTION current_tenant()
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::integer;
$$;

-- ============================================================================
-- RUTA DE HARDENING (OPCIONAL, NO ACTIVAR CON EL CLIENTE ANON ACTUAL)
-- ----------------------------------------------------------------------------
-- Cuando TODAS las lecturas/escrituras pasen por endpoints server-side que
-- llamen `SELECT set_tenant(:id)` al abrir la conexión, reemplazar las
-- políticas "Allow all for anon" por las siguientes para tener aislamiento
-- forzado por la base de datos (defensa en profundidad):
--
--   DO $$ DECLARE tbl text; BEGIN
--     FOREACH tbl IN ARRAY ARRAY['products','orders','inventory','settings','expenses'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON %I', tbl);
--       EXECUTE format($p$CREATE POLICY tenant_isolation ON %I FOR ALL
--         USING (tenant_id = current_tenant())
--         WITH CHECK (tenant_id = current_tenant())$p$, tbl);
--     END LOOP;
--   END $$;
-- ============================================================================
